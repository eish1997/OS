import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'
import { WorkspaceStore } from './workspace-store.mjs'
import { encodeCanvasPackage, decodeCanvasPackage } from './canvas-package.mjs'

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'canvas-package-'))
  const store = new WorkspaceStore(directory), canvasId = randomUUID(), mountId = randomUUID()
  try {
    for (let revision = 1; revision <= 2; revision++) {
      const scene = readFileSync(new URL(`./fixtures/revision-${revision}.fig`, import.meta.url))
      store.save({ canvasId, operationId: randomUUID(), expectedRevision: revision - 1, scene,
        metadata: { formatVersion: 1, name: 'Portable canvas', mountId, futureExtension: { retained: true },
          pages: [{ id: randomUUID(), name: 'Page' }], view: { panX: 12, panY: 34, zoom: 0.75 } } })
    }
    const revisions = store.revisions(canvasId).map(row => store.read(canvasId, row.revision))
    return { canvasId, revisions, layout: { formatVersion: 1, panels: { layers: false, properties: true }, futureLayout: 'kept' },
      references: { formatVersion: 1, mounts: [{ id: mountId, canvasId, path: 'C:\\Source assets' }],
        files: [{ id: randomUUID(), mountId, path: '原件.txt', kind: 'file', size: '123', revision: 1, availability: 'available' }] } }
  } finally { store.close() }
}

function altered(bytes, change) {
  const manifest = JSON.parse(gunzipSync(bytes.subarray(10)))
  change(manifest)
  return Buffer.concat([bytes.subarray(0, 10), gzipSync(JSON.stringify(manifest))])
}

test('portable package preserves real FIG history, unknown metadata, layout and external reference identities', () => {
  const input = fixture()
  const bytes = encodeCanvasPackage({ ...input, credentials: { token: 'test-only-not-work-data' } })
  const { manifest, scenes } = decodeCanvasPackage(bytes)
  assert.equal(manifest.canvasId, input.canvasId)
  assert.equal(manifest.headRevision, 2)
  assert.equal(manifest.externalFiles, 'references-only')
  assert.deepEqual(manifest.layout, input.layout)
  assert.deepEqual(manifest.references, input.references)
  for (const source of input.revisions) {
    const restored = manifest.revisions.find(row => row.revision === source.revision)
    assert.deepEqual(restored.metadata, source.metadata)
    assert.equal(restored.createdAt, source.createdAt)
    assert.deepEqual(scenes.get(restored.sceneHash), source.scene)
  }
  assert.equal('credentials' in manifest, false)
  assert.equal(JSON.stringify(manifest).includes('test-only-not-work-data'), false)
})

test('portable package rejects corrupt, partial, future and oversized payloads before restoration', () => {
  const bytes = encodeCanvasPackage(fixture())
  assert.throws(() => decodeCanvasPackage(bytes.subarray(0, bytes.length - 9)), { code: 'corrupt' })
  assert.throws(() => decodeCanvasPackage(bytes, { maxDecodedBytes: 64 }), { code: 'too-large' })
  assert.throws(() => decodeCanvasPackage(altered(bytes, p => { p.formatVersion = 2 })), { code: 'unsupported-version' })
  assert.throws(() => decodeCanvasPackage(altered(bytes, p => { delete p.scenes[p.revisions[0].sceneHash] })), { code: 'invalid' })
  assert.throws(() => decodeCanvasPackage(altered(bytes, p => { p.scenes[p.revisions[0].sceneHash] = Buffer.from('changed').toString('base64') })), { code: 'corrupt' })
  assert.throws(() => decodeCanvasPackage(altered(bytes, p => { p.revisions[0].revision = 2 })), { code: 'invalid' })
})

test('portable reference manifest rejects traversal, duplicate IDs and missing directory bindings', () => {
  const bytes = encodeCanvasPackage(fixture())
  for (const path of ['../outside', '..\\outside', '.', '..', '/absolute', 'folder/file']) {
    assert.throws(() => decodeCanvasPackage(altered(bytes, p => { p.references.files[0].path = path })), { code: 'invalid' })
  }
  assert.throws(() => decodeCanvasPackage(altered(bytes, p => { p.references.files.push(p.references.files[0]) })), { code: 'invalid' })
  assert.throws(() => decodeCanvasPackage(altered(bytes, p => { p.references.mounts = [] })), { code: 'invalid' })
})

function importedRequest(input) {
  const { manifest, scenes } = decodeCanvasPackage(encodeCanvasPackage(input))
  return { operationId: randomUUID(), canvasId: manifest.canvasId,
    revisions: manifest.revisions.map(row => ({ ...row, scene: scenes.get(row.sceneHash) })) }
}

test('package history restores in a fresh store and exact retries never revert later edits', () => {
  const input = fixture(), request = importedRequest(input)
  const directory = mkdtempSync(join(tmpdir(), 'canvas-import-'))
  let store = new WorkspaceStore(directory)
  try {
    assert.deepEqual(store.importHistory(request), { canvasId: input.canvasId, revision: 2 })
    store.close()
    store = new WorkspaceStore(directory)
    for (const original of input.revisions) assert.deepEqual(store.read(input.canvasId, original.revision), original)
    const latest = store.read(input.canvasId)
    store.save({ ...latest, operationId: randomUUID(), expectedRevision: 2,
      metadata: { ...latest.metadata, name: 'Newer edit' } })
    assert.deepEqual(store.importHistory(request), { canvasId: input.canvasId, revision: 2 })
    assert.equal(store.read(input.canvasId).revision, 3)
    assert.equal(store.read(input.canvasId).metadata.name, 'Newer edit')
    assert.throws(() => store.importHistory({ ...request, operationId: randomUUID() }), { code: 'conflict' })
    const changed = { ...request, revisions: request.revisions.map(row => ({ ...row,
      metadata: { ...row.metadata, name: 'Changed import' } })) }
    assert.throws(() => store.importHistory(changed), { code: 'operation-conflict' })
  } finally { store.close() }
})

test('failed history import exposes no partial revision and can retry after reopening', () => {
  const request = importedRequest(fixture())
  const directory = mkdtempSync(join(tmpdir(), 'canvas-import-failure-'))
  let store = new WorkspaceStore(directory)
  try {
    const otherId = randomUUID()
    store.save({ canvasId: otherId, operationId: randomUUID(), expectedRevision: 0,
      scene: request.revisions[0].scene, metadata: { formatVersion: 1, name: 'Unrelated' } })
    const other = store.read(otherId)
    store.db.exec("CREATE TRIGGER fail_import BEFORE INSERT ON revisions WHEN NEW.revision = 2 BEGIN SELECT RAISE(ABORT, 'injected storage failure'); END")
    assert.throws(() => store.importHistory(request), /injected storage failure/)
    store.close()
    store = new WorkspaceStore(directory)
    assert.deepEqual(store.revisions(request.canvasId), [])
    assert.equal(store.operation(request.operationId), null)
    assert.throws(() => store.read(request.canvasId), { code: 'not-found' })
    assert.deepEqual(store.read(otherId), other)
    store.db.exec('DROP TRIGGER fail_import')
    store.importHistory(request)
    assert.equal(store.read(request.canvasId).revision, 2)
    assert.deepEqual(store.read(otherId), other)
  } finally { store.close() }
})
