import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, renameSync, unlinkSync, symlinkSync, linkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MountStore } from './mount-store.mjs'
import { FileIndex } from './file-index.mjs'
import { randomUUID } from 'node:crypto'

test('portable file references preserve IDs and require confirmation before adopting on-disk files', async () => {
  const data = mkdtempSync(join(tmpdir(), 'canvas-import-files-')), root = join(data, 'root')
  mkdirSync(root); writeFileSync(join(root, 'a.txt'), 'actual source')
  const mount = { id: randomUUID(), canvasId: randomUUID(), path: root }
  const file = { id: randomUUID(), mountId: mount.id, path: 'a.txt', kind: 'file',
    size: '999', revision: 7, availability: 'available' }
  const references = { formatVersion: 1, mounts: [mount], files: [file] }
  const operationId = randomUUID(), mounts = new MountStore(data)
  let files = new FileIndex(data, mounts)
  try {
    mounts.importReferences(operationId, references)
    files.importReferences(operationId, references)
    assert.equal((await files.scan(mount.id)).entries[0].availability, 'missing')
    await files.close(); files = new FileIndex(data, mounts)
    const preview = mounts.previewRelink(mount.id, root)
    mounts.confirmRelink(mount.id, preview.token)
    const observed = await files.scan(mount.id)
    assert.equal(observed.entries.length, 1)
    assert.equal(observed.entries[0].id, file.id)
    assert.equal(observed.entries[0].availability, 'replaced')
    const replacement = await files.prepareReplacement(mount.id, file.id)
    const accepted = await files.confirmReplacement(mount.id, file.id, replacement.token)
    assert.equal(accepted.availability, 'available')
    assert.equal(accepted.size, String(Buffer.byteLength('actual source')))
    files.importReferences(operationId, references)
    assert.deepEqual(files.list(mount.id).entries, [accepted])
    const newFile = { ...file, id: randomUUID(), path: 'not-on-disk.txt' }
    assert.throws(() => files.importReferences(randomUUID(), { ...references, files: [newFile, file] }), { code: 'conflict' })
    assert.deepEqual(files.list(mount.id).entries, [accepted])
    assert.throws(() => files.importReferences(operationId, { ...references, files: [newFile] }), { code: 'operation-conflict' })
  } finally { await files.close(); mounts.close() }
})

test('file index preserves identity, missing entries and offline state without traversing links', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'canvas-file-index-'))
  const root = join(directory, 'root'), outside = join(directory, 'outside'), moved = join(directory, 'moved')
  mkdirSync(root); mkdirSync(outside); mkdirSync(join(root, 'child'))
  writeFileSync(join(root, 'a.txt'), 'same'); writeFileSync(join(root, 'b.txt'), 'same')
  writeFileSync(join(outside, 'private.txt'), 'not indexed')
  symlinkSync(outside, join(root, 'external'), process.platform === 'win32' ? 'junction' : 'dir')
  const mounts = new MountStore(directory), mount = mounts.add(root)
  let files = new FileIndex(directory, mounts)
  try {
    const initial = await files.scan(mount.id)
    assert.equal(initial.scanStatus, 'complete'); assert.equal(initial.entries.length, 4)
    assert.equal(initial.entries.find(e => e.path === 'external').kind, 'link')
    assert.ok(!initial.entries.some(e => e.path.includes('private')))
    const a = initial.entries.find(e => e.path === 'a.txt'), b = initial.entries.find(e => e.path === 'b.txt')
    assert.notEqual(a.id, b.id)
    assert.deepEqual((await files.scan(mount.id)).entries, initial.entries)
    appendFileSync(join(root, 'a.txt'), ' edited')
    let scan = await files.scan(mount.id)
    assert.equal(scan.entries.find(e => e.id === a.id).revision, 2)
    renameSync(join(root, 'a.txt'), join(root, 'renamed.txt'))
    scan = await files.scan(mount.id)
    assert.equal(scan.entries.find(e => e.path === 'renamed.txt').id, a.id)
    unlinkSync(join(root, 'b.txt'))
    scan = await files.scan(mount.id)
    assert.equal(scan.entries.find(e => e.id === b.id).availability, 'missing')
    writeFileSync(join(root, 'b.txt'), 'replacement')
    scan = await files.scan(mount.id)
    assert.equal(scan.entries.find(e => e.id === b.id).availability, 'replaced')
    assert.equal(scan.entries.filter(e => e.path === 'b.txt').length, 1)
    const confirmed = scan.entries
    await files.close(); files = new FileIndex(directory, mounts)
    assert.deepEqual(files.list(mount.id).entries, confirmed)
    // Moves remain inside this test's fresh temporary directory.
    renameSync(root, moved)
    scan = await files.scan(mount.id)
    assert.equal(scan.scanStatus, 'offline'); assert.deepEqual(scan.entries, confirmed)
    renameSync(moved, root)
    scan = await files.scan(mount.id)
    assert.equal(scan.scanStatus, 'complete')
    assert.deepEqual(scan.entries, confirmed)
  } finally { await files.close(); mounts.close() }
})

