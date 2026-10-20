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
const name = `Session-${Date.now()}`
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
let release
try {
  await page.goto(`${base}/?test&os-canvas&no-rulers`)
  await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 60000 })
  await page.locator('#loader').waitFor({ state: 'detached' })
  await page.evaluate(name => { window.openPencil.getStore().state.documentName = name }, name)
  const status = page.locator('[data-slot="local-save-status"]')
  async function draw(x, y) {
    const b = await page.locator('[data-test-id="canvas-area"]').boundingBox()
    await page.keyboard.press('r')
    await page.mouse.move(b.x + x, b.y + y)
    await page.mouse.down()
    await page.mouse.move(b.x + x + 80, b.y + y + 60, { steps: 8 })
    await page.mouse.up()
  }
  await draw(400, 180)
  await page.keyboard.press('Control+s')
  await expect(status).toHaveText('已保存到本机', { timeout: 30000 })
  await expect(page.getByRole('button', { name: `${name} · 1`, exact: true })).toBeVisible()

  let started
  const savedAtServer = new Promise(resolve => { started = resolve })
  const gate = new Promise(resolve => { release = resolve })
  let delayed = false
  await page.route('**/os-workspace/canvases/*', async route => {
    if (route.request().method() !== 'POST' || delayed) return route.continue()
    delayed = true
    const response = await route.fetch()
    assert.equal(response.status(), 200)
    started()
    await gate
    await route.fulfill({ response })
  })
  await draw(520, 180)
  await Promise.race([savedAtServer, new Promise((_, reject) => setTimeout(() => reject(new Error('Autosave did not start')), 15000))])
  await draw(640, 180)
  assert.equal(await page.evaluate(() => window.openPencil.getStore().hasUnsavedChanges()), true)
  release()
  await expect(page.getByRole('button', { name: `${name} · 3`, exact: true })).toBeVisible({ timeout: 30000 })
  await expect(status).toHaveText('已保存到本机')

  // Exercise actual tab activation; the panel is recreated but its session binding remains.
  await page.locator('[data-test-id="tabbar-new"]').click()
  await expect(status).toHaveCount(0)
  await page.getByRole('tab', { name, exact: true }).click()
  await expect(status).toHaveText('已保存到本机')
  await draw(760, 180)
  await expect(page.getByRole('button', { name: `${name} · 4`, exact: true })).toBeVisible({ timeout: 30000 })
  const saved = await page.evaluate(async name => {
    const docs = await (await fetch('/os-workspace/canvases', { headers: { 'X-OS-Workspace': '1' } })).json()
    return docs.filter(d => d.metadata.name === name)
  }, name)
  assert.equal(saved.length, 1)
  assert.equal(saved[0].revision, 4)
  await page.screenshot({ path: resolve(output, 'autosave-session.png') })
  assert.deepEqual(errors, [])
  await writeFile(resolve(output, 'session-persistence.json'), JSON.stringify({ status: 'passed',
    date: new Date().toISOString(), saved, errors, checks: ['Control+S writes local workspace',
      'bound document autosaves', 'editing during pending response remains dirty and saves another revision',
      'tab switch retains binding; later autosave updates same canvas'],
    limitations: ['this probe explicitly exercises the first save shortcut', 'save-as remains FIG export', 'identity and viewport are covered by the separate identity-persistence probe'] }, null, 2) + '\n')
  console.log('PASS: shortcut, autosave, overlapping edit, tab binding')
} catch (error) {
  await writeFile(resolve(output, 'session-failure.txt'), String(error.stack ?? error))
  await page.screenshot({ path: resolve(output, 'session-failure.png') }).catch(() => {})
  throw error
} finally { release?.(); await browser.close() }
