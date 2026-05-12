import type { ClientChannel } from 'ssh2'
import { randomUUID } from 'node:crypto'
import { SshPool } from './lib/ssh-pool'
import { SftpOps } from './lib/sftp-ops'
import { HostStore, scanSshKeys } from './lib/host-store'
import { makeError } from './lib/error-map'
import type { HostMeta, HostGroup, HostsSnapshot, SftpAuthBundle } from './shared/types'

interface MainCtx {
  id: string
  logger: { info(...a: unknown[]): void; warn(...a: unknown[]): void; error(...a: unknown[]): void }
  ipc: {
    handle(
      channel: string,
      fn: (args: unknown, sender?: unknown) => unknown | Promise<unknown>,
    ): { dispose(): void }
    emit(channel: string, payload: unknown): void
  }
  settings: {
    get<T = unknown>(key: string): T | undefined
    onChange(cb: (key: string, value: unknown) => void): { dispose(): void }
  }
  globalState: {
    get<T = unknown>(key: string, def?: T): T | undefined
    set(key: string, value: unknown): Promise<void>
  }
  providedServices: {
    publish<T>(id: string, impl: T): { dispose(): void }
  }
  subscribe(d: { dispose(): void } | (() => void)): void
}

interface ShellSession {
  id: string
  hostId: string
  stream: ClientChannel
}

const shells = new Map<string, ShellSession>()

export async function activate(ctx: MainCtx): Promise<void> {
  ctx.logger.info('remote-ssh main activating')

  const pool = new SshPool()
  const ops = new SftpOps(pool)
  const store = new HostStore({
    get: (key, def) => ctx.globalState.get(key, def),
    set: (key, value) => ctx.globalState.set(key, value),
  })
  await store.load()

  applySettings(ctx, pool, ops)
  ctx.subscribe(
    ctx.settings.onChange(() => {
      applySettings(ctx, pool, ops)
    }),
  )

  pool.setEventSink({
    onDisconnected: (hostId, reason) => {
      try {
        ctx.ipc.emit('sftp:disconnected', { hostId, reason })
      } catch {
        // ignore
      }
    },
  })
  pool.startGc()
  ctx.subscribe(() => pool.stopGc())

  ctx.subscribe(
    store.onChange((snapshot) => {
      ctx.ipc.emit('hosts:changed', snapshot)
    }),
  )

  registerHostHandlers(ctx, store)
  registerShellHandlers(ctx, pool, store)
  registerSftpHandlers(ctx, ops, pool)

  publishMainServices(ctx, store, pool, ops)

  ctx.subscribe(() => {
    for (const session of shells.values()) {
      try {
        session.stream.end()
      } catch {
        // ignore
      }
    }
    shells.clear()
    pool.disconnectAll()
  })

  ctx.logger.info('remote-ssh main activated')
}

export function deactivate(): void {
  for (const session of shells.values()) {
    try {
      session.stream.end()
    } catch {
      // ignore
    }
  }
  shells.clear()
}

function applySettings(ctx: MainCtx, pool: SshPool, ops: SftpOps): void {
  const idleTimeoutSec = ctx.settings.get<number>('idleTimeoutSec') ?? 300
  const keepaliveSec = ctx.settings.get<number>('keepaliveIntervalSec') ?? 30
  const readyTimeoutMs = ctx.settings.get<number>('readyTimeoutMs') ?? 10_000
  const sftpOpenTimeoutMs = ctx.settings.get<number>('sftpOpenTimeoutMs') ?? 15_000
  const maxEntriesPerDir = ctx.settings.get<number>('maxEntriesPerDir') ?? 5000
  pool.setConfig({
    idleTimeoutMs: Math.max(60, idleTimeoutSec) * 1000,
    keepaliveIntervalMs: Math.max(5, keepaliveSec) * 1000,
    readyTimeoutMs: Math.max(1000, readyTimeoutMs),
    sftpOpenTimeoutMs: Math.max(1000, sftpOpenTimeoutMs),
  })
  ops.setConfig({ maxEntriesPerDir: Math.max(100, maxEntriesPerDir) })
}

