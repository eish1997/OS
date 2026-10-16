import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { randomUUID, createHash } from 'node:crypto'
import { resolve, join } from 'node:path'
import { openInstalledCanvas, resizeInstalledCanvas } from './native-host.mjs'
import { decodeCanvasPackage, encodeCanvasPackage } from '../local/canvas-package.mjs'

const fast = process.env.OS_CANVAS_IMPORT_FAST === '1'
const guardRecovery = process.env.OS_CANVAS_IMPORT_GUARD_RECOVERY === '1'
const hostRecord = process.env.OS_CANVAS_IMPORT_HOST_RECORD
  ? JSON.parse(await readFile(process.env.OS_CANVAS_IMPORT_HOST_RECORD, 'utf8')) : null
if (hostRecord) assert.equal(createHash('sha256').update(await readFile(hostRecord.executable)).digest('hex'), hostRecord.sha256)
const evidence = resolve(process.env.OS_CANVAS_IMPORT_EVIDENCE ?? resolve('output/dev-evidence/canvas-c05/desktop', fast ? 'import-diagnostic-fast' : 'import-diagnostic'))
await mkdir(evidence, { recursive: true })
const source = decodeCanvasPackage(await readFile('output/dev-evidence/canvas-c05/performance/native/save-20mib/fixture.oscanvas'))
const canvasId = randomUUID(), name = `Import diagnostic ${canvasId}`
const bytes = encodeCanvasPackage({ canvasId, references: source.manifest.references, layout: source.manifest.layout,
  revisions: source.manifest.revisions.map(r => ({ ...r, canvasId, metadata: { ...r.metadata, name }, scene: source.scenes.get(r.sceneHash) })) })
const packagePath = join(evidence, `${canvasId}.oscanvas`)
await writeFile(packagePath, bytes)
const result = { canvasId, name, fast, guardRecovery, hostRecord, checkpoints: [], requests: [], consoleErrors: [] }
let host, page
async function checkpoint(stage) {
  const data = await page.evaluate(() => {
    const s = window.openPencil.getStore()
    return { name: s.state.documentName, dirty: s.hasUnsavedChanges(), nodes: s.graph.getChildren(s.state.currentPageId).length,
      panX: s.state.panX, panY: s.state.panY, zoom: s.state.zoom,
      events: window.__importDiagnostic,
      clicks: window.__importClicks,
      alerts: [...document.querySelectorAll('[role=alert]')].map(e => e.textContent),
      saveStatus: document.querySelector('[data-slot="local-save-status"]')?.textContent,
      text: document.body.innerText }
  })
  result.checkpoints.push({ stage, ...data })
  await writeFile(join(evidence, 'result.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify({ stage, dirty: data.dirty, nodes: data.nodes, events: data.events.length }))
}
try {
  host = await openInstalledCanvas({ executablePath: hostRecord?.executable }); page = host.page
  page.on('requestfinished', async request => {
    if (!request.url().includes('/os-workspace/')) return
    const response = await request.response()
    result.requests.push({ event: 'finished', method: request.method(), path: new URL(request.url()).pathname,
      status: response?.status(), timing: request.timing() })
  })
  page.on('requestfailed', request => {
    if (request.url().includes('/os-workspace/')) result.requests.push({ event: 'failed', method: request.method(),
      path: new URL(request.url()).pathname, error: request.failure()?.errorText })
  })
  page.on('console', message => { if (message.type() === 'error') result.consoleErrors.push(message.text()) })
  await resizeInstalledCanvas(host)
  await page.evaluate(() => {
    const s = window.openPencil.getStore()
    s.state.autosaveEnabled = false
    window.__importDiagnostic = []
    window.__importClicks = []
    document.addEventListener('click', event => {
      if (!event.target.closest?.('[aria-label="本机画布列表"]')) return
      window.__importClicks.push({ at: performance.now(), text: event.target.textContent,
        dirty: s.hasUnsavedChanges(), nodes: s.graph.getChildren(s.state.currentPageId).length,
        panX: s.state.panX, panY: s.state.panY, zoom: s.state.zoom,
        saved: document.querySelector('[data-slot="local-save-status"]')?.textContent })
    }, true)
    for (const event of ['viewport:changed', 'graph:replaced']) s.onEditorEvent(event, () => {
      window.__importDiagnostic.push({ event, time: performance.now(), panX: s.state.panX, panY: s.state.panY, zoom: s.state.zoom })
    })
  })
  await page.getByRole('button', { name: '保存到本机', exact: true }).click()
  await host.expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机', { timeout: 30000 })
  await checkpoint('saved-before-import')
  await page.getByText('作品包', { exact: true }).click()
  if (!fast) await checkpoint('panel-expanded')
  await page.getByLabel('选择作品包导入').setInputFiles(packagePath, { timeout: 120000 })
  await host.expect(page.locator('[data-slot="package-status"]')).toContainText('作品已导入', { timeout: 120000 })
  if (!fast) await checkpoint('import-complete')
  await page.getByRole('button', { name: '本机画布', exact: true }).click()
  if (!fast) await checkpoint('list-open')
  await page.evaluate(name => { window.__targetName = name }, name)
  if (guardRecovery) {
    await page.evaluate(() => {
      const s = window.openPencil.getStore()
      const node = s.graph.createNode('RECTANGLE', s.state.currentPageId, {
        name: 'Unsaved import guard sentinel', x: 350, y: 200, width: 80, height: 60
      })
      window.__guardSentinel = node.id
      s.requestRender()
    })
  }
  await page.getByLabel('本机画布列表').getByRole('button', { name: new RegExp(`^${name} ·`) }).click()
  // Either a real replacement or the visible rejection must arrive; collect both.
  await host.expect.poll(async () => page.evaluate(() => window.openPencil.getStore().state.documentName === window.__targetName
    || document.body.innerText.includes('当前画布有未保存内容')
    || document.body.innerText.includes('打开期间发生新编辑')), { timeout: 30000 }).toBe(true)
  await checkpoint('open-attempt')
  if (guardRecovery) {
    await host.expect(page.getByText('当前画布有未保存内容，请先保存再打开其他画布。', { exact: true })).toBeVisible()
    assert.equal(await page.evaluate(() => {
      const s = window.openPencil.getStore()
      return s.graph.getNode(window.__guardSentinel)?.name === 'Unsaved import guard sentinel'
        && s.state.documentName !== window.__targetName
    }), true, 'Rejected open must preserve the unsaved graph')
    await page.getByRole('button', { name: '保存到本机', exact: true }).click()
    await host.expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机', { timeout: 30000 })
    await page.getByLabel('本机画布列表').getByRole('button', { name: new RegExp(`^${name} ·`) }).click()
    await host.expect.poll(() => page.evaluate(() => {
      const s = window.openPencil.getStore()
      return s.state.documentName === window.__targetName && s.graph.getChildren(s.state.currentPageId).length === 1000
    }), { timeout: 30000 }).toBe(true)
    await checkpoint('saved-and-retried')
  }
  await page.screenshot({ path: join(evidence, 'open-attempt.png') })
  const last = result.checkpoints.at(-1)
  result.status = last.nodes === 1000 && last.name === name ? (guardRecovery ? 'guard-recovery-passed' : 'opened') : 'rejection-reproduced'
  if (guardRecovery) assert.equal(result.status, 'guard-recovery-passed')
  assert.deepEqual(host.errors, [])
} catch (error) { result.status = 'failed'; result.error = error.stack; await checkpoint('failure').catch(() => {}); throw error }
finally { await writeFile(join(evidence, 'result.json'), JSON.stringify(result, null, 2)); await host?.close() }
