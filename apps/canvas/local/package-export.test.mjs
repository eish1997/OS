import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { WorkspaceStore } from './workspace-store.mjs'
import { MountStore } from './mount-store.mjs'
import { FileIndex } from './file-index.mjs'
import { LayoutStore } from './layout-store.mjs'
import { exportCanvasPackage } from './package-export.mjs'
import { decodeCanvasPackage } from './canvas-package.mjs'
import { parseFigBuffer, patchFigArchive } from '../../../.runtime/open-pencil-upstream/packages/fig/dist/index.js'

function withLink(key, value) {
  const raw = readFileSync(new URL('./fixtures/revision-1.fig', import.meta.url))
  const buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)
  const parsed = parseFigBuffer(buffer)
  const node = parsed.nodeChanges.find(row => row.type === 'RECTANGLE')
  assert.ok(node)
  return patchFigArchive(buffer, { records: [{ ...node, pluginData: [...(node.pluginData ?? []),
    { pluginID: 'os.canvas', key, value }] }], blobs: [], removed: [], replaceVariables: false },
  { thumbnailPNG: parsed.thumbnailPNG ?? new Uint8Array(), metaJSON: parsed.metaJSON ?? '{}', images: [] })
}

test('export reads actual FIG history and includes old references without unrelated local assets', async () => {
  const data = mkdtempSync(join(tmpdir(), 'canvas-export-history-'))
  const root = join(data, 'root'), external = join(data, 'external')
  mkdirSync(root); mkdirSync(external)
  writeFileSync(join(root, 'current.txt'), 'current'); writeFileSync(join(root, 'unrelated.txt'), 'private unrelated')
  writeFileSync(join(external, 'old.txt'), 'old external')
  const workspace = new WorkspaceStore(data), mounts = new MountStore(data)
  const files = new FileIndex(data, mounts), layout = new LayoutStore(data)
  try {
    const first = mounts.add(root), oldMount = mounts.add(external)
    const current = (await files.scan(first.id)).entries.find(row => row.path === 'current.txt')
    const old = (await files.scan(oldMount.id)).entries[0]
    const scene1 = withLink('os.canvas/fileLink', JSON.stringify(old))
    const scene2 = withLink('os.canvas/outputLinks', JSON.stringify([current]))
    const canvasId = first.canvasId
    for (const [index, scene] of [scene1, scene2].entries()) workspace.save({ canvasId, operationId: randomUUID(),
      expectedRevision: index, scene, metadata: { formatVersion: 1, mountId: first.id } })
    renameSync(join(external, 'old.txt'), join(external, 'renamed.txt'))
    await files.scan(oldMount.id)
    const options = { workspace, mounts, files, layout, canvasId, expectedRevision: 2 }
    const { manifest, scenes } = decodeCanvasPackage(await exportCanvasPackage(options))
    assert.equal(manifest.revisions.length, 2)
    assert.deepEqual(new Set(manifest.references.mounts.map(row => row.id)), new Set([first.id, oldMount.id]))
    assert.deepEqual(new Set(manifest.references.files.map(row => row.id)), new Set([old.id, current.id]))
    assert.equal(manifest.references.files.find(row => row.id === old.id).path, 'renamed.txt')
    assert.deepEqual(scenes.get(manifest.revisions[0].sceneHash), Buffer.from(scene1))
    assert.deepEqual(scenes.get(manifest.revisions[1].sceneHash), Buffer.from(scene2))
    await assert.rejects(exportCanvasPackage({ ...options, expectedRevision: 1 }), { code: 'conflict' })
    files.db.prepare('DELETE FROM files WHERE id=?').run(old.id)
    await assert.rejects(exportCanvasPackage(options), { code: 'not-found' })
    assert.equal(workspace.read(canvasId).revision, 2)
  } finally { await files.close(); mounts.close(); layout.close(); workspace.close() }
})

test('export refuses a malformed historical file link instead of silently losing its association', async () => {
  const data = mkdtempSync(join(tmpdir(), 'canvas-export-corrupt-'))
  const workspace = new WorkspaceStore(data), mounts = new MountStore(data)
  const files = new FileIndex(data, mounts), layout = new LayoutStore(data), canvasId = randomUUID()
  try {
    workspace.save({ canvasId, operationId: randomUUID(), expectedRevision: 0,
      scene: withLink('os.canvas/fileLink', '{broken'), metadata: { formatVersion: 1 } })
    await assert.rejects(exportCanvasPackage({ workspace, mounts, files, layout, canvasId, expectedRevision: 1 }), { code: 'corrupt' })
  } finally { await files.close(); mounts.close(); layout.close(); workspace.close() }
})
