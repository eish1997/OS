import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, renameSync, unlinkSync, linkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { MountStore } from './mount-store.mjs'
import { OutputStore } from './output-store.mjs'
import { FileIndex } from './file-index.mjs'

function fixture() {
  const data = mkdtempSync(join(tmpdir(), 'canvas-output-')), root = join(data, 'assets')
  mkdirSync(root)
  const mounts = new MountStore(data), mount = mounts.add(root)
  const request = { operationId: randomUUID(), canvasId: mount.canvasId, nodeId: randomUUID(),
    sourceRevision: 1, mountId: mount.id, name: '成果.txt', content: Buffer.from('保留工作成果') }
  return { data, root, mounts, request }
}

test('output journal survives reopening, publishes once and rejects changed operation payload', () => {
  const { data, root, mounts, request } = fixture()
  let outputs = new OutputStore(data, mounts)
  try {
    assert.equal(outputs.prepare(request).state, 'prepared')
    assert.deepEqual(readdirSync(root), [])
    outputs.close(); outputs = new OutputStore(data, mounts)
    const result = outputs.commit(request.operationId)
    assert.equal(result.state, 'committed')
    assert.equal(readFileSync(join(root, request.name), 'utf8'), '保留工作成果')
    assert.deepEqual(readdirSync(root), [request.name])
    assert.throws(() => outputs.prepare({ ...request, content: Buffer.from('different') }), { code: 'conflict' })
    outputs.close(); outputs = new OutputStore(data, mounts)
    assert.deepEqual(outputs.prepare(request), result)
    assert.deepEqual(outputs.commit(request.operationId), result)
    unlinkSync(join(root, request.name))
    assert.deepEqual(outputs.commit(request.operationId), result)
    assert.deepEqual(readdirSync(root), [], 'a historical retry must not recreate a user-deleted file')
  } finally { outputs.close(); mounts.close() }
})

test('committed retry cleans an interrupted temporary without recreating a deleted target', () => {
  const { data, root, mounts, request } = fixture()
  let outputs = new OutputStore(data, mounts)
  try {
    outputs.prepare(request)
    const row = outputs.writeTemporary(outputs.row(request.operationId))
    // Reproduce the durable boundary after confirmation and before cleanup.
    linkSync(join(root, row.temporary), join(root, request.name))
    outputs.db.prepare("UPDATE outputs SET state='committed' WHERE id=?").run(request.operationId)
    unlinkSync(join(root, request.name))
    outputs.close(); outputs = new OutputStore(data, mounts)
    assert.equal(outputs.commit(request.operationId).state, 'committed')
    assert.deepEqual(readdirSync(root), [])
    assert.equal(outputs.temporaryNames(request.mountId).size, 0)
    assert.equal(outputs.commit(request.operationId).state, 'committed')
  } finally { outputs.close(); mounts.close() }
})

test('committed cleanup preserves and reveals an externally replaced temporary path', async () => {
  const { data, root, mounts, request } = fixture()
  const outputs = new OutputStore(data, mounts)
  const files = new FileIndex(data, mounts, { ignoredNames: id => outputs.temporaryNames(id) })
  try {
    outputs.prepare(request)
    const row = outputs.writeTemporary(outputs.row(request.operationId))
    linkSync(join(root, row.temporary), join(root, request.name))
    outputs.db.prepare("UPDATE outputs SET state='committed' WHERE id=?").run(request.operationId)
    unlinkSync(join(root, row.temporary))
    writeFileSync(join(root, row.temporary), 'external replacement')
    assert.equal(outputs.commit(request.operationId).state, 'committed')
    assert.equal(readFileSync(join(root, row.temporary), 'utf8'), 'external replacement')
    assert.equal(readFileSync(join(root, request.name), 'utf8'), '保留工作成果')
    assert.equal(outputs.temporaryNames(request.mountId).size, 0)
    const scan = await files.scan(request.mountId)
    assert.ok(scan.entries.some(file => file.path === row.temporary))
  } finally { await files.close(); outputs.close(); mounts.close() }
})

