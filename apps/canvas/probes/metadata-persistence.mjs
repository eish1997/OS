import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const { chromium, expect } = createRequire(resolve(root, '.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const output = resolve(root, 'output/dev-evidence/canvas-c02')
const base = process.env.OS_CANVAS_TEST_URL ?? 'http://localhost:14230'
const name = `Metadata-${Date.now()}`
const extension = { type: 'example.uninstalled', version: '9.1', config: { nested: [null, false, '保留'] } }
let browser, page
async function open() {
  browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] })
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(`${base}/?test&os-canvas&no-rulers`)
  await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 60000 })
  await page.locator('#loader').waitFor({ state: 'detached' })
}
async function saved(revision) {
  await page.getByRole('button', { name: '保存到本机', exact: true }).click()
  await expect(page.getByRole('button', { name: `${name} · ${revision}`, exact: true })).toBeVisible({ timeout: 30000 })
}
try {
  await mkdir(output, { recursive: true })
  await open()
  await page.evaluate(name => {
    const s = window.openPencil.getStore()
    s.state.autosaveEnabled = false; s.state.documentName = name
    s.graph.createNode('RECTANGLE', s.state.currentPageId, { name: 'Editable', x: 380, y: 180, width: 100, height: 100 })
  }, name)
  await saved(1)
  const id = await page.evaluate(async ({ name, extension }) => {
    const headers = { 'X-OS-Workspace': '1', 'Content-Type': 'application/json' }
    const list = await (await fetch('/os-workspace/canvases', { headers })).json()
    const doc = list.find(d => d.metadata.name === name)
    const response = await fetch(`/os-workspace/canvases/${doc.canvasId}/scene`, { headers })
    const bytes = new Uint8Array(await response.arrayBuffer())
    const metadata = { ...doc.metadata, extension, view: { ...doc.metadata.view, futureView: extension },
      pages: doc.metadata.pages.map(p => ({ ...p, futurePage: extension })) }
    const save = await fetch(`/os-workspace/canvases/${doc.canvasId}`, { method: 'POST', headers,
      body: JSON.stringify({ operationId: crypto.randomUUID(), expectedRevision: 1, metadata,
        sceneBase64: btoa(Array.from(bytes, b => String.fromCharCode(b)).join('')) }) })
    if (!save.ok) throw new Error(`Fixture save failed: ${save.status}`)
    return doc.canvasId
  }, { name, extension })
  await browser.close(); await open()
  await page.getByRole('button', { name: '本机画布', exact: true }).click()
  await page.getByRole('button', { name: `${name} · 2`, exact: true }).click()
  await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机')
  await page.evaluate(() => {
    const s = window.openPencil.getStore(); s.state.autosaveEnabled = false
    const node = [...s.graph.nodes.values()].find(n => n.name === 'Editable')
    s.graph.updateNode(node.id, { name: 'Edited' })
    s.pan(13, 17)
  })
  await saved(3)
  const metadata = await page.evaluate(async id => {
    const r = await fetch(`/os-workspace/canvases/${id}`, { headers: { 'X-OS-Workspace': '1' } })
    return (await r.json()).metadata
  }, id)
  assert.deepEqual(metadata.extension, extension)
  assert.deepEqual(metadata.view.futureView, extension)
  assert.deepEqual(metadata.pages[0].futurePage, extension)
  // A simulated future-version list entry must not hide compatible real disk records.
  let futureRequests = 0
  const futureId = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
  await page.route(`**/os-workspace/canvases/${futureId}**`, route => {
    futureRequests++; return route.abort()
  })
  await page.route('**/os-workspace/canvases', async route => {
    const response = await route.fetch()
    const entries = await response.json()
    await route.fulfill({ response, json: [...entries, { canvasId: futureId, revision: 1,
      metadata: { formatVersion: 99, name: 'Future format fixture' } }] })
  })
  await page.getByRole('button', { name: '本机画布', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Future format fixture · 1', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Future format fixture · 1', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('不支持的作品格式')
  assert.equal(futureRequests, 0)
  await page.getByRole('button', { name: `${name} · 3`, exact: true }).click()
  await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机')
  assert.equal(await page.evaluate(() => [...window.openPencil.getStore().graph.nodes.values()].some(n => n.name === 'Edited')), true)
  await writeFile(resolve(output, 'metadata-persistence.json'), JSON.stringify({ status: 'passed', date: new Date().toISOString(), metadata,
    checks: ['unknown metadata survives real disk edit/save', 'simulated future format does not hide compatible records',
      'unsupported open makes no scene or save request', 'compatible real disk record remains editable'], futureRequests }, null, 2))
  console.log('PASS: unknown metadata retained; future format refuses open without hiding compatible records')
} catch (error) {
  await writeFile(resolve(output, 'metadata-failure.txt'), String(error.stack ?? error))
  throw error
} finally { await browser?.close() }
