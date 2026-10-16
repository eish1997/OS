import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, renameSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MountStore } from './mount-store.mjs'
import { randomUUID } from 'node:crypto'

test('imported directory identities stay unverified until explicit relink and retries preserve later changes', () => {
  const data = mkdtempSync(join(tmpdir(), 'canvas-import-mount-'))
  const source = join(data, 'source'), moved = join(data, 'moved')
  mkdirSync(source); mkdirSync(moved)
  const mount = { id: randomUUID(), canvasId: randomUUID(), path: source }
  const references = { formatVersion: 1, mounts: [mount], files: [] }
  const operationId = randomUUID()
  let store = new MountStore(data)
  try {
    assert.equal(store.importReferences(operationId, references)[0].availability, 'replaced')
    store.close(); store = new MountStore(data)
    assert.equal(store.get(mount.id).availability, 'replaced')
    const preview = store.previewRelink(mount.id, moved)
    assert.equal(store.confirmRelink(mount.id, preview.token).availability, 'available')
    assert.equal(store.importReferences(operationId, references)[0].path, moved)
    assert.throws(() => store.importReferences(operationId, { ...references,
      mounts: [{ ...mount, path: moved }] }), { code: 'operation-conflict' })
    assert.throws(() => store.importReferences(randomUUID(), references), { code: 'conflict' })
    const missing = { id: randomUUID(), canvasId: randomUUID(), path: join(data, 'missing') }
    const conflicting = { ...references, mounts: [missing, { ...mount, path: moved }] }
    const retryId = randomUUID()
    assert.throws(() => store.importReferences(retryId, conflicting), { code: 'conflict' })
    assert.throws(() => store.get(missing.id), { code: 'not-found' })
    assert.equal(store.db.prepare('SELECT 1 FROM mount_imports WHERE operation_id=?').get(retryId), undefined)
    assert.equal(store.importReferences(randomUUID(), { ...references, mounts: [missing] })[0].availability, 'offline')
  } finally { store.close() }
})

test('directory identity deduplicates aliases and survives restart, offline and relocation', () => {
  const directory = mkdtempSync(join(tmpdir(), 'os-canvas-mount-'))
  const original = join(directory, 'original'), moved = join(directory, 'moved'), alias = join(directory, 'alias')
  mkdirSync(original)
  writeFileSync(join(original, 'source.txt'), 'user content stays untouched')
  symlinkSync(original, alias, process.platform === 'win32' ? 'junction' : 'dir')
  let store = new MountStore(directory)
  const first = store.add(original)
  assert.equal(first.availability, 'available')
  assert.deepEqual(store.add(alias), first)
  assert.deepEqual(store.add(join(original, '.')), first)
  if (process.platform === 'win32') assert.deepEqual(store.add(original.toUpperCase()), first)
  assert.equal(store.list().length, 1)
  store.close(); store = new MountStore(directory)
  try {
    assert.deepEqual(store.list(), [first])
    // All moves stay inside this test's fresh temporary directory; never user data.
    renameSync(original, moved)
    assert.equal(store.list()[0].availability, 'offline')
    const relocated = store.add(moved)
    assert.equal(relocated.id, first.id)
    assert.equal(relocated.canvasId, first.canvasId)
    assert.equal(store.list().length, 1)
    renameSync(moved, original); mkdirSync(moved)
    assert.equal(store.list()[0].availability, 'replaced')
    assert.throws(() => store.add(moved), { code: 'conflict' })
    assert.equal(store.list()[0].canvasId, first.canvasId)
    assert.equal(readFileSync(join(original, 'source.txt'), 'utf8'), 'user content stays untouched')
    assert.throws(() => store.add('relative/path'), { code: 'invalid' })
    assert.throws(() => store.add(join(original, 'source.txt')), { code: 'invalid' })
  } finally { store.close() }
})

test('explicit directory reassociation preserves canvas, rejects stale targets and never merges canvases', () => {
  const data = mkdtempSync(join(tmpdir(), 'canvas-mount-relink-'))
  const original = join(data, 'root'), retained = join(data, 'retained'), target = join(data, 'target'), occupied = join(data, 'occupied')
  mkdirSync(original); mkdirSync(target); mkdirSync(occupied)
  let store = new MountStore(data)
  const first = store.add(original)
  store.add(occupied)
  try {
    renameSync(original, retained); mkdirSync(original)
    const samePath = store.previewRelink(first.id, original)
    assert.equal(store.get(first.id).availability, 'replaced')
    const confirmed = store.confirmRelink(first.id, samePath.token)
    assert.equal(confirmed.canvasId, first.canvasId)
    assert.equal(confirmed.availability, 'available')
    assert.deepEqual(store.confirmRelink(first.id, samePath.token), confirmed)
    assert.throws(() => store.previewRelink(first.id, occupied), { code: 'conflict' })
    const preview = store.previewRelink(first.id, target)
    renameSync(target, join(data, 'old-target')); mkdirSync(target)
    assert.throws(() => store.confirmRelink(first.id, preview.token), { code: 'conflict' })
    assert.equal(store.get(first.id).path, original)
    const fresh = store.previewRelink(first.id, target)
    const moved = store.confirmRelink(first.id, fresh.token)
    assert.equal(moved.path, target)
    assert.equal(moved.canvasId, first.canvasId)
    assert.throws(() => store.confirmRelink(first.id, samePath.token), { code: 'conflict' })
    store.close(); store = new MountStore(data)
    assert.deepEqual(store.get(first.id), moved)
    assert.throws(() => store.confirmRelink(first.id, fresh.token), { code: 'conflict' })
  } finally { store.close() }
})
