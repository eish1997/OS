import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { randomUUID, createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { openInstalledCanvas, resizeInstalledCanvas } from './native-host.mjs'
import { encodeCanvasPackage, decodeCanvasPackage } from '../local/canvas-package.mjs'

const evidence = resolve('output/dev-evidence/canvas-c05/performance/native')
await mkdir(evidence, { recursive: true })
const fixture = JSON.parse(await readFile('output/dev-evidence/canvas-c05/performance/distinct-images/canvas-scale.json', 'utf8'))
assert.equal(fixture.fixture.distinctImages, 200)
const source = resolve('.runtime/canvas-c05-prod-source')
const db = new DatabaseSync(join(source, 'workspace.sqlite'), { readOnly: true })
const row = db.prepare('SELECT * FROM revisions WHERE canvas_id=? AND revision=1').get(fixture.canvasId)
db.close()
assert.ok(row)
const scene = await readFile(join(source, 'scenes', `${row.scene_hash}.fig`))
assert.equal(createHash('sha256').update(scene).digest('hex'), row.scene_hash)
const plain = decodeCanvasPackage(await readFile('output/dev-evidence/canvas-c05/production/packages/exported.oscanvas'))
const canvasId = randomUUID(), name = `Native scale ${canvasId}`
const bytes = encodeCanvasPackage({ canvasId, layout: plain.manifest.layout,
  references: { formatVersion: 1, mounts: [], files: [] },
  revisions: [{ canvasId, revision: 1, sceneHash: row.scene_hash, scene,
    createdAt: row.created_at, metadata: { ...JSON.parse(row.metadata), name } }] })
const packagePath = join(evidence, 'fixture.oscanvas')
await writeFile(packagePath, bytes)
const result = { canvasId, name, fixture: fixture.fixture, snapshotBytes: scene.length, measurements: {},
  scope: 'Installed Windows release, existing native application store; fresh WebView profiles, warm filesystem caches. Actual snapshot bytes recorded; not the 20 MiB save acceptance sample.' }
let host, page
async function open() {
  const start = performance.now()
  host = await openInstalledCanvas(); page = host.page
  const elapsed = performance.now() - start
  await resizeInstalledCanvas(host)
  await page.evaluate(() => { window.openPencil.getStore().state.autosaveEnabled = false })
  return elapsed
}
async function load() {
  // Commit the owned test draft/view before switching; do not bypass unsaved-work protection.
  await page.getByRole('button', { name: '保存到本机', exact: true }).click()
  await host.expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机', { timeout: 30000 })
  await page.getByRole('button', { name: '本机画布', exact: true }).click()
  const button = page.getByLabel('本机画布列表').getByRole('button', { name: new RegExp(`^${name} ·`) })
  await button.waitFor()
  await page.evaluate(() => { window.__previousNativeGraph = window.openPencil.getStore().graph })
  const start = performance.now()
  await button.click()
  await host.expect.poll(() => page.evaluate(() => {
    const s = window.openPencil.getStore()
    return s.graph !== window.__previousNativeGraph ? s.graph.getChildren(s.state.currentPageId).length : 0
  }), { timeout: 120000 }).toBe(1000)
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const ms = performance.now() - start
  const contents = await page.evaluate(() => {
    const s = window.openPencil.getStore(), nodes = s.graph.getChildren(s.state.currentPageId)
    const images = nodes.flatMap(n => n.fills.filter(f => f.type === 'IMAGE').map(f => f.imageHash))
    return { objects: nodes.length, images: images.length, distinctImages: new Set(images).size,
      viewport: { width: innerWidth, height: innerHeight } }
  })
  assert.equal(contents.images, 200); assert.equal(contents.distinctImages, 200)
  assert.deepEqual(contents.viewport, { width: 1440, height: 900 })
  result.contents = contents
  return ms
}
try {
  result.measurements.importHostStartupMs = await open()
  await page.getByText('作品包', { exact: true }).click()
  await page.getByLabel('选择作品包导入').setInputFiles(packagePath, { timeout: 120000 })
  await host.expect(page.locator('[data-slot="package-status"]')).toContainText('作品已导入', { timeout: 120000 })
  result.measurements.firstOpenMs = await load()
  console.log('Native imported and opened', result.measurements.firstOpenMs)
  await page.evaluate(() => {
    const s = window.openPencil.getStore()
    s.state.autosaveEnabled = false
    const node = s.graph.getChildren(s.state.currentPageId).find(n => n.name === 'Scale shape 0')
    s.graph.updateNode(node.id, { name: 'Native saved shape' }); s.requestRender()
  })
  const start = performance.now()
  await page.getByRole('button', { name: '保存到本机', exact: true }).click()
  await host.expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机', { timeout: 120000 })
  result.measurements.saveMs = performance.now() - start
  assert.deepEqual(host.errors, [])
  await host.close(); host = undefined
  result.measurements.restartedHostStartupMs = await open()
  result.measurements.restartedOpenMs = await load()
  await host.expect.poll(() => page.evaluate(() => [...window.openPencil.getStore().graph.nodes.values()].filter(n => n.name === 'Native saved shape').length)).toBe(1)
  result.measurements.sameProcessReopenMs = await load()
  await page.screenshot({ path: join(evidence, 'scale.png') })
  assert.deepEqual(host.errors, [])
  result.status = ['firstOpenMs', 'restartedOpenMs', 'sameProcessReopenMs'].every(k => result.measurements[k] <= 5000) ? 'open-passed' : 'open-budget-exceeded'
  console.log(JSON.stringify(result))
} catch (error) {
  result.status = 'failed'; result.error = error.stack
  await page?.screenshot({ path: join(evidence, 'scale-failure.png') }).catch(() => {})
  throw error
} finally {
  await writeFile(join(evidence, 'scale.json'), JSON.stringify(result, null, 2))
  await host?.close()
}