test('committed cleanup waits for the original directory and preserves a replacement directory', () => {
  const { data, root, mounts, request } = fixture()
  const outputs = new OutputStore(data, mounts)
  try {
    outputs.prepare(request)
    const row = outputs.writeTemporary(outputs.row(request.operationId))
    linkSync(join(root, row.temporary), join(root, request.name))
    outputs.db.prepare("UPDATE outputs SET state='committed' WHERE id=?").run(request.operationId)
    const original = join(data, 'original-assets')
    renameSync(root, original); mkdirSync(root)
    writeFileSync(join(root, row.temporary), 'replacement directory content')
    assert.equal(outputs.commit(request.operationId).state, 'committed')
    assert.equal(readFileSync(join(root, row.temporary), 'utf8'), 'replacement directory content')
    assert.equal(readFileSync(join(original, row.temporary), 'utf8'), '保留工作成果')
    assert.equal(outputs.db.prepare('SELECT count(*) AS count FROM output_temporaries').get().count, 1)
    renameSync(root, join(data, 'replacement-assets')); renameSync(original, root)
    assert.equal(outputs.commit(request.operationId).state, 'committed')
    assert.deepEqual(readdirSync(root), [request.name])
    assert.equal(outputs.temporaryNames(request.mountId).size, 0)
  } finally { outputs.close(); mounts.close() }
})

test('publication before journal commit is recovered without replacing the file', () => {
  const { data, root, mounts, request } = fixture()
  let outputs = new OutputStore(data, mounts)
  try {
    outputs.prepare(request)
    outputs.db.exec(`CREATE TRIGGER interrupt_commit BEFORE UPDATE ON outputs WHEN NEW.state='committed'
      BEGIN SELECT RAISE(ABORT, 'interrupted journal commit'); END;`)
    assert.throws(() => outputs.commit(request.operationId), /interrupted journal commit/)
    assert.equal(readFileSync(join(root, request.name), 'utf8'), '保留工作成果')
    assert.equal(outputs.pending(request.canvasId)[0].state, 'ready')
    const before = outputs.row(request.operationId).file_identity
    outputs.db.exec('DROP TRIGGER interrupt_commit')
    outputs.close(); outputs = new OutputStore(data, mounts)
    assert.equal(outputs.commit(request.operationId).fileIdentity, before)
    assert.deepEqual(readdirSync(root), [request.name])
  } finally { outputs.close(); mounts.close() }
})

test('name race, unsafe names and replacement directory cannot overwrite external files', () => {
  const { data, root, mounts, request } = fixture()
  const outputs = new OutputStore(data, mounts)
  try {
    for (const name of ['../escape.txt', 'a/b', 'a\\b', 'x:stream', 'CON.txt', 'trailing.', '..']) {
      assert.throws(() => outputs.prepare({ ...request, name }), { code: 'invalid' })
    }
    outputs.prepare(request)
    writeFileSync(join(root, request.name), 'external writer')
    assert.throws(() => outputs.commit(request.operationId), { code: 'conflict' })
    assert.equal(readFileSync(join(root, request.name), 'utf8'), 'external writer')
    renameSync(root, join(data, 'original')); mkdirSync(root)
    assert.throws(() => outputs.commit(request.operationId), { code: 'conflict' })
    assert.deepEqual(readdirSync(root), [])
  } finally { outputs.close(); mounts.close() }
})

test('external change after interrupted publication is retained and requires explicit resolution', () => {
  const { data, root, mounts, request } = fixture()
  const outputs = new OutputStore(data, mounts)
  try {
    outputs.prepare(request)
    outputs.db.exec(`CREATE TRIGGER interrupt_commit BEFORE UPDATE ON outputs WHEN NEW.state='committed'
      BEGIN SELECT RAISE(ABORT, 'interrupt'); END;`)
    assert.throws(() => outputs.commit(request.operationId), /interrupt/)
    outputs.db.exec('DROP TRIGGER interrupt_commit')
    writeFileSync(join(root, request.name), 'external edit')
    assert.throws(() => outputs.commit(request.operationId), { code: 'conflict' })
    assert.equal(readFileSync(join(root, request.name), 'utf8'), 'external edit')
    assert.equal(outputs.row(request.operationId).state, 'ready')
  } finally { outputs.close(); mounts.close() }
})

