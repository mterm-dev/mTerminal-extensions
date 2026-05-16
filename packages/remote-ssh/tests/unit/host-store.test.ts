import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fsp } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { HostStore, normalizeHost, normalizeGroup } from '../../src/lib/host-store'

async function makeTempDir(): Promise<string> {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'remote-ssh-host-store-'))
}

describe('normalizeHost', () => {
  it('coerces invalid auth to "key"', () => {
    const h = normalizeHost({ auth: 'invalid' as unknown as 'key' })
    expect(h.auth).toBe('key')
  })

  it('forces savePassword=false when auth is not password', () => {
    const h = normalizeHost({ auth: 'key', savePassword: true })
    expect(h.savePassword).toBe(false)
  })

  it('clamps port to 1..65535', () => {
    expect(normalizeHost({ port: 0 }).port).toBe(1)
    expect(normalizeHost({ port: 99999 }).port).toBe(65535)
    expect(normalizeHost({ port: 22 }).port).toBe(22)
    expect(normalizeHost({}).port).toBe(22)
  })

  it('preserves identityPath when provided', () => {
    const h = normalizeHost({ identityPath: '/home/x/.ssh/id_ed25519' })
    expect(h.identityPath).toBe('/home/x/.ssh/id_ed25519')
  })

  it('drops empty identityPath', () => {
    const h = normalizeHost({ identityPath: '' })
    expect(h.identityPath).toBeUndefined()
  })

  it('generates h_ id when missing', () => {
    const h = normalizeHost({})
    expect(h.id.startsWith('h_')).toBe(true)
  })
})

describe('normalizeGroup', () => {
  it('defaults accent to blue when invalid', () => {
    const g = normalizeGroup({ accent: 'fuchsia' as unknown as 'blue' })
    expect(g.accent).toBe('blue')
  })

  it('preserves valid accent', () => {
    const g = normalizeGroup({ accent: 'red' })
    expect(g.accent).toBe('red')
  })
})

describe('HostStore', () => {
  let dir: string
  let hs: HostStore

  beforeEach(async () => {
    dir = await makeTempDir()
    hs = new HostStore(dir)
    await hs.load()
  })

  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true })
  })

  it('loads empty when file is missing', () => {
    expect(hs.listHosts()).toEqual([])
    expect(hs.listGroups()).toEqual([])
  })

  it('saves and lists a host', async () => {
    const saved = await hs.saveHost({
      name: 'srv',
      host: 'example.com',
      port: 22,
      user: 'root',
      auth: 'key',
      identityPath: '/key',
    })
    expect(saved.id.startsWith('h_')).toBe(true)
    expect(hs.listHosts()).toHaveLength(1)
    expect(hs.getHost(saved.id)).toEqual(saved)
  })

  it('updates a host by id', async () => {
    const a = await hs.saveHost({ id: 'h_x', host: 'one', user: 'u', auth: 'agent' })
    expect(a.host).toBe('one')
    const b = await hs.saveHost({ id: 'h_x', host: 'two', user: 'u', auth: 'agent' })
    expect(b.host).toBe('two')
    expect(hs.listHosts()).toHaveLength(1)
  })

  it('deletes a host', async () => {
    const saved = await hs.saveHost({ host: 'x', user: 'u', auth: 'agent' })
    await hs.deleteHost(saved.id)
    expect(hs.getHost(saved.id)).toBeNull()
  })

  it('saves group then deletes ungrouping its hosts', async () => {
    const g = await hs.saveGroup({ name: 'team', accent: 'red', collapsed: false })
    const h = await hs.saveHost({
      host: 'x',
      user: 'u',
      auth: 'agent',
      groupId: g.id,
    })
    expect(hs.getHost(h.id)?.groupId).toBe(g.id)
    await hs.deleteGroup(g.id)
    expect(hs.getHost(h.id)?.groupId).toBeNull()
    expect(hs.listGroups()).toEqual([])
  })

  it('emits onChange on save and delete', async () => {
    let count = 0
    hs.onChange(() => count++)
    await hs.saveHost({ host: 'x', user: 'u', auth: 'agent' })
    await hs.saveHost({ host: 'y', user: 'u', auth: 'agent' })
    expect(count).toBe(2)
  })

  it('persists data to disk across instances', async () => {
    await hs.saveHost({ id: 'h_p', host: 'p', user: 'u', auth: 'agent' })
    const fresh = new HostStore(dir)
    await fresh.load()
    expect(fresh.getHost('h_p')?.host).toBe('p')
  })

  it('writes hosts.json with hosts and groups arrays', async () => {
    await hs.saveHost({ id: 'h_a', host: 'a', user: 'u', auth: 'agent' })
    await hs.saveGroup({ id: 'g_a', name: 'team', accent: 'blue', collapsed: false })
    const raw = await fsp.readFile(path.join(dir, 'hosts.json'), 'utf-8')
    const parsed = JSON.parse(raw) as { hosts: unknown[]; groups: unknown[] }
    expect(parsed.hosts).toHaveLength(1)
    expect(parsed.groups).toHaveLength(1)
  })

  it('setHostGroup reassigns', async () => {
    const g = await hs.saveGroup({ name: 'g' })
    const h = await hs.saveHost({ host: 'x', user: 'u', auth: 'agent' })
    await hs.setHostGroup(h.id, g.id)
    expect(hs.getHost(h.id)?.groupId).toBe(g.id)
    await hs.setHostGroup(h.id, null)
    expect(hs.getHost(h.id)?.groupId).toBeNull()
  })

  it('reorderHost moves host before another and changes group', async () => {
    const a = await hs.saveHost({ host: 'a', user: 'u', auth: 'agent' })
    const b = await hs.saveHost({ host: 'b', user: 'u', auth: 'agent' })
    const c = await hs.saveHost({ host: 'c', user: 'u', auth: 'agent' })
    expect(hs.listHosts().map((h) => h.id)).toEqual([a.id, b.id, c.id])
    await hs.reorderHost(c.id, a.id, null)
    expect(hs.listHosts().map((h) => h.id)).toEqual([c.id, a.id, b.id])
    const g = await hs.saveGroup({ name: 'g' })
    await hs.reorderHost(a.id, null, g.id)
    expect(hs.getHost(a.id)?.groupId).toBe(g.id)
  })

  it('reorderGroup moves group before another and to end', async () => {
    const g1 = await hs.saveGroup({ name: 'one' })
    const g2 = await hs.saveGroup({ name: 'two' })
    const g3 = await hs.saveGroup({ name: 'three' })
    expect(hs.listGroups().map((g) => g.id)).toEqual([g1.id, g2.id, g3.id])
    await hs.reorderGroup(g3.id, g1.id)
    expect(hs.listGroups().map((g) => g.id)).toEqual([g3.id, g1.id, g2.id])
    await hs.reorderGroup(g3.id, null)
    expect(hs.listGroups().map((g) => g.id)).toEqual([g1.id, g2.id, g3.id])
  })

  it('touchLastUsed bumps timestamp', async () => {
    const h = await hs.saveHost({ host: 'x', user: 'u', auth: 'agent' })
    expect(h.lastUsed).toBeUndefined()
    await hs.touchLastUsed(h.id)
    expect(hs.getHost(h.id)?.lastUsed).toBeGreaterThan(0)
  })
})
