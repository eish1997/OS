import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorkspaceStore } from './workspace-store.mjs'
import { LayoutStore } from './layout-store.mjs'

test('layout has independent persistence, revisions, retries and version rejection', () => {
  const directory = mkdtempSync(join(tmpdir(), 'os-canvas-layout-'))
  const workspace = new WorkspaceStore(directory)
  let layout = new LayoutStore(directory)
  const canvasId = randomUUID()
  const scene = readFileSync(new URL('./fixtures/revision-2.fig', import.meta.url))
  workspace.save({ canvasId, operationId: randomUUID(), expectedRevision: 0, scene, metadata: { formatVersion: 1 } })
  const before = workspace.read(canvasId)
  const input = { operationId: randomUUID(), expectedRevision: 0,
    layout: { formatVersion: 1, panels: { layers: false, properties: true } } }
  try {
    assert.equal(layout.read().revision, 0)
    assert.deepEqual(layout.save(input), { revision: 1 })
    assert.deepEqual(layout.save(input), { revision: 1 })
    assert.throws(() => layout.save({ ...input, operationId: randomUUID() }), { code: 'conflict' })
    assert.throws(() => layout.save({ ...input, layout: { formatVersion: 2 } }), { code: 'unsupported-version' })
    layout.close(); layout = new LayoutStore(directory)
    assert.deepEqual(layout.read(), { revision: 1, layout: input.layout })
    assert.deepEqual(workspace.read(canvasId), before)
    // A future payload is retained and rejected, not replaced with the default.
    layout.db.prepare('UPDATE current_layout SET payload=?').run('{"formatVersion":99,"keep":"future"}')
    assert.throws(() => layout.read(), { code: 'unsupported-version' })
    assert.throws(() => layout.save({ ...input, operationId: randomUUID(), expectedRevision: 1 }), { code: 'unsupported-version' })
    assert.equal(layout.db.prepare('SELECT payload FROM current_layout').get().payload, '{"formatVersion":99,"keep":"future"}')
    assert.deepEqual(workspace.read(canvasId), before)
  } finally { layout.close(); workspace.close() }
})