test('scanner excludes journaled temporaries after interrupted publication without hiding unrelated prefixed files', async () => {
  const { data, root, mounts, request } = fixture()
  const outputs = new OutputStore(data, mounts)
  const files = new FileIndex(data, mounts, { ignoredNames: id => outputs.temporaryNames(id) })
  try {
    outputs.prepare(request)
    outputs.db.exec(`CREATE TRIGGER interrupt_commit BEFORE UPDATE ON outputs WHEN NEW.state='committed'
      BEGIN SELECT RAISE(ABORT, 'interrupt'); END;`)
    assert.throws(() => outputs.commit(request.operationId), /interrupt/)
    const unrelated = '.os-canvas-output-user-notes.txt'
    writeFileSync(join(root, unrelated), 'user file')
    const result = await files.scan(request.mountId)
    assert.equal(result.scanStatus, 'complete')
    assert.deepEqual(result.entries.map(entry => entry.path).sort(), [unrelated, request.name].sort())
  } finally { await files.close(); outputs.close(); mounts.close() }
})

test('output origin survives restart and rename but does not claim same-name replacements or hard-link aliases', async () => {
  const { data, root, mounts, request } = fixture()
  let outputs = new OutputStore(data, mounts)
  let files = new FileIndex(data, mounts, { outputOrigins: (id, rows) => outputs.origins(id, rows) })
  try {
    outputs.prepare(request); outputs.commit(request.operationId)
    const initial = (await files.scan(request.mountId)).entries[0]
    assert.deepEqual(initial.outputOrigin, { operationId: request.operationId, canvasId: request.canvasId,
      nodeId: request.nodeId, sourceRevision: 1,
      snapshotHash: createHash('sha256').update(request.content).digest('hex'), snapshotFormat: 'txt' })
    await files.close(); outputs.close()
    outputs = new OutputStore(data, mounts)
    files = new FileIndex(data, mounts, { outputOrigins: (id, rows) => outputs.origins(id, rows) })
    assert.deepEqual(files.list(request.mountId).entries[0].outputOrigin, initial.outputOrigin)
    renameSync(join(root, request.name), join(root, 'renamed.txt'))
    const renamed = (await files.scan(request.mountId)).entries.find(file => file.path === 'renamed.txt')
    assert.equal(renamed.id, initial.id)
    assert.deepEqual(renamed.outputOrigin, initial.outputOrigin)
    // This describes the immutable export, never the externally edited file.
    writeFileSync(join(root, 'renamed.txt'), 'externally edited after export')
    const edited = (await files.scan(request.mountId)).entries.find(file => file.id === initial.id)
    assert.deepEqual(edited.outputOrigin, initial.outputOrigin)
    renameSync(join(root, 'renamed.txt'), join(root, request.name))
    await files.scan(request.mountId)
    linkSync(join(root, request.name), join(root, 'alias.txt'))
    const aliases = (await files.scan(request.mountId)).entries
    assert.equal(aliases.find(file => file.path === 'alias.txt').outputOrigin, undefined)
    assert.deepEqual(aliases.find(file => file.path === request.name).outputOrigin, initial.outputOrigin)
    unlinkSync(join(root, 'alias.txt'))
    renameSync(join(root, request.name), join(data, 'original.txt'))
    writeFileSync(join(root, request.name), 'unrelated replacement')
    const replaced = (await files.scan(request.mountId)).entries.find(file => file.id === initial.id)
    assert.equal(replaced.availability, 'replaced')
    assert.equal(replaced.outputOrigin, undefined)
  } finally { await files.close(); outputs.close(); mounts.close() }
})