function registerHostHandlers(ctx: MainCtx, store: HostStore): void {
  ctx.subscribe(ctx.ipc.handle('hosts:list', () => store.snapshot()))
  ctx.subscribe(
    ctx.ipc.handle('hosts:save', async (a) => {
      const args = a as { host: Partial<HostMeta> }
      const saved = await store.saveHost(args.host)
      return saved
    }),
  )
  ctx.subscribe(
    ctx.ipc.handle('hosts:delete', async (a) => {
      const id = (a as { id: string }).id
      await store.deleteHost(id)
    }),
  )
  ctx.subscribe(
    ctx.ipc.handle('hosts:set-group', async (a) => {
      const args = a as { hostId: string; groupId: string | null }
      await store.setHostGroup(args.hostId, args.groupId)
    }),
  )
  ctx.subscribe(
    ctx.ipc.handle('hosts:reorder', async (a) => {
      const args = a as {
        hostId: string
        beforeHostId: string | null
        groupId: string | null
      }
      await store.reorderHost(args.hostId, args.beforeHostId, args.groupId)
    }),
  )
  ctx.subscribe(
    ctx.ipc.handle('groups:reorder', async (a) => {
      const args = a as { groupId: string; beforeGroupId: string | null }
      await store.reorderGroup(args.groupId, args.beforeGroupId)
    }),
  )
  ctx.subscribe(ctx.ipc.handle('hosts:list-keys', () => scanSshKeys()))
  ctx.subscribe(
    ctx.ipc.handle('groups:save', async (a) => {
      const args = a as { group: Partial<HostGroup> }
      const saved = await store.saveGroup(args.group)
      return saved
    }),
  )
  ctx.subscribe(
    ctx.ipc.handle('groups:delete', async (a) => {
      await store.deleteGroup((a as { id: string }).id)
    }),
  )
  ctx.subscribe(
    ctx.ipc.handle('hosts:touch', async (a) => {
      await store.touchLastUsed((a as { hostId: string }).hostId)
    }),
  )
}

function registerShellHandlers(ctx: MainCtx, pool: SshPool, store: HostStore): void {
  ctx.subscribe(
    ctx.ipc.handle('shell:spawn', async (a) => {
      const args = a as { auth: SftpAuthBundle; rows: number; cols: number }
      if (!args || !args.auth) throw makeError('EGENERIC', 'shell:spawn requires { auth, rows, cols }')
      await pool.ensureConnected(args.auth)
      const stream = await pool.openShell(args.auth.hostId, {
        rows: args.rows,
        cols: args.cols,
      })
      const sessionId = 's_' + randomUUID().replace(/-/g, '')
      shells.set(sessionId, { id: sessionId, hostId: args.auth.hostId, stream })
      pool.registerShell(args.auth.hostId, sessionId)
      const dataChannel = `shell:data:${sessionId}`
      const exitChannel = `shell:exit:${sessionId}`
      stream.on('data', (chunk: Buffer) => {
        try {
          ctx.ipc.emit(dataChannel, chunk.toString('utf-8'))
        } catch {
          // ignore
        }
      })
      stream.stderr.on('data', (chunk: Buffer) => {
        try {
          ctx.ipc.emit(dataChannel, chunk.toString('utf-8'))
        } catch {
          // ignore
        }
      })
      stream.on('close', () => {
        shells.delete(sessionId)
        pool.unregisterShell(args.auth.hostId, sessionId)
        try {
          ctx.ipc.emit(exitChannel, null)
        } catch {
          // ignore
        }
      })
      const host = store.getHost(args.auth.hostId)
      const banner = host
        ? `connected to ${host.user}@${host.host}:${host.port}`
        : `connected to ${args.auth.user}@${args.auth.host}:${args.auth.port}`
      void store.touchLastUsed(args.auth.hostId)
      return { sessionId, banner }
    }),
  )
  ctx.subscribe(
    ctx.ipc.handle('shell:write', (a) => {
      const args = a as { sessionId: string; data: string }
      const session = shells.get(args.sessionId)
      if (!session) throw makeError('ENOENT', `unknown shell ${args.sessionId}`)
      session.stream.write(args.data)
    }),
  )
  ctx.subscribe(
    ctx.ipc.handle('shell:resize', (a) => {
      const args = a as { sessionId: string; rows: number; cols: number }
      const session = shells.get(args.sessionId)
      if (!session) return
      pool.touch(session.hostId)
      try {
        session.stream.setWindow(args.rows, args.cols, 0, 0)
      } catch {
        // ignore
      }
    }),
  )
  ctx.subscribe(
    ctx.ipc.handle('shell:kill', (a) => {
      const sessionId = (a as { sessionId: string }).sessionId
      const session = shells.get(sessionId)
      if (!session) return
      try {
        session.stream.end()
      } catch {
        // ignore
      }
      shells.delete(sessionId)
      pool.unregisterShell(session.hostId, sessionId)
    }),
  )
}

