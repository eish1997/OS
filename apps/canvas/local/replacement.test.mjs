import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, renameSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MountStore } from './mount-store.mjs'
import { FileIndex } from './file-index.mjs'

test('explicit replacement preserves asset ID, rejects stale previews and retries without another revision', async () => {
  const data = mkdtempSync(join(tmpdir(), 'canvas-replacement-')), root = join(data, 'root')
  mkdirSync(root); writeFileSync(join(root, 'asset.txt'), 'original')
  const mounts = new MountStore(data), mount = mounts.add(root)
  let files = new FileIndex(data, mounts)
  try {
    const original = (await files.scan(mount.id)).entries[0]
    renameSync(join(root, 'asset.txt'), join(data, 'original.txt'))
    writeFileSync(join(root, 'asset.txt'), 'replacement')
    const preview = await files.prepareReplacement(mount.id, original.id)
    assert.equal(files.list(mount.id).entries[0].availability, 'replaced')
    assert.equal(preview.path, join(root, 'asset.txt'))
    await assert.rejects(files.confirmReplacement(mount.id, 'wrong-asset', preview.token), { code: 'conflict' })
    appendFileSync(join(root, 'asset.txt'), ' changed after preview')
    await assert.rejects(files.confirmReplacement(mount.id, original.id, preview.token), { code: 'conflict' })
    const expired = await files.prepareReplacement(mount.id, original.id)
    files.replacements.get(expired.token).expires = Date.now() - 1
    await assert.rejects(files.confirmReplacement(mount.id, original.id, expired.token), { code: 'conflict' })
    const current = await files.prepareReplacement(mount.id, original.id)
    const committed = await files.confirmReplacement(mount.id, original.id, current.token)
    assert.equal(committed.id, original.id)
    assert.equal(committed.availability, 'available')
    assert.equal(committed.revision, current.revision + 1)
    assert.deepEqual(await files.confirmReplacement(mount.id, original.id, current.token), committed)
    assert.deepEqual((await files.scan(mount.id)).entries, [committed])
    await files.close(); files = new FileIndex(data, mounts)
    assert.deepEqual(files.list(mount.id).entries, [committed])
    await assert.rejects(files.confirmReplacement(mount.id, original.id, current.token), { code: 'conflict' })
  } finally { await files.close(); mounts.close() }
})

test('replacing a child folder preserves its canvas across an interrupted parent-link update', async () => {
  const data = mkdtempSync(join(tmpdir(), 'canvas-child-replacement-')), root = join(data, 'root'), child = join(root, 'child')
  mkdirSync(root); mkdirSync(child); writeFileSync(join(child, 'asset.txt'), 'old')
  const mounts = new MountStore(data), mount = mounts.add(root)
  let files = new FileIndex(data, mounts)
  try {
    const original = (await files.scan(mount.id)).entries[0]
    const childMount = await files.openChild(mount.id, original.id)
    const childFile = (await files.scan(childMount.id)).entries[0]
    renameSync(child, join(data, 'old-child')); mkdirSync(child); writeFileSync(join(child, 'asset.txt'), 'new')
    const preview = await files.prepareReplacement(mount.id, original.id)
    files.db.exec(`CREATE TRIGGER fail_parent_update BEFORE UPDATE ON files WHEN NEW.kind='directory' AND NEW.availability='available'
      BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END;`)
    await assert.rejects(files.confirmReplacement(mount.id, original.id, preview.token), /simulated write failure/)
    assert.equal(mounts.get(childMount.id).availability, 'available')
    assert.equal(files.list(mount.id).entries[0].availability, 'replaced')
    files.db.exec('DROP TRIGGER fail_parent_update')
    await files.close(); files = new FileIndex(data, mounts)
    const retry = await files.prepareReplacement(mount.id, original.id)
    const confirmed = await files.confirmReplacement(mount.id, original.id, retry.token)
    assert.equal(confirmed.id, original.id)
    assert.equal(confirmed.availability, 'available')
    assert.equal((await files.openChild(mount.id, original.id)).canvasId, childMount.canvasId)
    const after = await files.scan(childMount.id)
    assert.equal(after.entries[0].id, childFile.id)
    assert.equal(after.entries[0].availability, 'replaced')
    assert.deepEqual(await files.confirmReplacement(mount.id, original.id, retry.token), confirmed)
  } finally { await files.close(); mounts.close() }
})