test('cancelled output retains its snapshot, is idempotent and cannot later publish', () => {
  const { data, root, mounts, request } = fixture()
  let outputs = new OutputStore(data, mounts)
  try {
    outputs.prepare(request)
    writeFileSync(join(root, request.name), 'external file')
    assert.throws(() => outputs.commit(request.operationId), { code: 'conflict' })
    const cancelled = outputs.cancel(request.operationId)
    assert.equal(cancelled.state, 'cancelled')
    assert.deepEqual(outputs.cancel(request.operationId), cancelled)
    assert.deepEqual(outputs.pending(request.canvasId), [])
    outputs.close(); outputs = new OutputStore(data, mounts)
    assert.deepEqual(outputs.prepare(request), cancelled)
    assert.throws(() => outputs.commit(request.operationId), { code: 'conflict' })
    assert.deepEqual(Buffer.from(outputs.row(request.operationId).content), request.content)
    assert.equal(readFileSync(join(root, request.name), 'utf8'), 'external file')
  } finally { outputs.close(); mounts.close() }
})

test('rename forks original bytes atomically, rejects stale retries and preserves the conflicting file', () => {
  const { data, root, mounts, request } = fixture()
  let outputs = new OutputStore(data, mounts)
  try {
    outputs.prepare(request)
    writeFileSync(join(root, request.name), 'external file')
    assert.throws(() => outputs.commit(request.operationId), { code: 'conflict' })
    const replacement = { replacementId: randomUUID(), name: 'renamed.txt' }
    assert.throws(() => outputs.replacePending(request.operationId, { ...replacement, name: 'wrong.png' }), { code: 'invalid' })
    outputs.db.exec(`CREATE TRIGGER interrupt_replacement BEFORE INSERT ON output_replacements
      BEGIN SELECT RAISE(ABORT, 'interrupted replacement'); END;`)
    assert.throws(() => outputs.replacePending(request.operationId, replacement), /interrupted replacement/)
    assert.equal(outputs.row(request.operationId).state, 'ready')
    assert.equal(outputs.row(replacement.replacementId), undefined)
    outputs.db.exec('DROP TRIGGER interrupt_replacement')
    const replaced = outputs.replacePending(request.operationId, replacement)
    assert.equal(replaced.state, 'prepared')
    assert.equal(outputs.row(request.operationId).state, 'cancelled')
    outputs.close(); outputs = new OutputStore(data, mounts)
    assert.deepEqual(outputs.replacePending(request.operationId, replacement), replaced)
    assert.throws(() => outputs.replacePending(request.operationId, { ...replacement, name: 'different.txt' }), { code: 'conflict' })
    assert.throws(() => outputs.commit(request.operationId), { code: 'conflict' })
    outputs.commit(replacement.replacementId)
    assert.equal(readFileSync(join(root, replacement.name), 'utf8'), request.content.toString())
    assert.equal(readFileSync(join(root, request.name), 'utf8'), 'external file')
    assert.equal(outputs.replacePending(request.operationId, replacement).state, 'committed')
  } finally { outputs.close(); mounts.close() }
})

test('cancel or rename cannot disguise a published file as an uncommitted output', () => {
  const { data, root, mounts, request } = fixture()
  const outputs = new OutputStore(data, mounts)
  try {
    outputs.prepare(request)
    outputs.db.exec(`CREATE TRIGGER interrupt_commit BEFORE UPDATE ON outputs WHEN NEW.state='committed'
      BEGIN SELECT RAISE(ABORT, 'interrupted'); END;`)
    assert.throws(() => outputs.commit(request.operationId), /interrupted/)
    assert.throws(() => outputs.cancel(request.operationId), { code: 'conflict' })
    assert.throws(() => outputs.replacePending(request.operationId, { replacementId: randomUUID(), name: 'new.txt' }), { code: 'conflict' })
    assert.equal(readFileSync(join(root, request.name), 'utf8'), request.content.toString())
    outputs.db.exec('DROP TRIGGER interrupt_commit')
    outputs.commit(request.operationId)
    assert.throws(() => outputs.cancel(request.operationId), { code: 'conflict' })
  } finally { outputs.close(); mounts.close() }
})

