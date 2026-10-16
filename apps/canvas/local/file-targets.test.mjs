import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MountStore } from './mount-store.mjs'
import { FileIndex } from './file-index.mjs'
import { FileTargets } from './file-targets.mjs'

test('target previews reuse indexed assets, reject stale content and do not follow links', async () => {
  const data = mkdtempSync(join(tmpdir(), 'canvas-target-')), folder = join(data, 'target')
  mkdirSync(folder); writeFileSync(join(folder, 'file.txt'), 'target')
  const mounts = new MountStore(data), files = new FileIndex(data, mounts), targets = new FileTargets(files, mounts)
  try {
    const first = await targets.preview(join(folder, 'file.txt'))
    assert.deepEqual(mounts.list(), [])
    const again = await targets.preview(join(folder, 'file.txt'))
    const initial = await targets.confirm(first.token)
    assert.equal(initial.id, (await targets.confirm(again.token)).id)
    assert.deepEqual(await targets.confirm(first.token), initial)
    appendFileSync(join(folder, 'file.txt'), ' changed')
    await assert.rejects(targets.confirm(first.token), { code: 'conflict' })
    const current = await targets.preview(join(folder, 'file.txt'))
    const updated = await targets.confirm(current.token)
    assert.equal(updated.id, initial.id)
    assert.ok(updated.revision > initial.revision)
    await assert.rejects(targets.preview('../file.txt'), { code: 'invalid' })
    symlinkSync(folder, join(data, 'link'), process.platform === 'win32' ? 'junction' : 'dir')
    await assert.rejects(targets.preview(join(data, 'link')), { code: 'invalid' })
    await assert.rejects(targets.confirm('unknown'), { code: 'conflict' })
  } finally { await files.close(); mounts.close() }
})
