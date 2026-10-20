import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, unlinkSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { defaultStorageLimits, StorageCapacity } from '../../../shared/storage-capacity.ts'
import { encodeCanvasPackage } from './canvas-package.mjs'

async function start() {
  const root = mkdtempSync(join(tmpdir(), 'canvas-admission-'))
  const directory = join(root, 'canvas'); mkdirSync(directory)
  const limits = { ...defaultStorageLimits, canvasBytes: 32 * 1024 ** 2, minFreeBytes: 0 }
  const child = spawn(process.execPath, [fileURLToPath(new URL('./desktop-entry.mjs', import.meta.url))], { stdio: 'pipe', windowsHide: true })
  child.stderr.resume()
  const exited = once(child, 'exit')
  const token = randomBytes(32).toString('hex')
  const ready = new Promise((accept, reject) => {
    let pending = ''
    child.once('exit', () => reject(new Error('Child exited before ready')))
    child.stdout.on('data', bytes => { pending += bytes; if (pending.includes('\n')) accept(JSON.parse(pending.split('\n')[0]).url) })
  })
  child.stdin.write(JSON.stringify({ directory, origin: 'http://test.invalid', token, storage: { dataDir: root, limits } }) + '\n')
  const url = await ready
  return { root, directory, limits, async close() { child.stdin.end(); await exited },
    request(path, body) { return fetch(url + path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json' }, body: Buffer.isBuffer(body) ? body : body ? JSON.stringify(body) : undefined }) } }
}

const snapshot = (revision = 0) => ({ operationId: randomUUID(), expectedRevision: revision, sceneBase64: Buffer.from('isolated test scene').toString('base64'), metadata: { formatVersion: 1 } })

test('managed child rejects exhausted canvas quota without changing the head and can retry after space is recovered', { timeout: 20000 }, async () => {
  const service = await start()
  try {
    const canvas = randomUUID()
    assert.equal((await service.request(`/canvases/${canvas}`, snapshot())).status, 200)
    const filler = join(service.directory, 'isolated-quota-fixture')
    const capacity = new StorageCapacity(service.root, service.limits)
    writeFileSync(filler, Buffer.alloc(service.limits.canvasBytes - capacity.usage().groups.canvas.bytes - 1024))
    const next = snapshot(1)
    const rejected = await service.request(`/canvases/${canvas}`, next)
    assert.equal(rejected.status, 507)
    assert.equal((await (await service.request(`/canvases/${canvas}`)).json()).revision, 1)
    unlinkSync(filler)
    assert.equal((await service.request(`/canvases/${canvas}`, next)).status, 200)
    assert.equal((await (await service.request(`/canvases/${canvas}`)).json()).revision, 2)
  } finally { await service.close() }
})

test('native canvas and host use the same cross-process admission lock', { timeout: 20000 }, async () => {
  const service = await start()
  let holder
  try {
    const marker = join(service.root, 'lock-held')
    const script = `import {StorageCapacity} from ${JSON.stringify(new URL('../../../shared/storage-capacity.ts', import.meta.url).href)};import {writeFileSync} from 'node:fs';new StorageCapacity(${JSON.stringify(service.root)}).exclusive(()=>{writeFileSync(${JSON.stringify(marker)},'held');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,2500)})`
    holder = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: 'ignore', windowsHide: true })
    const exited = once(holder, 'exit')
    for (let i = 0; i < 100 && !existsSync(marker); i++) await delay(20)
    assert(existsSync(marker), 'host writer acquired shared lock')
    const canvas = randomUUID(), input = snapshot()
    assert.equal((await service.request(`/canvases/${canvas}`, input)).status, 423)
    await exited
    assert.equal((await service.request(`/canvases/${canvas}`, input)).status, 200)
  } finally { holder?.kill(); await service.close() }
})

test('observer index commit and package staging both retain their old state on quota rejection', { timeout: 20000 }, async () => {
  const service = await start()
  try {
    const external = mkdtempSync(join(tmpdir(), 'canvas-index-fixture-'))
    writeFileSync(join(external, 'first.txt'), 'one')
    const mount = await (await service.request('/mounts', { path: external })).json()
    assert.equal((await service.request(`/mounts/${mount.id}/poll`, {})).status, 200)
    const previous = await (await service.request(`/mounts/${mount.id}/files`)).json()
    assert.equal(previous.entries.length, 1)
    writeFileSync(join(external, 'second.txt'), 'two')
    const scene = readFileSync(new URL('./fixtures/revision-1.fig', import.meta.url))
    const canvasId = randomUUID(), operation = randomUUID()
    const payload = encodeCanvasPackage({ canvasId, revisions: [{ canvasId, revision: 1,
      scene, sceneHash: createHash('sha256').update(scene).digest('hex'), metadata: { formatVersion: 1 }, createdAt: new Date().toISOString() }],
      references: { formatVersion: 1, mounts: [], files: [] }, layout: { formatVersion: 1, panels: { layers: true, properties: true } } })
    const filler = join(service.directory, 'isolated-quota-fixture')
    const capacity = new StorageCapacity(service.root, service.limits)
    writeFileSync(filler, Buffer.alloc(service.limits.canvasBytes - capacity.usage().groups.canvas.bytes - 1024))
    assert.equal((await service.request(`/mounts/${mount.id}/scan`, {})).status, 507)
    assert.deepEqual(await (await service.request(`/mounts/${mount.id}/files`)).json(), previous)
    assert.equal((await service.request(`/package-imports/${operation}`, payload)).status, 507)
    assert.deepEqual(await (await service.request('/package-imports')).json(), [])
    unlinkSync(filler)
    assert.equal((await service.request(`/mounts/${mount.id}/scan`, {})).status, 200)
    assert.equal((await (await service.request(`/mounts/${mount.id}/files`)).json()).entries.length, 2)
    assert.equal((await service.request(`/package-imports/${operation}`, payload)).status, 200)
    assert.equal((await service.request(`/package-imports/${operation}/resume`, {})).status, 200)
    assert.equal((await (await service.request(`/canvases/${canvasId}`)).json()).revision, 1)
  } finally { await service.close() }
})