test('version 2 migration backfills owned ready files but retains unowned legacy orphans', () => {
  const { data, root, mounts, request } = fixture()
  let outputs = new OutputStore(data, mounts)
  try {
    outputs.prepare(request)
    const row = outputs.writeTemporary(outputs.row(request.operationId))
    const orphan = '.os-canvas-output-legacy.tmp'
    writeFileSync(join(root, orphan), 'unidentified old content')
    outputs.db.prepare(`INSERT INTO output_temporaries (name,mount_id,directory,mount_identity)
      VALUES (?,?,?,?)`).run(orphan, request.mountId, root, row.mount_identity)
    outputs.db.exec(`ALTER TABLE output_temporaries DROP COLUMN operation_id;
      ALTER TABLE output_temporaries DROP COLUMN file_identity; PRAGMA user_version=2;`)
    outputs.close(); outputs = new OutputStore(data, mounts)
    assert.equal(outputs.db.prepare('PRAGMA user_version').get().user_version, 3)
    const backupName = readdirSync(data).find(name => name.startsWith('outputs-schema2-backup-'))
    assert.ok(backupName)
    const backup = new DatabaseSync(join(data, backupName), { readOnly: true })
    try {
      assert.equal(backup.prepare('PRAGMA user_version').get().user_version, 2)
      assert.equal(backup.prepare('PRAGMA table_info(output_temporaries)').all().length, 4)
    } finally { backup.close() }
    outputs.cancel(request.operationId)
    assert.deepEqual(readdirSync(root), [orphan])
    assert.equal(readFileSync(join(root, orphan), 'utf8'), 'unidentified old content')
    assert.equal(outputs.temporaryNames(request.mountId).has(orphan), true)
  } finally { outputs.close(); mounts.close() }
})

test('directory scan resumes terminal cleanup after service restart without touching pending output', () => {
  const { data, root, mounts, request } = fixture()
  let outputs = new OutputStore(data, mounts)
  try {
    outputs.prepare(request)
    outputs.writeTemporary(outputs.row(request.operationId))
    // Durable cancel followed by an exit before cleanup.
    outputs.db.prepare("UPDATE outputs SET state='cancelled' WHERE id=?").run(request.operationId)
    const pending = { ...request, operationId: randomUUID(), name: 'pending.txt' }
    outputs.prepare(pending)
    const ready = outputs.writeTemporary(outputs.row(pending.operationId))
    outputs.close(); outputs = new OutputStore(data, mounts)
    assert.deepEqual([...outputs.temporaryNames(request.mountId)], [ready.temporary])
    assert.deepEqual(readdirSync(root), [ready.temporary])
    assert.equal(outputs.row(pending.operationId).state, 'ready')
  } finally { outputs.close(); mounts.close() }
})

test('cancel retains a completed temporary externally truncated to a valid content prefix', () => {
  const { data, root, mounts, request } = fixture()
  const outputs = new OutputStore(data, mounts)
  try {
    outputs.prepare(request)
    const row = outputs.writeTemporary(outputs.row(request.operationId))
    const prefix = request.content.subarray(0, 3)
    writeFileSync(join(root, row.temporary), prefix)
    outputs.cancel(request.operationId)
    assert.deepEqual(readFileSync(join(root, row.temporary)), prefix)
    assert.equal(outputs.temporaryNames(request.mountId).size, 0)
    assert.deepEqual(Buffer.from(outputs.row(request.operationId).content), request.content)
  } finally { outputs.close(); mounts.close() }
})

test('journal version 1 migration preserves a consistent backup before introducing cancellation', () => {
  const { data, mounts, request } = fixture()
  let outputs = new OutputStore(data, mounts)
  try {
    outputs.prepare(request)
    outputs.db.exec('DROP TABLE output_replacements; PRAGMA user_version=1')
    outputs.close(); outputs = new OutputStore(data, mounts)
    assert.equal(outputs.db.prepare('PRAGMA user_version').get().user_version, 3)
    const backupName = readdirSync(data).find(name => name.startsWith('outputs-schema1-backup-'))
    assert.ok(backupName)
    const backup = new DatabaseSync(join(data, backupName), { readOnly: true })
    try {
      assert.equal(backup.prepare('PRAGMA user_version').get().user_version, 1)
      assert.equal(backup.prepare('SELECT state FROM outputs WHERE id=?').get(request.operationId).state, 'prepared')
    } finally { backup.close() }
    assert.equal(outputs.cancel(request.operationId).state, 'cancelled')
  } finally { outputs.close(); mounts.close() }
})
