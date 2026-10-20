import assert from 'node:assert/strict'
import { createInterface } from 'node:readline'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { openInstalledCanvas, resizeInstalledCanvas } from './native-host.mjs'

const evidence = resolve(process.env.OS_CANVAS_WEB_EVIDENCE ?? 'output/dev-evidence/canvas-c01/web')
await mkdir(evidence, { recursive: true })
const record = JSON.parse(await readFile(resolve(process.env.OS_CANVAS_WEB_HOST_RECORD ?? resolve(evidence, 'native-host.json')), 'utf8'))
assert.equal(createHash('sha256').update(await readFile(record.executable)).digest('hex'), record.sha256)
const server = createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "frame-ancestors 'none'" })
  response.end('<!doctype html><html><head><title>Web node fixture</title></head><body style="background:#eeeeea;color:#24231f;margin:16px">'
    + '<h1>Independent webpage</h1><label>Web input <input aria-label="Web input"></label>'
    + '<button onclick="document.querySelector(\'output\').textContent=document.querySelector(\'input\').value">Apply</button>'
    + '<output></output><div style="height:1600px">Scroll content</div></body></html>')
})
server.listen(0, '127.0.0.1')
await once(server, 'listening')
const url = `http://127.0.0.1:${server.address().port}/`
let host, child
const result = { hostRecord: record, url, scope: 'Validation-only native child WebView. Controlled real HTTP page forbids framing; public website and OS input/occlusion acceptance remain separate.' }
try {
  host = await openInstalledCanvas({ executablePath: record.executable, keepInitialNavigation: true,
    initialURL: 'http://tauri.localhost/?os-canvas&isolation-prototype' })
  await resizeInstalledCanvas(host)
  if (process.env.OS_CANVAS_WEB_FOLLOW === '1') {
    await host.page.goto('http://tauri.localhost/?test&os-canvas&isolation-prototype')
    await host.page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor()
  }
  const command = args => host.page.evaluate(args => window.__TAURI_INTERNALS__.invoke('web_preview', args), args)
  await command({ action: 'create', url, bounds: [350, 180, 500, 360] })
  await host.expect.poll(() => {
    child = host.browser.contexts().flatMap(context => context.pages()).find(page => page.url().startsWith(url))
    return Boolean(child)
  }, { timeout: 15000 }).toBe(true)
  await host.expect(child.getByRole('heading', { name: 'Independent webpage' })).toBeVisible()
  await command({ action: 'focus' })
  await child.getByLabel('Web input').fill('网页输入 test')
  await child.getByRole('button', { name: 'Apply', exact: true }).click()
  await host.expect(child.locator('output')).toHaveText('网页输入 test')
  result.viewportBefore = await child.evaluate(() => ({ width: innerWidth, height: innerHeight, ratio: devicePixelRatio }))
  await command({ action: 'zoom', zoom: 1.5 })
  await host.expect.poll(() => child.evaluate(() => innerWidth)).toBeLessThan(result.viewportBefore.width)
  await host.expect(child.getByLabel('Web input')).toHaveValue('网页输入 test')
  result.viewportZoomed = await child.evaluate(() => ({ width: innerWidth, height: innerHeight, ratio: devicePixelRatio }))
  await command({ action: 'zoom', zoom: 1 })
  await command({ action: 'bounds', bounds: [400, 210, 550, 380] })
  await host.expect.poll(() => child.evaluate(() => innerWidth)).toBe(550)
  await child.mouse.move(300, 280)
  await child.mouse.wheel(0, 400)
  await host.expect.poll(() => child.evaluate(() => scrollY)).toBeGreaterThan(0)
  result.authority = await child.evaluate(async () => {
    if (!window.__TAURI_INTERNALS__?.invoke) return { mainCommand: 'no-native-bridge' }
    try { await window.__TAURI_INTERNALS__.invoke('web_preview', { action: 'close' }); return { mainCommand: 'unexpected-success' } }
    catch (error) { return { mainCommand: 'denied', error: String(error) } }
  })
  assert.notEqual(result.authority.mainCommand, 'unexpected-success')
  await command({ action: 'hide' })
  const input = host.page.getByLabel('本地目录路径')
  await input.fill('main input after hiding webpage')
  await host.expect(input).toHaveValue('main input after hiding webpage')
  await input.fill('')
  await command({ action: 'show' })
  await host.expect(child.getByLabel('Web input')).toHaveValue('网页输入 test')
  await child.screenshot({ path: resolve(evidence, 'web-content.png') })
  if (process.env.OS_CANVAS_WEB_FOLLOW === '1') {
    const adapter = await readFile(resolve('apps/canvas/runtime/web-surface.mjs'), 'utf8')
    await host.page.evaluate(source => {
      const anchor = document.querySelector('[data-slot="isolation-draft"]')
      const panel = document.createElement('div')
      panel.id = 'follow-panel'
      panel.style.cssText = 'position:fixed;left:450px;top:280px;width:120px;height:100px;background:#191919;border:3px solid #ee6018;z-index:2147483647'
      panel.textContent = 'FOLLOW PANEL'
      document.body.append(panel)
      window.__followErrors = []
      const follow = new Function(source.replace('export function', 'function') + ';return followWebSurface')()
      window.__webFollower = follow({ anchor, clipTo: () => document.querySelector('[data-test-id="canvas-element"]').getBoundingClientRect(), panels: () => [panel, ...document.querySelectorAll('[aria-label="图层"], [aria-label="属性"], [aria-label="画布面板"]')],
        invoke: args => window.__TAURI_INTERNALS__.invoke('web_preview', args),
        onError: error => window.__followErrors.push(String(error)),
        onState: state => { panel.dataset.webState = state.suspended ?? 'active' } })
    }, adapter)
    const snapshot = () => host.page.evaluate(() => window.__webFollower.applied)
    await host.expect.poll(async () => (await snapshot())?.bounds?.[2]).toBe(320)
    await host.expect.poll(() => child.evaluate(() => innerWidth)).toBe(320)
    result.followBefore = await snapshot()
    await host.page.evaluate(() => window.openPencil.getStore().pan(40, 25))
    await host.expect.poll(async () => (await snapshot())?.bounds?.[0]).toBeCloseTo(result.followBefore.bounds[0] + 40, 1)
    result.followPanned = await snapshot()
    await host.page.evaluate(() => { document.querySelector('#follow-panel').style.left = '520px' })
    await host.expect.poll(async () => (await snapshot())?.holes?.[0]?.[0]).toBeCloseTo(520 - result.followPanned.bounds[0], 1)
    await host.page.evaluate(() => window.openPencil.getStore().setZoomAroundPoint(0.75, 0, 0))
    await host.expect.poll(async () => (await snapshot())?.zoom).toBeCloseTo(0.75, 2)
    await host.expect.poll(() => child.evaluate(() => devicePixelRatio)).toBeCloseTo(0.75, 2)
    await host.expect(child.getByLabel('Web input')).toHaveValue('网页输入 test')
    result.followZoomed = await snapshot()
    await host.page.evaluate(() => window.openPencil.getStore().pan(-400, -230))
    await host.expect.poll(async () => (await snapshot())?.bounds?.[0]).toBeLessThan(0)
    await host.expect.poll(async () => (await snapshot())?.bounds?.[1]).toBeLessThan(0)
    result.followPartialOffscreen = await snapshot()
    assert.equal(result.followPartialOffscreen.visible, true)
    await host.expect(child.getByLabel('Web input')).toHaveValue('网页输入 test')
    await host.page.evaluate(() => window.openPencil.getStore().pan(-2000, 0))
    await host.expect.poll(async () => (await snapshot())?.visible).toBe(false)
    await host.page.evaluate(() => window.openPencil.getStore().pan(2400, 230))
    await host.expect.poll(async () => (await snapshot())?.visible).toBe(true)
    await host.expect.poll(async () => (await snapshot())?.bounds?.[0]).toBeCloseTo(result.followZoomed.bounds[0], 1)
    await host.expect(child.getByLabel('Web input')).toHaveValue('网页输入 test')
    result.followRestored = await snapshot()
    await host.page.evaluate(() => window.openPencil.getStore().setZoomAroundPoint(0.1, 0, 0))
    await host.expect.poll(async () => (await snapshot())?.suspended).toBe('zoom-outside-native-range')
    result.followSuspended = await snapshot()
    await host.page.evaluate(() => window.openPencil.getStore().setZoomAroundPoint(0.75, 0, 0))
    await host.expect.poll(async () => (await snapshot())?.visible).toBe(true)
    await host.expect(child.getByLabel('Web input')).toHaveValue('网页输入 test')
    if (process.env.OS_CANVAS_WEB_INSPECT === '1') {
      console.log(JSON.stringify({ following: true, pid: host.child.pid }))
      const lines = createInterface({ input: process.stdin })
      for await (const line of lines) {
        if (line === 'finish') break
        if (line === 'partial') await host.page.evaluate(() => window.openPencil.getStore().pan(-400, -230))
        if (line === 'restore') await host.page.evaluate(() => window.openPencil.getStore().pan(400, 230))
        if (line === 'panel') await host.page.evaluate(() => { document.querySelector('#follow-panel').style.left = '350px' })
        console.log(JSON.stringify({ action: line, applied: await snapshot() }))
      }
      lines.close()
      await host.page.evaluate(() => window.__webFollower.stop())
    }
    assert.deepEqual(await host.page.evaluate(() => window.__followErrors), [])
    if (process.env.OS_CANVAS_WEB_INSPECT !== '1') await host.page.evaluate(() => window.__webFollower.stop())
  }
  if (process.env.OS_CANVAS_WEB_INSPECT === '1' && process.env.OS_CANVAS_WEB_FOLLOW !== '1') {
    await child.evaluate(() => scrollTo(0, 0))
    await host.page.evaluate(() => {
      const panel = document.createElement('div')
      panel.id = 'web-occlusion-probe'
      panel.style.cssText = 'position:fixed;left:430px;top:230px;width:300px;height:180px;background:#191919;color:#eeeeee;z-index:2147483647;border:4px solid #ee6018;padding:12px'
      panel.innerHTML = '<h2>HOST PANEL ABOVE WEB</h2><button id="host-hit">HOST BUTTON</button><output id="host-hit-count">0</output>'
      panel.querySelector('button').onclick = () => panel.querySelector('output').textContent = String(Number(panel.querySelector('output').textContent) + 1)
      document.body.append(panel)
    })
    const inspection = { pid: host.child.pid, childURL: url, bounds: [400, 210, 550, 380], observations: [] }
    await writeFile(resolve(evidence, 'inspection.json'), JSON.stringify(inspection, null, 2))
    console.log(JSON.stringify({ inspecting: true, pid: host.child.pid }))
    const lines = createInterface({ input: process.stdin })
    for await (const line of lines) {
      if (line === 'finish') break
      if (line === 'clip' || line === 'unclip') {
        const rectangle = await host.page.locator('#web-occlusion-probe').boundingBox()
        await command({ action: 'occlude', occlusions: line === 'unclip' ? [] : [[rectangle.x - 400, rectangle.y - 210, rectangle.width, rectangle.height]] })
      }
      if (line === 'hide' || line === 'show') await command({ action: line })
      const observation = { action: line, main: await host.page.evaluate(() => ({
        count: document.querySelector('#host-hit-count').textContent,
        hitAtOverlap: document.elementFromPoint(500, 300)?.outerHTML,
        focus: document.activeElement?.outerHTML
      })), child: await child.evaluate(() => ({ input: document.querySelector('input').value, focus: document.activeElement?.outerHTML })) }
      inspection.observations.push(observation)
      await writeFile(resolve(evidence, 'inspection.json'), JSON.stringify(inspection, null, 2))
      console.log(JSON.stringify(observation))
    }
    lines.close()
  }
  await command({ action: 'close' })
  await host.expect.poll(() => child.isClosed()).toBe(true)
  assert.deepEqual(host.errors, [])
  result.status = 'child-webview-basic-passed'
  result.remaining = ['public website compatibility', 'session/privacy and popup policy', ...(process.env.OS_CANVAS_WEB_FOLLOW === '1' ? ['native composited verification during continuous transforms', 'partial offscreen and zoom range boundaries', 'production node UI and automatic panel registry'] : ['canvas transform integration'])]
  if (process.env.OS_CANVAS_WEB_FOLLOW === '1') result.status = 'native-follow-prototype-passed'
  await writeFile(resolve(evidence, 'result.json'), JSON.stringify(result, null, 2))
} catch (error) {
  await writeFile(resolve(evidence, 'failure.json'), JSON.stringify({ ...result, error: error.stack }, null, 2))
  throw error
} finally {
  await host?.close()
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
}