function registerSftpHandlers(ctx: MainCtx, ops: SftpOps, pool: SshPool): void {
  const ensure = async (hostId: string): Promise<void> => {
    const ok = await pool.ensureReady(hostId)
    if (!ok) throw makeError('EHOSTLOST', `not connected to ${hostId}`)
  }
  const guard = <A extends { hostId: string }, R>(
    fn: (a: A) => Promise<R>,
  ) => async (a: unknown): Promise<R> => {
    const args = a as A
    await ensure(args.hostId)
    return fn(args)
  }

  ctx.subscribe(
    ctx.ipc.handle('sftp:connect', async (a) => {
      const args = a as { auth: SftpAuthBundle }
      if (!args || !args.auth) throw makeError('EGENERIC', 'sftp:connect requires { auth }')
      await pool.ensureConnected(args.auth)
      return { connected: true as const }
    }),
  )
  ctx.subscribe(
    ctx.ipc.handle('sftp:disconnect', (a) => {
      pool.disconnect((a as { hostId: string }).hostId)
    }),
  )
  ctx.subscribe(
    ctx.ipc.handle('sftp:status', (a) => pool.status((a as { hostId: string }).hostId)),
  )
  ctx.subscribe(
    ctx.ipc.handle('sftp:register-use', (a) => {
      const args = a as { hostId: string; refId: string }
      pool.registerSftpUse(args.hostId, args.refId)
    }),
  )
  ctx.subscribe(
    ctx.ipc.handle('sftp:unregister-use', (a) => {
      const args = a as { hostId: string; refId: string }
      pool.unregisterSftpUse(args.hostId, args.refId)
    }),
  )
  ctx.subscribe(ctx.ipc.handle('sftp:list', guard((a: { hostId: string; cwd: string; showHidden: boolean }) => ops.list(a))))
  ctx.subscribe(ctx.ipc.handle('sftp:stat', guard((a: { hostId: string; path: string }) => ops.stat(a))))
  ctx.subscribe(ctx.ipc.handle('sftp:home', guard((a: { hostId: string }) => ops.home(a.hostId))))
  ctx.subscribe(ctx.ipc.handle('sftp:realpath', guard((a: { hostId: string; path: string }) => ops.realpath(a))))
  ctx.subscribe(ctx.ipc.handle('sftp:mkdir', guard((a: { hostId: string; path: string }) => ops.mkdir(a))))
  ctx.subscribe(ctx.ipc.handle('sftp:create-file', guard((a: { hostId: string; path: string }) => ops.createFile(a))))
  ctx.subscribe(ctx.ipc.handle('sftp:rename', guard((a: { hostId: string; from: string; to: string }) => ops.rename(a))))
  ctx.subscribe(ctx.ipc.handle('sftp:remove', guard((a: { hostId: string; path: string; recursive: boolean }) => ops.remove(a))))
  ctx.subscribe(ctx.ipc.handle('sftp:copy', guard((a: { hostId: string; from: string; to: string; recursive: boolean }) => ops.copy(a))))
  ctx.subscribe(ctx.ipc.handle('sftp:move', guard((a: { hostId: string; from: string; to: string }) => ops.move(a))))
  ctx.subscribe(ctx.ipc.handle('sftp:upload', guard((a: { hostId: string; localPath: string; remotePath: string }) => ops.upload(a))))
  ctx.subscribe(ctx.ipc.handle('sftp:download', guard((a: { hostId: string; remotePath: string; localPath: string }) => ops.download(a))))
  ctx.subscribe(ctx.ipc.handle('sftp:read', guard((a: { hostId: string; path: string }) => ops.read(a))))
  ctx.subscribe(ctx.ipc.handle('sftp:write', guard((a: { hostId: string; path: string; content: string }) => ops.write(a))))
}

function publishMainServices(
  ctx: MainCtx,
  store: HostStore,
  _pool: SshPool,
  _ops: SftpOps,
): void {
  const hostRegistryMain = {
    listHosts: async (): Promise<HostMeta[]> => store.listHosts(),
    listGroups: async (): Promise<HostGroup[]> => store.listGroups(),
    getHost: async (id: string): Promise<HostMeta | null> => store.getHost(id),
    listSshKeys: () => scanSshKeys(),
    onHostsChanged: (cb: (snapshot: HostsSnapshot) => void): { dispose(): void } => {
      const off = store.onChange(cb)
      return { dispose: off }
    },
  }
  ctx.subscribe(ctx.providedServices.publish('host-registry', hostRegistryMain))
}
