import { Client, type ClientChannel, type ConnectConfig, type SFTPWrapper } from 'ssh2'
import { makeError } from './error-map'
import { readPrivateKey } from './auth-bundle'
import type { SftpAuthBundle } from '../shared/types'

export interface PoolEntry {
  client: Client
  sftp: SFTPWrapper | null
  sftpOpening: Promise<SFTPWrapper> | null
  ready: boolean
  lastUsedMs: number
  lastError: string | null
  connectingPromise: Promise<void> | null
  shellSessions: Set<string>
  sftpRefs: Set<string>
  lastAuth: SftpAuthBundle | null
}

export interface PoolConfig {
  idleTimeoutMs: number
  keepaliveIntervalMs: number
  readyTimeoutMs: number
  sftpOpenTimeoutMs: number
}

export interface PoolEventSink {
  onDisconnected?(hostId: string, reason: string | null): void
}

const DEFAULT_CONFIG: PoolConfig = {
  idleTimeoutMs: 300_000,
  keepaliveIntervalMs: 30_000,
  readyTimeoutMs: 10_000,
  sftpOpenTimeoutMs: 15_000,
}

export class SshPool {
  private entries = new Map<string, PoolEntry>()
  private gcTimer: NodeJS.Timeout | null = null
  private config: PoolConfig = { ...DEFAULT_CONFIG }
  private clientFactory: () => Client = () => new Client()
  private sink: PoolEventSink = {}

  setEventSink(sink: PoolEventSink): void {
    this.sink = sink
  }

  setConfig(partial: Partial<PoolConfig>): void {
    this.config = { ...this.config, ...partial }
  }

  setClientFactory(factory: () => Client): void {
    this.clientFactory = factory
  }

  startGc(intervalMs = 60_000): void {
    if (this.gcTimer) return
    this.gcTimer = setInterval(() => this.gcIdle(), intervalMs)
  }

  stopGc(): void {
    if (this.gcTimer) {
      clearInterval(this.gcTimer)
      this.gcTimer = null
    }
  }

  size(): number {
    return this.entries.size
  }

  status(hostId: string): { connected: boolean; lastError: string | null } {
    const e = this.entries.get(hostId)
    return {
      connected: Boolean(e?.ready),
      lastError: e?.lastError ?? null,
    }
  }

  async ensureConnected(auth: SftpAuthBundle): Promise<PoolEntry> {
    const existing = this.entries.get(auth.hostId)
    if (existing?.ready) {
      existing.lastUsedMs = Date.now()
      return existing
    }
    if (existing?.connectingPromise) {
      await existing.connectingPromise
      const e = this.entries.get(auth.hostId)
      if (!e?.ready) throw makeError('EHOSTLOST', 'connect failed')
      return e
    }
    return this.connect(auth)
  }

  private async connect(auth: SftpAuthBundle): Promise<PoolEntry> {
    const entry: PoolEntry = {
      client: null as unknown as Client,
      sftp: null,
      sftpOpening: null,
      ready: false,
      lastUsedMs: Date.now(),
      lastError: null,
      connectingPromise: null,
      shellSessions: new Set(),
      sftpRefs: new Set(),
      lastAuth: auth,
    }
    this.entries.set(auth.hostId, entry)

    const promise = this.performConnection(auth, entry)
    entry.connectingPromise = promise

    try {
      await promise
    } finally {
      entry.connectingPromise = null
    }
    return entry
  }

  private async performConnection(auth: SftpAuthBundle, entry: PoolEntry): Promise<void> {
    const cfg = await this.buildConnectConfig(auth)
    const client = this.clientFactory()
    entry.client = client
    return new Promise<void>((resolve, reject) => {
      let settled = false
      const settle = (err: Error | null): void => {
        if (settled) return
        settled = true
        client.removeListener('ready', onReady)
        client.removeListener('error', onError)
        if (err) reject(err)
        else resolve()
      }
      const onReady = (): void => {
        entry.ready = true
        entry.lastUsedMs = Date.now()
        settle(null)
      }
      const onError = (err: Error): void => {
        entry.lastError = err.message
        const wasReady = entry.ready
        entry.ready = false
        this.entries.delete(auth.hostId)
        settle(makeError('EHOSTAUTH', err.message))
        if (wasReady) this.notifyDisconnected(auth.hostId, err.message)
      }
      const onTerminate = (label: 'end' | 'close') => (): void => {
        const wasReady = entry.ready
        entry.ready = false
        this.entries.delete(auth.hostId)
        if (wasReady) this.notifyDisconnected(auth.hostId, label)
      }
      client.once('ready', onReady)
      client.once('error', onError)
      client.once('end', onTerminate('end'))
      client.once('close', onTerminate('close'))
      try {
        client.connect(cfg)
      } catch (err) {
        this.entries.delete(auth.hostId)
        settle(makeError('EHOSTAUTH', (err as Error).message))
      }
    })
  }

  private notifyDisconnected(hostId: string, reason: string | null): void {
    try {
      this.sink.onDisconnected?.(hostId, reason)
    } catch {
      // ignore sink errors
    }
  }