test('hard-linked files have separate asset identities and ambiguous rename is not guessed', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'canvas-file-links-')), root = join(directory, 'root')
  mkdirSync(root); writeFileSync(join(root, 'a'), 'shared'); linkSync(join(root, 'a'), join(root, 'b'))
  const mounts = new MountStore(directory), mount = mounts.add(root), files = new FileIndex(directory, mounts)
  try {
    const first = await files.scan(mount.id)
    assert.equal(new Set(first.entries.map(e => e.id)).size, 2)
    renameSync(join(root, 'a'), join(root, 'c'))
    const after = await files.scan(mount.id)
    assert.equal(after.entries.find(e => e.path === 'b').id, first.entries.find(e => e.path === 'b').id)
    assert.equal(after.entries.find(e => e.path === 'a').availability, 'missing')
    assert.notEqual(after.entries.find(e => e.path === 'c').id, first.entries.find(e => e.path === 'a').id)
  } finally { await files.close(); mounts.close() }
})

test('child folder opening reuses its canvas and rejects links, replaced folders and foreign assets', async () => {
  const data = mkdtempSync(join(tmpdir(), 'canvas-child-')), root = join(data, 'root'), outside = join(data, 'outside')
  mkdirSync(root); mkdirSync(outside); mkdirSync(join(root, 'child'))
  symlinkSync(outside, join(root, 'shortcut'), process.platform === 'win32' ? 'junction' : 'dir')
  const mounts = new MountStore(data), mount = mounts.add(root), files = new FileIndex(data, mounts)
  try {
    const first = await files.scan(mount.id)
    const child = first.entries.find(e => e.path === 'child')
    const opened = await files.openChild(mount.id, child.id)
    assert.equal(opened.canvasId, (await files.openChild(mount.id, child.id)).canvasId)
    renameSync(join(root, 'child'), join(root, 'renamed'))
    const renamed = await files.openChild(mount.id, child.id)
    assert.equal(renamed.canvasId, opened.canvasId)
    assert.equal(renamed.path, join(root, 'renamed'))
    await assert.rejects(files.openChild(mount.id, first.entries.find(e => e.path === 'shortcut').id), { code: 'conflict' })
    await assert.rejects(files.openChild(opened.id, child.id), { code: 'not-found' })
    // Retain the original directory inside the isolated fixture; put a different one at its path.
    renameSync(join(root, 'renamed'), join(data, 'original'))
    mkdirSync(join(root, 'renamed'))
    await assert.rejects(files.openChild(mount.id, child.id), { code: 'conflict' })
  } finally { await files.close(); mounts.close() }
})

test('directory reassociation invalidates an in-flight scan and retains old file identities', async () => {
  const data = mkdtempSync(join(tmpdir(), 'canvas-root-change-')), root = join(data, 'root'), target = join(data, 'target')
  mkdirSync(root); mkdirSync(target)
  writeFileSync(join(root, 'same.txt'), 'old'); writeFileSync(join(target, 'same.txt'), 'new')
  const mounts = new MountStore(data), mount = mounts.add(root), files = new FileIndex(data, mounts)
  try {
    const original = (await files.scan(mount.id)).entries[0]
    const preview = mounts.previewRelink(mount.id, target)
    const pending = files.scan(mount.id)
    mounts.confirmRelink(mount.id, preview.token)
    assert.equal((await pending).scanStatus, 'changed')
    assert.deepEqual(files.list(mount.id).entries, [original])
    const current = await files.scan(mount.id)
    assert.equal(current.entries[0].id, original.id)
    assert.equal(current.entries[0].availability, 'replaced')
    assert.equal(mounts.get(mount.id).canvasId, mount.canvasId)
  } finally { await files.close(); mounts.close() }
})
