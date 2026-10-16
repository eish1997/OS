import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { WorkspaceStore } from './workspace-store.mjs'

const source = new URL('./fixtures/revision-2.fig', import.meta.url)
const scene = readFileSync(source)
const moduleURL = new URL('./workspace-store.mjs', import.meta.url).href

test('real FIG persisted, reopened in another process, retried and versioned without lost updates', () => {
  const directory = mkdtempSync(join(tmpdir(), 'os-canvas-store-'))
  const canvasId = randomUUID(), operationId = randomUUID()
  const metadata = { formatVersion: 1, name: '测试画布', viewport: { zoom: 1, panX: 20, panY: 40 } }
  const input = { canvasId, operationId, expectedRevision: 0, scene, metadata }
  let store = new WorkspaceStore(directory)
  try {
    assert.deepEqual(store.save(input), { canvasId, revision: 1 })
    assert.deepEqual(store.save(input), { canvasId, revision: 1 })
    assert.throws(() => store.save({ ...input, metadata: { ...metadata, name: 'changed' } }), { code: 'operation-conflict' })
    assert.throws(() => store.save({ ...input, operationId: randomUUID() }), { code: 'conflict' })
  } finally { store.close() }
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { WorkspaceStore } from ${JSON.stringify(moduleURL)};
    const s = new WorkspaceStore(process.argv[1]);
    const r = s.read(process.argv[2]);
    console.log(JSON.stringify({ ...r, scene: Array.from(r.scene), operation: s.operation(process.argv[3]) }));
    s.close();
  `, directory, canvasId, operationId], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  assert.equal(child.status, 0, child.stderr)
  const restored = JSON.parse(child.stdout)
  assert.deepEqual(Buffer.from(restored.scene), scene)
  assert.deepEqual(restored.metadata, metadata)
  assert.deepEqual(restored.operation, { canvasId, revision: 1 })
  store = new WorkspaceStore(directory)
  try {
    assert.deepEqual(store.save({ ...input, operationId: randomUUID(), expectedRevision: 1,
      metadata: { ...metadata, name: 'second' } }), { canvasId, revision: 2 })
    assert.equal(store.read(canvasId).metadata.name, 'second')
    assert.equal(store.read(canvasId, 1).metadata.name, metadata.name)
    assert.deepEqual(store.revisions(canvasId).map(entry => entry.revision), [2, 1])
    assert.throws(() => store.save({ ...input, operationId: randomUUID(), expectedRevision: 2,
      metadata: { formatVersion: 99 } }), { code: 'invalid' })
    assert.equal(store.read(canvasId).revision, 2)
    assert.equal(store.list().length, 1)
    assert.throws(() => store.read('../escape'), { code: 'invalid' })
    writeFileSync(join(directory, 'scenes', `${restored.sceneHash}.fig`), 'broken')
    assert.throws(() => store.read(canvasId), { code: 'corrupt' })
  } finally { store.close() }
})

test('future workspace schema is refused without overwriting its database', () => {
  const directory = mkdtempSync(join(tmpdir(), 'os-canvas-future-schema-'))
  const file = join(directory, 'workspace.sqlite')
  const db = new DatabaseSync(file)
  db.exec('PRAGMA user_version=99; CREATE TABLE future_records (payload TEXT);')
  db.close()
  const before = readFileSync(file)
  assert.throws(() => new WorkspaceStore(directory), { code: 'unsupported-version' })
  assert.deepEqual(readFileSync(file), before)
})

test('filesystem and database write failures preserve the head and allow the same operation to retry', () => {
  const directory = mkdtempSync(join(tmpdir(), 'os-canvas-write-failure-'))
  const store = new WorkspaceStore(directory)
  const canvasId = randomUUID()
  const input = { canvasId, operationId: randomUUID(), expectedRevision: 0, scene,
    metadata: { formatVersion: 1, name: 'confirmed' } }
  const next = { ...input, operationId: randomUUID(), expectedRevision: 1,
    scene: readFileSync(new URL('./fixtures/revision-1.fig', import.meta.url)) }
  const blobs = join(directory, 'scenes'), retained = join(directory, 'retained-scenes')
  try {
    store.save(input)
    // A real filesystem failure, entirely inside this test's fresh temporary directory.
    renameSync(blobs, retained)
    writeFileSync(blobs, 'not a directory')
    try { assert.throws(() => store.save(next)) }
    finally { unlinkSync(blobs); renameSync(retained, blobs) }
    assert.equal(store.read(canvasId).revision, 1)
    assert.deepEqual(store.read(canvasId).scene, scene)
    assert.equal(store.operation(next.operationId), null)
    assert.equal(store.revisions(canvasId).length, 1)

    store.db.exec('PRAGMA query_only=ON')
    try { assert.throws(() => store.save(next), /readonly/i) }
    finally { store.db.exec('PRAGMA query_only=OFF') }
    assert.equal(store.read(canvasId).revision, 1)
    assert.equal(store.operation(next.operationId), null)
    assert.equal(store.revisions(canvasId).length, 1)
    assert.deepEqual(store.save(next), { canvasId, revision: 2 })
    assert.deepEqual(store.read(canvasId).scene, next.scene)
    assert.deepEqual(store.read(canvasId, 1).scene, scene)
  } finally { store.close() }
})

test('process death before SQLite commit leaves previous revision and no completed operation', () => {
  const directory = mkdtempSync(join(tmpdir(), 'os-canvas-crash-'))
  const canvasId = randomUUID(), operationId = randomUUID()
  const input = { canvasId, operationId: randomUUID(), expectedRevision: 0, scene, metadata: { formatVersion: 1 } }
  let store = new WorkspaceStore(directory)
  store.save(input); store.close()
  // Replace only the test process database commit call. This is not a production fault flag.
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { WorkspaceStore } from ${JSON.stringify(moduleURL)};
    import { readFileSync } from 'node:fs';
    const s = new WorkspaceStore(process.argv[1]);
    const exec = s.db.exec.bind(s.db);
    s.db.exec = sql => { if (sql === 'COMMIT') process.exit(73); return exec(sql); };
    s.save({ canvasId: process.argv[2], operationId: process.argv[3], expectedRevision: 1,
      scene: readFileSync(process.argv[4]), metadata: { formatVersion: 1, name: 'uncommitted' } });
  `, directory, canvasId, operationId, fileURLToPath(new URL('./fixtures/revision-1.fig', import.meta.url))], { encoding: 'utf8' })
  assert.equal(child.status, 73, child.stderr)
  store = new WorkspaceStore(directory)
  try {
    assert.equal(store.read(canvasId).revision, 1)
    assert.deepEqual(store.read(canvasId).scene, scene)
    assert.equal(store.operation(operationId), null)
    assert.deepEqual(store.save({ ...input, operationId, expectedRevision: 1 }), { canvasId, revision: 2 })
  } finally { store.close() }
})
