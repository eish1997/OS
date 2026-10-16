import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { decodeCanvasPackage, encodeCanvasPackage } from '../local/canvas-package.mjs'

const root = process.cwd()
const { chromium, expect } = createRequire(resolve(root, '.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const evidence = resolve(root, process.env.OS_CANVAS_EVIDENCE_DIR ?? 'output/dev-evidence/canvas-c05/packages')
await mkdir(evidence, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })
const errors = []
page.on('pageerror', error => errors.push(error.message))
try {
  await page.goto(`${process.env.OS_CANVAS_TEST_URL ?? 'http://localhost:14270'}/?test&os-canvas&no-rulers`)
  await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 60000 })
  await page.evaluate(() => {
    const store = window.openPencil.getStore()
    store.graph.createNode('RECTANGLE', store.state.currentPageId, { name: 'Package original',
      x: 450, y: 250, width: 200, height: 150 })
    store.requestRender()
  })
  await page.getByText('作品包', { exact: true }).click()
  await expect(page.getByRole('button', { name: '导出作品包', exact: true })).toBeEnabled()
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出作品包', exact: true }).click()
  const download = await downloaded
  const downloadedPath = resolve(evidence, 'exported.oscanvas')
  await download.saveAs(downloadedPath)
  const decoded = decodeCanvasPackage(await readFile(downloadedPath))
  assert.ok(decoded.manifest.revisions.length)
  const originalNames = await page.evaluate(() => [...window.openPencil.getStore().graph.nodes.values()].map(n => n.name))
  // Independent import identity for this UI smoke. Fresh-store roundtrip has a
  // separate acceptance probe; this verifies importing never replaces the editor.
  const canvasId = randomUUID(), importedName = `Imported package ${randomUUID()}`
  const packageBytes = encodeCanvasPackage({ canvasId,
    revisions: decoded.manifest.revisions.map(row => ({ ...row, canvasId,
      metadata: { ...row.metadata, name: importedName }, scene: decoded.scenes.get(row.sceneHash) })),
    layout: { ...decoded.manifest.layout, panels: { layers: false, properties: false } }, references: decoded.manifest.references })
  let droppedUpload = false
  await page.route('**/os-workspace/package-imports/*', async route => {
    if (droppedUpload || route.request().method() !== 'POST' || route.request().url().endsWith('/resume')) return route.continue()
    const prepared = await route.fetch()
    assert.equal(prepared.status(), 200)
    droppedUpload = true
    await route.abort('failed')
  })
  await page.getByLabel('选择作品包导入').setInputFiles({ name: 'smoke.oscanvas', mimeType: 'application/octet-stream', buffer: packageBytes })
  await expect(page.getByRole('button', { name: '重试导入 smoke.oscanvas', exact: true })).toBeEnabled()
  assert.equal(droppedUpload, true)
  await page.getByRole('button', { name: '重试导入 smoke.oscanvas', exact: true }).click()
  await expect(page.locator('[data-slot="package-status"]')).toContainText('作品已导入', { timeout: 30000 })
  assert.deepEqual(await page.evaluate(() => [...window.openPencil.getStore().graph.nodes.values()].map(n => n.name)), originalNames)
  await expect(page.getByLabel('本机画布列表').getByRole('button', { name: new RegExp(importedName) })).toBeVisible()
  await page.getByRole('button', { name: '导入记录', exact: true }).click()
  await expect(page.getByLabel('作品包导入记录')).toContainText(canvasId)
  const importedRow = page.getByLabel('作品包导入记录').locator('div').filter({ hasText: canvasId })
  await importedRow.getByRole('button', { name: '应用包内布局', exact: true }).click()
  await expect(page.locator('[data-slot="package-status"]')).toContainText('已应用包内布局')
  await expect(page.locator('[data-slot="os-layers-overlay"]')).toBeHidden()
  await expect(page.locator('[data-slot="os-properties-overlay"]')).toBeHidden()
  assert.deepEqual(await page.evaluate(() => [...window.openPencil.getStore().graph.nodes.values()].map(n => n.name)), originalNames)
  let releaseRead
  const heldRead = new Promise(resolve => { releaseRead = resolve })
  let sawRead
  const requestedRead = new Promise(resolve => { sawRead = resolve })
  await page.route('**/os-workspace/layout', async route => {
    if (route.request().method() !== 'GET') return route.continue()
    sawRead(); await heldRead; await route.continue()
  })
  await importedRow.getByRole('button', { name: '应用包内布局', exact: true }).click()
  await requestedRead
  await page.getByRole('button', { name: '图层面板', exact: true }).click()
  releaseRead()
  await expect(page.getByText('布局正在保存或已有新修改，请稍后再应用。', { exact: true })).toBeVisible()
  await expect(page.locator('[data-slot="os-layers-overlay"]')).toBeVisible()
  await expect.poll(() => page.evaluate(async () => (await (await fetch('/os-workspace/layout', {
    headers: { 'X-OS-Workspace': '1' } })).json()).layout.panels)).toEqual({ layers: true, properties: false })
  await page.unroute('**/os-workspace/layout')
  await page.screenshot({ path: resolve(evidence, 'smoke.png') })
  assert.deepEqual(errors, [])
  await writeFile(resolve(evidence, 'smoke.json'), JSON.stringify({ status: 'passed', canvasId,
    checks: ['real download decodes', 'binary file import', 'lost upload response exact retry', 'current editor preserved', 'imported canvas listed', 'journal listed', 'explicit preset applied without graph changes', 'new layout edit wins during preset read'] }, null, 2))
} finally { await browser.close() }
