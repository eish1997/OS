import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const { chromium, expect } = createRequire(resolve(root, '.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const output = resolve(root, process.env.OS_CANVAS_EVIDENCE_DIR ?? 'output/dev-evidence/canvas-c03')
const url = process.env.OS_CANVAS_TEST_URL ?? 'http://localhost:14230'
const folder = await mkdtemp(join(tmpdir(), 'canvas-list-reopen-'))
await writeFile(join(folder, 'before.txt'), 'before')
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] })
let context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })
let page = await context.newPage()
async function open() {
  await page.goto(`${url}/?test&os-canvas&no-rulers`)
  await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 60000 })
}
async function cards() {
  return page.evaluate(() => [...window.openPencil.getStore().graph.nodes.values()].flatMap(node => {
    const raw = node.pluginData.find(item => item.key === 'os.canvas/fileLink')
    return raw ? [JSON.parse(raw.value)] : []
  }))
}
try {
  await open()
  await page.getByRole('textbox', { name: '本地目录路径' }).fill(folder)
  await page.getByRole('button', { name: '加入目录', exact: true }).click()
  await expect.poll(async () => (await cards()).length).toBe(1)
  const original = (await cards())[0]
  await page.getByRole('button', { name: '保存到本机', exact: true }).click()
  await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机')
  await context.close()
  await writeFile(join(folder, 'after.txt'), 'changed while no page is open')
  context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })
  page = await context.newPage(); await open()
  await page.getByRole('button', { name: '本机画布', exact: true }).click()
  await page.getByLabel('本机画布列表').getByRole('button').filter({ hasText: basename(folder) }).click()
  await expect.poll(async () => (await cards()).map(card => card.path).sort(), { timeout: 20000 }).toEqual(['after.txt', 'before.txt'])
  assert.equal((await cards()).find(card => card.path === 'before.txt').id, original.id)
  await mkdir(output, { recursive: true })
  await page.screenshot({ path: resolve(output, 'directory-list-reopen.png') })
  await writeFile(resolve(output, 'directory-list-reopen.json'), JSON.stringify({ status: 'passed', url, cards: await cards() }, null, 2))
  console.log('PASS: canvas list reopening reconciles files changed while closed')
} finally { await browser.close() }
