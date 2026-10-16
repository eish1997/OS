import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

// Probe the running upstream editor; do not start another server or use a user's profile.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const requireUpstream = createRequire(resolve(root, '.runtime/open-pencil-upstream/package.json'))
const { chromium } = requireUpstream('@playwright/test')
const manifest = JSON.parse(await readFile(resolve(root, 'apps/canvas/upstream.json'), 'utf8'))
const output = resolve(root, 'output/dev-evidence/canvas-c00')
await mkdir(output, { recursive: true })
const url = `http://localhost:${manifest.appPort}/?test&no-chrome&no-rulers`
const launch = { channel: 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] }
const contextOptions = { viewport: { width: 1280, height: 800 }, colorScheme: 'dark' }
const errors = []
let browser

async function openEditor() {
  browser = await chromium.launch(launch)
  const context = await browser.newContext(contextOptions)
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(url)
  await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 60000 })
  await page.locator('#loader').waitFor({ state: 'detached', timeout: 30000 })
  return page
}

async function nodes(page) {
  return page.evaluate(() => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('Editor is not initialized')
    return store.graph.getNode(store.state.currentPageId).childIds.map(id => {
      const node = store.graph.getNode(id)
      return { id: node.id, type: node.type, x: node.x, y: node.y, width: node.width, height: node.height }
    })
  })
}

try {
  const page = await openEditor()
  assert.deepEqual(await nodes(page), [])
  const bounds = await page.locator('[data-test-id="canvas-area"]').boundingBox()
  assert.ok(bounds)
  await page.keyboard.press('r')
  await page.mouse.move(bounds.x + 120, bounds.y + 140)
  await page.mouse.down()
  await page.mouse.move(bounds.x + 360, bounds.y + 300, { steps: 12 })
  await page.mouse.up()
  const drawn = await nodes(page)
  assert.equal(drawn.length, 1)
  assert.equal(drawn[0].type, 'RECTANGLE')
  assert.equal(drawn[0].width, 240)
  assert.equal(drawn[0].height, 160)
  await page.keyboard.press('Control+z')
  assert.equal((await nodes(page)).length, 0)
  await page.keyboard.press('Control+Shift+z')
  assert.deepEqual(await nodes(page), drawn)
  // Use the real browser download fallback, not a fake FileSystemWritableFileStream.
  await page.evaluate(() => { window.showSaveFilePicker = undefined })
  page.once('dialog', dialog => dialog.accept('OS-C00.fig'))
  const downloadEvent = page.waitForEvent('download')
  await page.evaluate(() => window.openPencil.getStore().saveFigFileAs())
  const download = await downloadEvent
  const savedPath = resolve(output, 'OS-C00.fig')
  await download.saveAs(savedPath)
  const bytes = await readFile(savedPath)
  assert.ok(bytes.length > 100)
  await page.screenshot({ path: resolve(output, 'before-restart.png') })
  const browserVersion = browser.version()
  await browser.close()
  browser = undefined
  const reopened = await openEditor()
  assert.deepEqual(await nodes(reopened), [])
  await reopened.evaluate(async data => {
    await window.openPencil.getStore().openFigFile(new File([new Uint8Array(data)], 'OS-C00.fig'))
  }, [...bytes])
  const restored = await nodes(reopened)
  const geometry = entries => entries.map(({ id, ...shape }) => shape)
  assert.deepEqual(geometry(restored), geometry(drawn))
  await reopened.screenshot({ path: resolve(output, 'after-restart.png') })
  assert.deepEqual(errors, [])
  const result = { status: 'passed', upstream: manifest.commit, browser: browserVersion,
    patchSha256: createHash('sha256').update(await readFile(resolve(root,
      'apps/canvas/patches/0001-windows-headless-wasm.patch'))).digest('hex'),
    date: new Date().toISOString(), bytes: bytes.length, nodes: drawn, restored,
    identityPreserved: restored.every((node, index) => node.id === drawn[index]?.id),
    limitations: ['FIG roundtrip rewrites node IDs; OS stable identity must be implemented separately in C02',
      'Save/import use the editor APIs; drawing and undo/redo use browser input',
      'Windows headless WASM loader requires the recorded compatibility patch'],
    checks: ['mouse drawing', 'Control+Z undo', 'Control+Shift+Z redo', 'real FIG download',
      'fresh browser process and context', 'FIG import retains shape geometry'], errors }
  await writeFile(resolve(output, 'baseline.json'), JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result, null, 2))
} catch (error) {
  await writeFile(resolve(output, 'failure.txt'), String(error.stack ?? error) + '\n' + errors.join('\n'))
  throw error
} finally {
  await browser?.close()
}
