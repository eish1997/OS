import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const { chromium, expect } = createRequire(resolve(root, '.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const output = resolve(root, 'output/dev-evidence/canvas-c02')
await mkdir(output, { recursive: true })
const base = process.env.OS_CANVAS_TEST_URL ?? 'http://localhost:14230'
const name = `History-${Date.now()}`
let browser, page, release
const errors = []
async function open() {
  browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] })
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${base}/?test&os-canvas&no-rulers`)
  await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 60000 })
  await page.locator('#loader').waitFor({ state: 'detached' })
}
async function contents() {
  return page.evaluate(async () => {
    const s = window.openPencil.getStore()
    const result = []
    for (const n of s.graph.getChildren(s.state.currentPageId)) {
      const fill = n.fills.find(f => f.type === 'IMAGE')
      const image = fill?.imageHash ? s.graph.images.get(fill.imageHash) : undefined
      const hash = image ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', image))].map(v => v.toString(16).padStart(2, '0')).join('') : null
      result.push({ name: n.name, text: n.text, imageHash: hash,
        identity: n.pluginData.find(p => p.key === 'os.canvas/nodeId')?.value })
    }
    return result.sort((a, b) => a.name.localeCompare(b.name))
  })
}
async function save(revision) {
  await page.getByRole('button', { name: '保存到本机', exact: true }).click()
  await expect(page.getByRole('button', { name: `${name} · ${revision}`, exact: true })).toBeVisible({ timeout: 30000 })
  await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机')
}
try {
  await open()
  await page.evaluate(async name => {
    const s = window.openPencil.getStore()
    s.state.autosaveEnabled = false; s.state.documentName = name
    s.graph.createNode('TEXT', s.state.currentPageId, { name: 'Work text', text: 'Revision one working text',
      x: 380, y: 180, width: 350, height: 40, fontSize: 24,
      fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 }, visible: true, opacity: 1 }] })
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#cc4488'; ctx.fillRect(0, 0, 64, 64)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    const hash = s.storeImage(new Uint8Array(await blob.arrayBuffer()))
    s.graph.createNode('RECTANGLE', s.state.currentPageId, { name: 'Work image', x: 400, y: 300, width: 200, height: 200,
      fills: [{ type: 'IMAGE', imageHash: hash, imageScaleMode: 'FILL', color: { r: 0, g: 0, b: 0, a: 1 }, visible: true, opacity: 1 }] })
  }, name)
  await save(1)
  const first = await contents()
  assert.ok(first.find(n => n.name === 'Work image').imageHash)
  await page.evaluate(() => {
    const s = window.openPencil.getStore()
    const text = [...s.graph.nodes.values()].find(n => n.name === 'Work text')
    s.graph.updateNode(text.id, { text: 'Revision two work' })
  })
  await save(2)
  const second = await contents()
  await page.getByRole('button', { name: '历史版本', exact: true }).click()
  await page.getByRole('button', { name: '恢复版本 1', exact: true }).click()
  await expect(page.getByRole('button', { name: `${name} · 3`, exact: true })).toBeVisible({ timeout: 30000 })
  assert.deepEqual(await contents(), first)

  let arrived
  const started = new Promise(resolve => { arrived = resolve })
  const gate = new Promise(resolve => { release = resolve })
  await page.route('**/os-workspace/canvases/*/scene?revision=2', async route => {
    const response = await route.fetch(); arrived(); await gate; await route.fulfill({ response })
  })
  await page.getByRole('button', { name: '恢复版本 2', exact: true }).click()
  await Promise.race([started, new Promise((_, reject) => setTimeout(() => reject(new Error('Restore did not request scene')), 15000))])
  await page.evaluate(() => {
    const s = window.openPencil.getStore()
    const text = [...s.graph.nodes.values()].find(n => n.name === 'Work text')
    s.graph.updateNode(text.id, { text: 'New edit during restore' })
  })
  release()
  await expect(page.getByRole('alert')).toContainText('已保留当前内容', { timeout: 30000 })
  assert.equal((await contents()).find(n => n.name === 'Work text').text, 'New edit during restore')
  await page.unroute('**/os-workspace/canvases/*/scene?revision=2')
  await save(4)
  await page.getByRole('button', { name: '历史版本', exact: true }).click()
  await page.getByRole('button', { name: '恢复版本 1', exact: true }).click()
  await expect(page.getByRole('button', { name: `${name} · 5`, exact: true })).toBeVisible({ timeout: 30000 })
  const versions = await page.getByLabel('历史版本列表').getByRole('button').allTextContents()
  assert.equal(versions.length, 5)
  await browser.close(); await open()
  await page.getByRole('button', { name: '本机画布', exact: true }).click()
  await page.getByRole('button', { name: `${name} · 5`, exact: true }).click()
  await expect.poll(contents, { timeout: 30000 }).toEqual(first)
  assert.deepEqual(errors, [])
  await page.screenshot({ path: resolve(output, 'history-work-content.png') })
  await writeFile(resolve(output, 'history-persistence.json'), JSON.stringify({ status: 'passed', date: new Date().toISOString(),
    first, second, restored: await contents(), versions, errors,
    checks: ['text and generated embedded PNG persist without external original', 'restore appends revision and keeps history',
      'editing during delayed restore is retained', 'fresh browser restores text, image bytes and stable IDs'] }, null, 2) + '\n')
  console.log('PASS: history restore, concurrent edit protection, text and embedded image restart')
} catch (error) {
  await writeFile(resolve(output, 'history-failure.txt'), String(error.stack ?? error))
  await page?.screenshot({ path: resolve(output, 'history-failure.png') }).catch(() => {})
  throw error
} finally { release?.(); await browser?.close() }
