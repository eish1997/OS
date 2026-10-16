import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { openInstalledCanvas, resizeInstalledCanvas } from './native-host.mjs'

const record = JSON.parse(await readFile(process.env.OS_CANVAS_INTERACTION_HOST_RECORD, 'utf8'))
assert.equal(createHash('sha256').update(await readFile(record.executable)).digest('hex'), record.sha256)
const evidence = resolve(process.env.OS_CANVAS_WHEEL_EVIDENCE ?? 'output/dev-evidence/canvas-c05/performance/native/input-frame-wheel')
await mkdir(evidence, { recursive: true })
const host = await openInstalledCanvas({ executablePath: record.executable })
const { page, expect } = host
const result = { hostRecord: record, status: 'running' }
try {
  await resizeInstalledCanvas(host)
  await page.evaluate(() => { window.openPencil.getStore().state.autosaveEnabled = false })
  const cdp = await page.context().newCDPSession(page)
  const read = () => page.evaluate(() => {
    const s = window.openPencil.getStore().state
    return { panX: s.panX, panY: s.panY, zoom: s.zoom }
  })
  const wheel = (deltaX, deltaY, modifiers = 0) => cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseWheel', x: 700, y: 450, deltaX, deltaY, modifiers
  })
  const before = await read()
  for (let i = 0; i < 12; i++) await wheel(3.5, 0)
  await expect.poll(async () => (await read()).panX).toBeCloseTo(before.panX - 84, 5)
  result.pan = await read()
  assert.equal(result.pan.zoom, before.zoom)
  assert.equal(result.pan.panY, before.panY)
  for (let i = 0; i < 12; i++) await wheel(-3.5, 0)
  await expect.poll(async () => (await read()).panX).toBeCloseTo(before.panX, 5)
  await wheel(0, 3.5, 8) // Shift redirects vertical movement to horizontal.
  await expect.poll(async () => (await read()).panX).toBeCloseTo(before.panX - 7, 5)
  const fineBefore = await read()
  for (const delta of [0.5, 0.5, 1, 2, 4, -1, -0.5]) await wheel(delta, 0)
  await expect.poll(async () => (await read()).panX).toBeCloseTo(fineBefore.panX - 13, 5)
  result.finePixels = { before: fineBefore, after: await read(), totalDelta: 6.5 }
  const notchBefore = await read()
  await wheel(0, 100)
  await expect.poll(async () => (await read()).panY).toBeCloseTo(notchBefore.panY - 16, 5)
  result.notch = { before: notchBefore, after: await read() }
  const zoomBefore = await read()
  const rect = await page.locator('[data-test-id="canvas-element"]').boundingBox()
  assert.ok(rect)
  const anchor = { x: (700 - rect.x - zoomBefore.panX) / zoomBefore.zoom,
    y: (450 - rect.y - zoomBefore.panY) / zoomBefore.zoom }
  await wheel(0, -20.5, 2) // Ctrl+pixel wheel is a pinch, anchored at the pointer.
  await expect.poll(async () => (await read()).zoom).toBeGreaterThan(zoomBefore.zoom)
  const zoomAfter = await read()
  assert.ok(Math.abs((700 - rect.x - zoomAfter.panX) / zoomAfter.zoom - anchor.x) < 0.01)
  assert.ok(Math.abs((450 - rect.y - zoomAfter.panY) / zoomAfter.zoom - anchor.y) < 0.01)
  result.zoom = { before: zoomBefore, after: zoomAfter, anchor }
  // A wheel event over an overlay must not change the underlying canvas.
  const input = page.getByLabel('本地目录路径')
  await input.fill('wheel focus regression')
  const box = await input.boundingBox()
  assert.ok(box)
  const overlayBefore = await read()
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: box.x + 20,
    y: box.y + box.height / 2, deltaX: 4, deltaY: 0 })
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  assert.deepEqual(await read(), overlayBefore)
  await expect(input).toHaveValue('wheel focus regression')
  await input.fill('')
  assert.deepEqual(host.errors, [])
  result.status = 'passed'
  result.scope = 'Real release WebView trusted CDP wheel: accumulated pan, reversal, Shift axis, Ctrl zoom anchor and overlay input boundary. Not physical OS mouse input.'
} catch (error) { result.status = 'failed'; result.error = error.stack; throw error }
finally {
  await writeFile(resolve(evidence, 'result.json'), JSON.stringify(result, null, 2))
  await host.close()
}
