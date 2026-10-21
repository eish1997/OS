import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const require = createRequire(resolve('.runtime/open-pencil-upstream/package.json'))
const { chromium, expect } = require('@playwright/test')
const output = resolve(process.env.OS_CANVAS_EVIDENCE_DIR ?? 'output/dev-evidence/guide-context-menu')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
try {
  await page.goto(`${process.env.OS_CANVAS_TEST_URL ?? 'http://127.0.0.1:24880'}/?test&os-canvas&no-rulers`)
  await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 90000 })
  await page.locator('#loader').waitFor({ state: 'detached' })
  // Only the fixture uses the public API; menu opening, deletion and undo use real input.
  const fixture = await page.evaluate(() => {
    const store = window.openPencil.getStore()
    const ownerId = store.state.currentPageId
    const x = (600 - store.state.panX) / store.state.zoom
    const guideId = store.addGuide(ownerId, 'x', x)
    const node = store.graph.createNode('RECTANGLE', ownerId, {
      x: (800 - store.state.panX) / store.state.zoom,
      y: (400 - store.state.panY) / store.state.zoom,
      width: 100 / store.state.zoom, height: 100 / store.state.zoom
    })
    store.requestRender()
    return { ownerId, guideId, nodeId: node.id }
  })
  const box = await page.locator('[data-test-id="canvas-element"]').boundingBox()
  const guideMenu = page.locator('[role="menuitem"][data-property="guide"]')
  const copyMenu = page.locator('[data-test-id="context-copy"]')
  const rightClick = (x, y) => page.mouse.click(box.x + x, box.y + y, { button: 'right' })
  await rightClick(600, 300)
  await expect(guideMenu).toBeVisible()
  // Dismissing on a guide and reopening elsewhere must also change the menu.
  await page.keyboard.press('Escape')
  await rightClick(1000, 600)
  await expect(copyMenu).toBeVisible()
  await expect(guideMenu).toHaveCount(0)
  await page.keyboard.press('Escape')
  await rightClick(600, 300)
  await expect(guideMenu).toBeVisible()
  await guideMenu.click()
  await expect.poll(() => page.evaluate(({ ownerId }) => {
    const store = window.openPencil.getStore()
    return { count: store.graph.getNode(ownerId).guides.length, selected: store.state.guides.selected }
  }, fixture)).toEqual({ count: 0, selected: null })
  for (const [x, y] of [[1000, 600], [850, 450], [600, 300]]) {
    await rightClick(x, y)
    await expect(copyMenu).toBeVisible()
    await expect(guideMenu).toHaveCount(0)
    if (x === 850) await expect(copyMenu).not.toHaveAttribute('data-disabled', '')
    await page.keyboard.press('Escape')
  }
  await page.keyboard.press('Control+z')
  await expect.poll(() => page.evaluate(({ ownerId }) => window.openPencil.getStore().graph.getNode(ownerId).guides.length, fixture)).toBe(1)
  await rightClick(600, 300)
  await expect(guideMenu).toBeVisible()
  await guideMenu.click()
  await rightClick(1000, 600)
  await expect(copyMenu).toBeVisible()
  await expect(guideMenu).toHaveCount(0)
  await page.screenshot({ path: resolve(output, 'normal-menu-after-delete.png') })
  assert.deepEqual(errors, [])
  await writeFile(resolve(output, 'result.json'), JSON.stringify({ status: 'passed', errors, fixture }, null, 2))
  console.log('Guide context menu regression passed')
} catch (error) {
  await page.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {})
  await writeFile(resolve(output, 'result.json'), JSON.stringify({ status: 'failed', error: String(error), errors }, null, 2))
  throw error
} finally {
  await browser.close()
}
