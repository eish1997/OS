import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const root = process.cwd()
const { chromium, expect } = createRequire(resolve(root, '.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const evidence = resolve(root, process.env.OS_CANVAS_SCALE_EVIDENCE ?? 'output/dev-evidence/canvas-c05/performance')
await mkdir(evidence, { recursive: true })
const base = process.env.OS_CANVAS_TEST_URL ?? 'http://localhost:14290'
const name = `Scale-${Date.now()}`
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] })
let page
const result = { name, environment: 'production browser, 1440x900, Edge with software-rendering fallback permitted', measurements: {}, limits: { openMs: 5000, saveMs: 2000 } }
const errors = []
async function open() {
  page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })
  page.on('pageerror', e => errors.push(e.message))
  const start = performance.now()
  await page.goto(`${base}/?test&os-canvas&no-rulers`)
  await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 60000 })
  return performance.now() - start
}
async function loadSaved() {
  await page.getByRole('button', { name: '本机画布', exact: true }).click()
  const button = page.getByLabel('本机画布列表').getByRole('button', { name: new RegExp(`^${name} ·`) })
  await button.waitFor()
  await page.evaluate(() => { window.__scalePreviousGraph = window.openPencil.getStore().graph })
  const start = performance.now()
  await button.click()
  await expect.poll(() => page.evaluate(() => window.openPencil.getStore().graph !== window.__scalePreviousGraph
    ? [...window.openPencil.getStore().graph.nodes.values()].filter(n => n.type === 'RECTANGLE').length : 0), { timeout: 120000 }).toBe(1000)
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  return performance.now() - start
}
try {
  result.measurements.fixtureStartupMs = await open()
  result.fixture = await page.evaluate(async name => {
    const s = window.openPencil.getStore()
    s.state.autosaveEnabled = false; s.state.documentName = name
    const canvas = document.createElement('canvas'); canvas.width = 1920; canvas.height = 1080
    const ctx = canvas.getContext('2d'), data = ctx.createImageData(1920, 1080)
    let seed = 123456789
    for (let i = 0; i < data.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      const noise = (seed >>> 24) % 48
      data.data[i] = 80 + noise; data.data[i + 1] = 100 + noise; data.data[i + 2] = 140 + noise; data.data[i + 3] = 255
    }
    ctx.putImageData(data, 0, 0)
    let imageBytes = 0
    const hashes = new Set()
    for (let i = 0; i < 200; i++) {
      ctx.fillStyle = `rgb(${i},${255-i},100)`; ctx.fillRect(0, 0, 100, 100)
      // A one-step RGB difference can disappear in JPEG quantization. Encode the
      // image index in high-contrast blocks so every asset remains distinct.
      for (let bit = 0; bit < 8; bit++) {
        ctx.fillStyle = i & (1 << bit) ? '#ffffff' : '#000000'
        ctx.fillRect(bit * 32, 128, 32, 64)
      }
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.5))
      const bytes = new Uint8Array(await blob.arrayBuffer()); imageBytes += bytes.length
      const hash = s.storeImage(bytes)
      if (hashes.has(hash)) throw new Error(`Fixture JPEG collision at image ${i}`)
      hashes.add(hash)
      s.graph.createNode('RECTANGLE', s.state.currentPageId, { name: `Scale image ${i}`,
        x: 340 + i % 4 * 190, y: i < 8 ? 150 + Math.floor(i / 4) * 130 : 5000 + Math.floor(i / 4) * 130,
        width: 180, height: 101.25, fills: [{ type: 'IMAGE', imageHash: hash, imageScaleMode: 'FILL',
          color: { r: 0, g: 0, b: 0, a: 1 }, visible: true, opacity: 1 }] })
    }
    for (let i = 0; i < 800; i++) s.graph.createNode('RECTANGLE', s.state.currentPageId, {
      name: `Scale shape ${i}`, x: 10000 + i % 40 * 60, y: Math.floor(i / 40) * 60, width: 40, height: 40 })
    s.requestRender()
    return { objects: 1000, images: 200, distinctImages: hashes.size, imageWidth: 1920, imageHeight: 1080, visibleImages: 8, imageBytes, seed: 123456789 }
  }, name)
  console.log('Fixture ready', JSON.stringify(result.fixture))
  const saveStart = performance.now()
  await page.getByRole('button', { name: '保存到本机', exact: true }).click()
  await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机', { timeout: 120000 })
  result.measurements.saveMs = performance.now() - saveStart
  const saved = await page.evaluate(async name => (await (await fetch('/os-workspace/canvases', {
    headers: { 'X-OS-Workspace': '1' } })).json()).find(row => row.metadata.name === name), name)
  result.canvasId = saved.canvasId
  console.log('Saved', result.canvasId, result.measurements.saveMs)
  result.snapshotBytes = await page.evaluate(async id => (await (await fetch(`/os-workspace/canvases/${id}/scene`, {
    headers: { 'X-OS-Workspace': '1' } })).arrayBuffer()).byteLength, saved.canvasId)
  await page.close()
  result.measurements.newPageStartupMs = await open()
  result.measurements.newPageOpenMs = await loadSaved()
  console.log('Opened', result.measurements.newPageOpenMs)
  result.measurements.samePageReopenMs = await loadSaved()
  await page.screenshot({ path: resolve(evidence, 'canvas-scale.png') })
  assert.deepEqual(errors, [])
  result.status = result.measurements.newPageOpenMs <= 5000 && result.measurements.samePageReopenMs <= 5000 ? 'open-passed' : 'open-budget-exceeded'
  result.scope = 'new isolated browser context and same-page reopen, not OS cold disk or native desktop; actual snapshot size recorded, 20 MiB save budget not inferred for a different size; 30-second interaction and 5-minute process-tree memory still pending'
  console.log(JSON.stringify(result))
} catch (error) {
  result.status = 'failed'; result.error = String(error)
  if (page) await page.screenshot({ path: resolve(evidence, 'canvas-scale-failure.png') }).catch(() => {})
  throw error
} finally {
  await writeFile(resolve(evidence, 'canvas-scale.json'), JSON.stringify(result, null, 2))
  await browser.close()
}
