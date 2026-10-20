import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { resolve } from 'node:path'
const root = process.cwd(), evidence = resolve(root, 'output/dev-evidence/canvas-c05/performance')
const fixture = JSON.parse(await readFile(resolve(evidence, 'canvas-scale.json'), 'utf8'))
const { chromium, expect } = createRequire(resolve(root, '.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })
const renderOnly = process.env.OS_CANVAS_RENDER_DRIVE === 'raf'
const result = { drive: renderOnly ? 'in-page RAF viewport workload' : 'trusted CDP wheel input', canvasId: fixture.canvasId, fixture: fixture.fixture, snapshotBytes: fixture.snapshotBytes }
const percentile = values => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * 0.95) - 1)]
try {
  const browserSession = await browser.newBrowserCDPSession()
  const system = await browserSession.send('SystemInfo.getInfo')
  result.gpu = { devices: system.gpu.devices, auxAttributes: system.gpu.auxAttributes, featureStatus: system.gpu.featureStatus }
  await page.goto(`${process.env.OS_CANVAS_TEST_URL ?? 'http://localhost:14290'}/?test&os-canvas&no-rulers`)
  await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 60000 })
  await page.getByRole('button', { name: '本机画布', exact: true }).click()
  const button = page.getByLabel('本机画布列表').getByRole('button', { name: new RegExp(`^${fixture.name} ·`) })
  result.openMs = []
  for (let i = 0; i < 2; i++) {
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
  console.log('Open measurements', result.openMs)
  await page.evaluate(() => {
    const s = window.openPencil.getStore(), r = s.renderer, original = r.renderFromEditorState
    const metrics = window.__scaleMetrics = { frames: [], drawDurations: [], eventTimes: [], rafTimes: [], latency: [], events: 0, pending: [], pan: [s.state.panX, s.state.panY], changes: 0 }
    s.state.autosaveEnabled = false
    const raf = time => { metrics.rafTimes.push(time); requestAnimationFrame(raf) }; requestAnimationFrame(raf)
    document.addEventListener('wheel', event => { metrics.eventTimes.push(performance.now()); metrics.events++; metrics.pending.push(event.timeStamp) }, { capture: true, passive: true })
    r.renderFromEditorState = function (...args) {
      const before = performance.now(), value = original.apply(this, args), now = performance.now(), state = args[0]
      metrics.drawDurations.push(now - before)
      metrics.frames.push(now)
      if (state.panX !== metrics.pan[0] || state.panY !== metrics.pan[1]) {
        metrics.changes++
        for (const time of metrics.pending) metrics.latency.push(now - time)
        metrics.pending = []; metrics.pan = [state.panX, state.panY]
      }
      return value
    }
  })
  const cdp = await page.context().newCDPSession(page)
  const start = performance.now()
  let sent = 0
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
  while (!renderOnly && performance.now() - start < 30000) {
    if (inFlight.size >= 8) await Promise.race(inFlight)
    const dispatched = cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 700, y: 450,
      deltaX: Math.floor(sent / 30) % 2 ? -4 : 4, deltaY: 0 })
    inFlight.add(dispatched)
    void dispatched.finally(() => inFlight.delete(dispatched)).catch(error => dispatchErrors.push(String(error)))
    sent++
    await delay(Math.max(0, start + sent * (1000 / 60) - performance.now()))
  }
  await Promise.all(inFlight)
  assert.deepEqual(dispatchErrors, [])
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const metrics = await page.evaluate(() => window.__scaleMetrics)
  const intervals = metrics.frames.slice(1).map((time, index) => time - metrics.frames[index])
  assert.ok(metrics.changes > 100)
  if (!renderOnly) assert.ok(metrics.events > 100 && metrics.latency.length > 100)
  result.interaction = { durationMs: performance.now() - start, inputScheduleHz: 60, maxOutstandingDispatch: 8, sent, events: metrics.events, changes: metrics.changes,
    samples: metrics.latency.length, inputToRenderP95Ms: renderOnly ? null : percentile(metrics.latency), renderIntervalP95Ms: percentile(intervals) }
  result.diagnostics = { drawP95Ms: percentile(metrics.drawDurations), drawMaxMs: Math.max(...metrics.drawDurations),
    rafIntervalP95Ms: percentile(metrics.rafTimes.slice(1).map((t, i) => t - metrics.rafTimes[i])),
    deliveredEventIntervalP95Ms: percentile(metrics.eventTimes.slice(1).map((t, i) => t - metrics.eventTimes[i])),
    draws: metrics.frames.length, rafFrames: metrics.rafTimes.length }
  result.status = result.openMs.every(ms => ms <= 5000) && (renderOnly || result.interaction.inputToRenderP95Ms <= 100) &&
    result.interaction.renderIntervalP95Ms <= 33 ? (renderOnly ? 'render-only-passed' : 'passed') : 'budget-exceeded'
  result.scope = renderOnly
    ? 'RAF viewport mutations measure continuous renderer workload, not physical/trusted input latency or OS display scanout; excludes desktop process-tree memory and cold disk'
    : 'actual trusted wheel events to completed renderFromEditorState with changed pan; render completion is not OS display scanout; excludes desktop process-tree memory and cold disk'
  await page.screenshot({ path: resolve(evidence, 'interaction-scale.png') })
  console.log(JSON.stringify(result))
} catch (error) { result.status = 'failed'; result.error = String(error); throw error }
finally { await writeFile(resolve(evidence, process.env.OS_CANVAS_MEASUREMENT_FILE ?? 'interaction-scale.json'), JSON.stringify(result, null, 2)); await browser.close() }
