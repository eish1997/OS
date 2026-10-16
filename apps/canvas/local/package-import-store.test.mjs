import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { WorkspaceStore } from './workspace-store.mjs'
import { MountStore } from './mount-store.mjs'
import { FileIndex } from './file-index.mjs'
import { LayoutStore } from './layout-store.mjs'
import { PackageImportStore } from './package-import-store.mjs'
import { encodeCanvasPackage } from './canvas-package.mjs'

function sample() {
  const canvasId = randomUUID(), mountId = randomUUID()
  const revisions = [1, 2].map(revision => {
    const scene = readFileSync(new URL(`./fixtures/revision-${revision}.fig`, import.meta.url))
    return { canvasId, revision, scene, sceneHash: createHash('sha256').update(scene).digest('hex'),
      metadata: { formatVersion: 1, mountId, name: `Version ${revision}` }, createdAt: '2026-10-15T00:00:00.000Z' }
  })
  return { canvasId, revisions, layout: { formatVersion: 1, panels: { layers: false, properties: false }, custom: 'retained' },
    references: { formatVersion: 1, mounts: [{ id: mountId, canvasId, path: join(tmpdir(), randomUUID()) }],
      files: [{ id: randomUUID(), mountId, path: 'absent.txt', kind: 'file', size: '12', revision: 3, availability: 'available' }] } }
}

function open(directory) {
  const workspace = new WorkspaceStore(directory), mounts = new MountStore(directory)
  const files = new FileIndex(directory, mounts), layout = new LayoutStore(directory)
  const imports = new PackageImportStore(directory, { workspace, mounts, files, layout })
  return { workspace, mounts, files, layout, imports,
    async close() { imports.close(); await files.close(); mounts.close(); layout.close(); workspace.close() } }
}

test('package import resumes after actual process exit at every participant commit', async () => {
  const modules = ['WorkspaceStore', 'MountStore', 'FileIndex', 'LayoutStore', 'PackageImportStore']
  const names = ['workspace-store', 'mount-store', 'file-index', 'layout-store', 'package-import-store']
  const script = modules.map((name, i) => `import { ${name} } from ${JSON.stringify(new URL(`./${names[i]}.mjs`, import.meta.url).href)};`).join('\n') + `
    const [directory, id, stage] = process.argv.slice(1);
    const workspace = new WorkspaceStore(directory), mounts = new MountStore(directory);
    const files = new FileIndex(directory, mounts), layout = new LayoutStore(directory);
    const participants = { workspace, mounts, files, layout };
    const imports = new PackageImportStore(directory, participants);
    const method = stage === 'workspace' ? 'importHistory' : stage === 'layout' ? 'importPreset' : 'importReferences';
    const target = participants[stage], original = target[method].bind(target);
    target[method] = (...args) => { original(...args); process.exit(73); };
    imports.resume(id);
  `
  for (const stage of ['mounts', 'files', 'workspace', 'layout']) {
    const directory = mkdtempSync(join(tmpdir(), 'canvas-import-journal-')), input = sample()
    const bytes = encodeCanvasPackage(input), id = randomUUID()
    let stores = open(directory)
    stores.imports.prepare(id, bytes)
    await stores.close()
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script, directory, id, stage], { encoding: 'utf8', windowsHide: true })
    assert.equal(child.status, 73, child.stderr)
    stores = open(directory)
    try {
      assert.equal(stores.imports.list()[0].state, 'prepared')
      const laterLayout = { formatVersion: 1, panels: { layers: true, properties: true } }
      if (stage === 'layout') stores.layout.save({ operationId: randomUUID(), expectedRevision: 1, layout: laterLayout })
      const result = stores.imports.resume(id)
      assert.equal(result.revision, 2)
      assert.equal(result.layoutApplied, true)
      for (const revision of input.revisions) assert.deepEqual(stores.workspace.read(input.canvasId, revision.revision), revision)
      assert.deepEqual(stores.layout.read().layout, stage === 'layout' ? laterLayout : input.layout)
      assert.equal(stores.mounts.list()[0].availability, 'offline')
      assert.equal(stores.files.list(input.references.mounts[0].id).entries[0].id, input.references.files[0].id)
      assert.equal(stores.files.list(input.references.mounts[0].id).entries[0].availability, 'missing')
      assert.deepEqual(stores.imports.resume(id), result)
      assert.equal(stores.imports.list()[0].state, 'complete')
      assert.throws(() => stores.imports.prepare(randomUUID(), bytes), { code: 'conflict' })
      assert.throws(() => stores.imports.prepare(id, encodeCanvasPackage(sample())), { code: 'operation-conflict' })
    } finally { await stores.close() }
  }
})

test('preparation rejects target conflicts before creating any import or directory state', async () => {
  const stores = open(mkdtempSync(join(tmpdir(), 'canvas-import-conflict-'))), input = sample()
  try {
    const row = input.revisions[0]
    stores.workspace.save({ ...row, expectedRevision: 0, operationId: randomUUID() })
    assert.throws(() => stores.imports.prepare(randomUUID(), encodeCanvasPackage(input)), { code: 'conflict' })
    assert.deepEqual(stores.imports.list(), [])
    assert.deepEqual(stores.mounts.list(), [])
    assert.equal(stores.workspace.read(input.canvasId).metadata.name, 'Version 1')
  } finally { await stores.close() }
})

test('import preserves an existing user layout and retains the imported preset', async () => {
  const stores = open(mkdtempSync(join(tmpdir(), 'canvas-import-layout-'))), input = sample(), id = randomUUID()
  try {
    stores.imports.prepare(id, encodeCanvasPackage(input))
    const userLayout = { formatVersion: 1, panels: { layers: true, properties: false } }
    stores.layout.save({ operationId: randomUUID(), expectedRevision: 0, layout: userLayout })
    const result = stores.imports.resume(id)
    assert.equal(result.layoutApplied, false)
    assert.deepEqual(result.layout, input.layout)
    assert.deepEqual(stores.layout.read().layout, userLayout)
    assert.deepEqual(stores.layout.importPreset(id, input.layout), { applied: false, layout: input.layout })
  } finally { await stores.close() }
})