  async withSftp<T>(hostId: string, fn: (sftp: SFTPWrapper) => Promise<T>): Promise<T> {
    const entry = this.entries.get(hostId)
    if (!entry || !entry.ready) {
      throw makeError('EHOSTLOST', `not connected to ${hostId}`)
    }
    if (!entry.sftp) {
      if (!entry.sftpOpening) {
        entry.sftpOpening = this.openSftp(entry).finally(() => {
          entry.sftpOpening = null
        })
      }
      entry.sftp = await entry.sftpOpening
    }
    entry.lastUsedMs = Date.now()
    try {
      const result = await fn(entry.sftp)
      entry.lastUsedMs = Date.now()
      return result
    } catch (err) {
      const code = (err as { code?: number | string }).code
      if (code === 2) throw makeError('ENOENT', (err as Error).message)
      if (code === 3) throw makeError('EACCES', (err as Error).message)
      if (code === 4 || code === 11) throw makeError('EEXIST', (err as Error).message)
      throw makeError('EGENERIC', (err as Error).message)
    }
  }

  private openSftp(entry: PoolEntry): Promise<SFTPWrapper> {
    const timeoutMs = this.config.sftpOpenTimeoutMs
    return new Promise<SFTPWrapper>((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        entry.lastError = 'sftp open timeout'
        reject(makeError('EHOSTLOST', `sftp open timeout after ${timeoutMs}ms`))
      }, timeoutMs)
      entry.client.sftp((err, sftp) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (err) {
          entry.lastError = err.message
          reject(makeError('EHOSTLOST', err.message))
          return
        }
        resolve(sftp)
      })
    })
  }

  async openShell(
    hostId: string,
    opts: { rows: number; cols: number; term?: string },
  ): Promise<ClientChannel> {
    const entry = this.entries.get(hostId)
    if (!entry || !entry.ready) {
      throw makeError('EHOSTLOST', `not connected to ${hostId}`)
    }
    entry.lastUsedMs = Date.now()
    return new Promise<ClientChannel>((resolve, reject) => {
      entry.client.shell(
        {
          rows: opts.rows,
          cols: opts.cols,
          term: opts.term ?? 'xterm-256color',
        },
        (err, stream) => {
          if (err) {
            reject(makeError('EGENERIC', err.message))
            return
          }
          entry.lastUsedMs = Date.now()
          resolve(stream)
        },
      )
    })
  }

  registerShell(hostId: string, sessionId: string): void {
    const e = this.entries.get(hostId)
    if (!e) return
    e.shellSessions.add(sessionId)
    e.lastUsedMs = Date.now()
  }

  unregisterShell(hostId: string, sessionId: string): void {
    const e = this.entries.get(hostId)
    if (!e) return
    e.shellSessions.delete(sessionId)
    e.lastUsedMs = Date.now()
  }

  registerSftpUse(hostId: string, refId: string): void {
    const e = this.entries.get(hostId)
    if (!e) return
    e.sftpRefs.add(refId)
    e.lastUsedMs = Date.now()
  }

  unregisterSftpUse(hostId: string, refId: string): void {
    const e = this.entries.get(hostId)
    if (!e) return
    e.sftpRefs.delete(refId)
    e.lastUsedMs = Date.now()
  }

  touch(hostId: string): void {
    const e = this.entries.get(hostId)
    if (!e) return
    e.lastUsedMs = Date.now()
  }

  async ensureReady(hostId: string): Promise<boolean> {
    const existing = this.entries.get(hostId)
    if (existing?.ready) {
      existing.lastUsedMs = Date.now()
      return true
    }
    const auth = existing?.lastAuth ?? null
    if (!auth) return false
    try {
      await this.ensureConnected(auth)
      return true
    } catch {
      return false
    }
  }

  disconnect(hostId: string): void {
    const entry = this.entries.get(hostId)
    if (!entry) return
    const wasReady = entry.ready
    entry.ready = false
    try {
      entry.client.end()
    } catch {
      // ignore
    }
    this.entries.delete(hostId)
    if (wasReady) this.notifyDisconnected(hostId, 'disconnect')
  }

  disconnectAll(): void {
    for (const hostId of Array.from(this.entries.keys())) {
      this.disconnect(hostId)
    }
  }

  private gcIdle(): void {
    const now = Date.now()
    for (const [hostId, entry] of this.entries) {
      if (entry.shellSessions.size > 0) continue
      if (entry.sftpRefs.size > 0) continue
      if (now - entry.lastUsedMs > this.config.idleTimeoutMs) {
        this.disconnect(hostId)
      }
    }
  }

  private async buildConnectConfig(auth: SftpAuthBundle): Promise<ConnectConfig> {
    const cfg: ConnectConfig = {
      host: auth.host,
      port: auth.port,
      username: auth.user,
      readyTimeout: this.config.readyTimeoutMs,
      keepaliveInterval: this.config.keepaliveIntervalMs,
    }
    if (auth.auth === 'agent') {
      const sock = process.env.SSH_AUTH_SOCK
      if (!sock) throw makeError('EHOSTAUTH', 'SSH_AUTH_SOCK not set; ssh-agent unavailable')
      cfg.agent = sock
    } else if (auth.auth === 'password') {
      if (!auth.password) throw makeError('EVAULTLOCKED', 'no password available')
      cfg.password = auth.password
    } else if (auth.auth === 'key') {
      if (!auth.identityPath) throw makeError('EHOSTAUTH', 'identityPath missing for key auth')
      cfg.privateKey = await readPrivateKey(auth.identityPath)
    }
    return cfg
  }
}
