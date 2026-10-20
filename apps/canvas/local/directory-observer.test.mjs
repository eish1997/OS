import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { MountStore } from './mount-store.mjs'
import { FileIndex } from './file-index.mjs'
import { DirectoryObserver } from './directory-observer.mjs'

test('directory events, offline recovery, missed-event reconciliation and lease cleanup', async () => {
  const data = mkdtempSync(join(tmpdir(), 'canvas-observer-'))
  const root = join(data, 'root'), offline = join(data, 'offline')
  mkdirSync(root)
  const mounts = new MountStore(data), mount = mounts.add(root), files = new FileIndex(data, mounts)
  const observer = new DirectoryObserver(files, mounts, { reconcileMs: 100, leaseMs: 200 })
  try {
    assert.equal((await observer.poll(mount.id)).entries.length, 0)
    writeFileSync(join(root, '中文.txt'), 'first')
    let result
    for (let attempt = 0; attempt < 30; attempt++) {
      result = await observer.poll(mount.id)
      if (result.entries.length) break
      await delay(20)
    }
    assert.equal(result.entries[0].path, '中文.txt')
    const id = result.entries[0].id
    // Simulate an unavailable event source: integrity reconciliation must still work.
    observer.entries.get(mount.id).watcher.close()
    renameSync(join(root, '中文.txt'), join(root, 'changed.txt'))
    await delay(110)
    result = await observer.poll(mount.id)
    assert.equal(result.entries[0].path, 'changed.txt')
    assert.equal(result.entries[0].id, id)
    renameSync(root, offline)
    assert.equal((await observer.poll(mount.id)).scanStatus, 'offline')
    renameSync(offline, root)
    assert.equal((await observer.poll(mount.id)).scanStatus, 'complete')
    await delay(250)
    assert.equal(observer.entries.size, 0)
    assert.equal((await observer.poll(mount.id)).entries[0].id, id)
  } finally { observer.close(); await files.close(); mounts.close() }
  assert.equal(observer.entries.size, 0)
})
