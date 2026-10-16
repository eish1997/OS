import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { openInstalledCanvas, resizeInstalledCanvas } from './native-host.mjs'
import { readFile, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { resolve } from 'node:path'
const root = process.cwd(), evidence = resolve(root, 'output/dev-evidence/canvas-c05/performance/native')
const fixture = JSON.parse(await readFile(resolve(evidence, 'scale.json'), 'utf8'))
const hostRecordPath = process.env.OS_CANVAS_INTERACTION_HOST_RECORD
const hostRecord = hostRecordPath ? JSON.parse(await readFile(hostRecordPath, 'utf8')) : null
if (hostRecord) assert.equal(createHash('sha256').update(await readFile(hostRecord.executable)).digest('hex'), hostRecord.sha256)
const host = await openInstalledCanvas({ executablePath: hostRecord?.executable })
const { page, browser, expect } = host
const renderOnly = false
const pacing = process.env.OS_CANVAS_INPUT_PACING ?? 'host-clock'
assert.ok(['host-clock', 'frame-clock'].includes(pacing))
const inputHz = Number(process.env.OS_CANVAS_INPUT_HZ ?? 60)
assert.ok([60, 120].includes(inputHz))
const result = { drive: renderOnly ? 'in-page RAF viewport workload' : 'trusted CDP wheel input', canvasId: fixture.canvasId, fixture: fixture.fixture, snapshotBytes: fixture.snapshotBytes }
result.hostRecord = hostRecord
const percentile = values => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * 0.95) - 1)]
try {
  const browserSession = await browser.newBrowserCDPSession()
  const system = await browserSession.send('SystemInfo.getInfo')
  result.gpu = { devices: system.gpu.devices, auxAttributes: system.gpu.auxAttributes, featureStatus: system.gpu.featureStatus }
  await resizeInstalledCanvas(host)
  await page.evaluate(() => { window.openPencil.getStore().state.autosaveEnabled = false })
  await page.getByRole('button', { name: '本机画布', exact: true }).click()
  const button = page.getByLabel('本机画布列表').getByRole('button', { name: new RegExp(`^${fixture.name} ·`) })
  result.openMs = []
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: '保存到本机', exact: true }).click()
    await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机', { timeout: 30000 })
    await page.evaluate(() => { window.__scaleOldGraph = window.openPencil.getStore().graph })
    const start = performance.now()
    await button.click()
    await expect.poll(() => page.evaluate(() => {
      const s = window.openPencil.getStore()
      return s.graph !== window.__scaleOldGraph && [...s.graph.nodes.values()].filter(n => n.type === 'RECTANGLE').length === 1000
    }), { timeout: 60000 }).toBe(true)
    await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机')
    result.openMs.push(performance.now() - start)
  }
  assert.equal(await page.evaluate(() => {
    const s = window.openPencil.getStore()
    return new Set(s.graph.getChildren(s.state.currentPageId).flatMap(n => n.fills.filter(f => f.type === 'IMAGE').map(f => f.imageHash))).size
  }), 200)
  console.log('Open measurements', result.openMs)
  result.initialView = await page.evaluate(() => {
    const s = window.openPencil.getStore()
    const before = { panX: s.state.panX, panY: s.state.panY, zoom: s.state.zoom }
    s.state.autosaveEnabled = false
    s.setZoomAroundPoint(1, 0, 0)
    s.pan(-s.state.panX, -s.state.panY)
    s.requestRepaint()
    return { before, reset: { panX: s.state.panX, panY: s.state.panY, zoom: s.state.zoom } }
  })
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.screenshot({ path: resolve(evidence, (process.env.OS_CANVAS_MEASUREMENT_FILE ?? 'interaction-scale.json').replace(/\.json$/, '') + '-before.png') })

  await page.evaluate(() => {
    const s = window.openPencil.getStore()
    const renderers = s.canvasRenderers
    if (!renderers.some(r => r.tracksSceneSettlement)) throw new Error("No scene renderer to measure")
    const metrics = window.__scaleMetrics = { frames: [], drawDurations: [], eventTimes: [], rafTimes: [], latency: [], timeline: [], layers: renderers.map(r => ({ scene: r.tracksSceneSettlement, primary: r === s.renderer })), events: 0, pending: [], pan: [s.state.panX, s.state.panY], changes: 0 }
    metrics.imageRects = s.graph.getChildren(s.state.currentPageId)
      .filter(n => n.fills.some(f => f.type === 'IMAGE'))
      .map(n => ({ x: n.x, y: n.y, width: n.width, height: n.height }))
    const canvas = document.querySelector('[data-test-id="scene-canvas-element"]')
    metrics.viewport = { width: canvas.clientWidth, height: canvas.clientHeight }
    s.state.autosaveEnabled = false
    const raf = time => { metrics.rafTimes.push(time); metrics.timeline.push({ kind: 'raf', at: performance.now(), pending: metrics.pending.length }); requestAnimationFrame(raf) }; requestAnimationFrame(raf)
    document.addEventListener('wheel', event => { const now = performance.now(); metrics.eventTimes.push(now); metrics.events++; metrics.pending.push(event.timeStamp); metrics.timeline.push({ kind: 'wheel', at: now, timestamp: event.timeStamp, trusted: event.isTrusted, deltaX: event.deltaX, deltaY: event.deltaY, deltaMode: event.deltaMode, wheelDeltaX: event.wheelDeltaX }) }, { capture: true, passive: true })
    for (const r of renderers) {
    const original = r.renderFromEditorState
    r.renderFromEditorState = function (...args) {
      const before = performance.now(), value = original.apply(this, args), now = performance.now(), state = args[0]
      if (!r.tracksSceneSettlement) {
        metrics.timeline.push({ kind: 'overlay-render', at: now, started: before })
        return value
      }
      metrics.drawDurations.push(now - before)
      metrics.frames.push(now)
      metrics.timeline.push({ kind: 'render', at: now, started: before, pending: metrics.pending.length, panX: state.panX, panY: state.panY, zoom: state.zoom, changed: state.panX !== metrics.pan[0] || state.panY !== metrics.pan[1] })
      if (state.panX !== metrics.pan[0] || state.panY !== metrics.pan[1]) {
        metrics.changes++
        for (const time of metrics.pending) metrics.latency.push(now - time)
        metrics.pending = []; metrics.pan = [state.panX, state.panY]
      }
      return value
    }
    }
  })
  const cdp = await page.context().newCDPSession(page)
  const start = performance.now()
  let sent = 0, direction = 0.5
  result.inputProfile = 'Fractional pixel wheel deltas (touchpad-style), viewport feedback; not accelerated Windows mouse notches'
  const inFlight = new Set(), dispatchErrors = []
  if (renderOnly) {
    sent = await page.evaluate(() => new Promise(resolve => {
      const s = window.openPencil.getStore(), started = performance.now()
      let count = 0
      const step = () => {
        if (performance.now() - started >= 30000) { resolve(count); return }
        s.pan(Math.floor(count / 30) % 2 ? -4 : 4, 0)
        count++; requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    }))
  }
  if (pacing === 'frame-clock') {
    let skipped = 0
    await page.exposeBinding('__canvasDriveWheel', (_source, panX) => {
      if (inFlight.size >= 8) { skipped++; return }
      if (panX <= -60) direction = -0.5
      else if (panX >= -20) direction = 0.5
      const dispatched = cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 700, y: 450,
        deltaX: direction, deltaY: 0 })
      inFlight.add(dispatched)
      void dispatched.finally(() => inFlight.delete(dispatched)).catch(error => dispatchErrors.push(String(error)))
      sent++
    })
    result.frameClock = await page.evaluate(() => new Promise(resolve => {
      const started = performance.now()
      let ticks = 0
      const tick = () => {
        if (performance.now() - started >= 30000) { resolve({ ticks, durationMs: performance.now() - started }); return }
        void window.__canvasDriveWheel(window.openPencil.getStore().state.panX)
        ticks++
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }))
    result.frameClock.skipped = skipped
    assert.equal(skipped, 0, 'Driver backpressure invalidates continuous-input workload')
  }
  while (!renderOnly && pacing === 'host-clock' && performance.now() - start < 30000) {
    if (inFlight.size >= 8) await Promise.race(inFlight)
    // Keep the image cluster in view even when CDP coalesces unequal numbers
    // of positive and negative inputs. Direction follows the actual viewport.
    if (sent % 5 === 0) {
      const panX = await page.evaluate(() => window.openPencil.getStore().state.panX)
      if (panX <= -60) direction = -0.5
      else if (panX >= -20) direction = 0.5
    }
    const dispatched = cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 700, y: 450,
      deltaX: direction, deltaY: 0 })
    inFlight.add(dispatched)
    void dispatched.finally(() => inFlight.delete(dispatched)).catch(error => dispatchErrors.push(String(error)))
    sent++
    await delay(Math.max(0, start + sent * (1000 / inputHz) - performance.now()))
  }
  await Promise.all(inFlight)
  assert.deepEqual(dispatchErrors, [])
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const metrics = await page.evaluate(() => window.__scaleMetrics)
  if (process.env.OS_CANVAS_INTERACTION_TIMELINE) await writeFile(resolve(evidence, process.env.OS_CANVAS_INTERACTION_TIMELINE), JSON.stringify(metrics))
  const intervals = metrics.frames.slice(1).map((time, index) => time - metrics.frames[index])
  assert.ok(metrics.changes > 100)
  if (!renderOnly) assert.ok(metrics.events > 100 && metrics.latency.length > 100)
  result.interaction = { durationMs: performance.now() - start, pacing, inputScheduleHz: pacing === 'host-clock' ? inputHz : null, maxOutstandingDispatch: 8, sent, events: metrics.events, changes: metrics.changes,
    samples: metrics.latency.length, inputToRenderP95Ms: renderOnly ? null : percentile(metrics.latency), renderIntervalP95Ms: percentile(intervals) }
  const visibleCounts = metrics.timeline.filter(e => e.kind === 'render').map(frame =>
    metrics.imageRects.filter(rect => rect.x * frame.zoom + frame.panX >= 0 &&
      rect.y * frame.zoom + frame.panY >= 0 &&
      (rect.x + rect.width) * frame.zoom + frame.panX <= metrics.viewport.width &&
      (rect.y + rect.height) * frame.zoom + frame.panY <= metrics.viewport.height).length)
  result.visibleImages = { minimum: Math.min(...visibleCounts), maximum: Math.max(...visibleCounts),
    scope: 'Full image rectangles inside scene viewport each measured frame; panel overlap checked visually' }
  assert.equal(result.visibleImages.minimum, 8)
  assert.equal(result.visibleImages.maximum, 8)
  result.viewportRange = {
    minX: Math.min(...metrics.timeline.filter(e => e.kind === 'render').map(e => e.panX)),
    maxX: Math.max(...metrics.timeline.filter(e => e.kind === 'render').map(e => e.panX))
  }
  result.measuredLayers = metrics.layers
  result.diagnostics = { drawP95Ms: percentile(metrics.drawDurations), drawMaxMs: Math.max(...metrics.drawDurations),
    rafIntervalP95Ms: percentile(metrics.rafTimes.slice(1).map((t, i) => t - metrics.rafTimes[i])),
    deliveredEventIntervalP95Ms: percentile(metrics.eventTimes.slice(1).map((t, i) => t - metrics.eventTimes[i])),
    draws: metrics.frames.length, rafFrames: metrics.rafTimes.length }
  result.status = result.openMs.every(ms => ms <= 5000) && (renderOnly || result.interaction.inputToRenderP95Ms <= 100) &&
    result.interaction.renderIntervalP95Ms <= 33 ? (renderOnly ? 'render-only-passed' : 'passed') : 'budget-exceeded'
  result.scope = renderOnly
    ? 'RAF viewport mutations measure continuous renderer workload, not physical/trusted input latency or OS display scanout; excludes desktop process-tree memory and cold disk'
    : 'actual trusted wheel events to completed scene-layer renderFromEditorState with changed pan; overlay renders recorded separately; render completion is not OS display scanout; excludes desktop process-tree memory and cold disk'
  await page.screenshot({ path: resolve(evidence, (process.env.OS_CANVAS_MEASUREMENT_FILE ?? 'interaction-scale.json').replace(/\.json$/, '') + '.png') })
  assert.deepEqual(host.errors, [])
  result.host = `${hostRecord ? 'Explicit Windows release artifact (see hostRecord)' : 'Installed Windows release'}, native 1440x900 content viewport, 200 distinct images`
  console.log(JSON.stringify(result))
} catch (error) {
  result.status = 'failed'; result.error = String(error)
  await page.screenshot({ path: resolve(evidence, (process.env.OS_CANVAS_MEASUREMENT_FILE ?? 'interaction-scale.json').replace(/\.json$/, '') + '-failure.png') }).catch(() => {})
  throw error
}
finally { await writeFile(resolve(evidence, process.env.OS_CANVAS_MEASUREMENT_FILE ?? 'interaction-scale.json'), JSON.stringify(result, null, 2)); await host.close() }
