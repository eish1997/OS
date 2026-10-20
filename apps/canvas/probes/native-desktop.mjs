import assert from 'node:assert/strict'
import { createInterface } from 'node:readline'
import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { once } from 'node:events'
import { resolve } from 'node:path'
import { openInstalledCanvas } from './native-host.mjs'

const evidence = resolve(process.env.OS_CANVAS_DESKTOP_EVIDENCE ?? 'output/dev-evidence/canvas-c01/desktop/basic')
await mkdir(evidence, { recursive: true })
const record = JSON.parse(await readFile(process.env.OS_CANVAS_DESKTOP_HOST_RECORD ?? 'output/dev-evidence/canvas-c01/desktop/native-host.json', 'utf8'))
assert.equal(createHash('sha256').update(await readFile(record.executable)).digest('hex'), record.sha256)
const targetEvidence = resolve(evidence, `target-${Date.now()}`)
await mkdir(targetEvidence)
let host, target, targetExit, webServer, webpage
const result = { hostRecord: record, targetEvidence, scope: 'Real native shortcut/input-release prototype; no claim for transparency or animations.' }
const run = promisify(execFile)
try {
  host = await openInstalledCanvas({ executablePath: record.executable, keepInitialNavigation: true,
    initialURL: 'http://tauri.localhost/?os-canvas&isolation-prototype' })
  if (process.env.OS_CANVAS_DESKTOP_TRANSPARENT === '1') {
    await host.page.goto('http://tauri.localhost/?test&os-canvas&isolation-prototype')
    await host.page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor()
    await host.page.evaluate(() => {
      const store = window.openPencil.getStore()
      window.__desktopPageColor = JSON.stringify(store.state.pageColor)
      store.setDesktopTransparent(true)
      const marker = store.graph.createNode('RECTANGLE', store.state.currentPageId, {
        name: 'Desktop transparency marker', x: 720, y: 380, width: 120, height: 90,
        fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 1, a: 1 }, opacity: 1, visible: true }]
      })
      window.__desktopMarkerId = marker.id
      const canvas = document.querySelector('[data-test-id="canvas-element"]')
      for (let element = canvas; element; element = element.parentElement) element.style.background = 'transparent'
      store.requestRepaint()
    })
    await host.page.evaluate(() => window.__TAURI_INTERNALS__.invoke('desktop_preview', { action: 'transparent' }))
    result.rendererLayers = await host.page.evaluate(() => window.openPencil.getStore().canvasRenderers.map(r => ({ transparent: r.desktopTransparent, scene: r.tracksSceneSettlement })))
    assert.ok(result.rendererLayers.length >= 2)
    assert.ok(result.rendererLayers.every(r => r.transparent))
    result.canvasContexts = await host.page.evaluate(() => [...document.querySelectorAll('canvas')].map(canvas => ({
      width: canvas.width, height: canvas.height,
      attributes: (canvas.getContext('webgl2') ?? canvas.getContext('webgl'))?.getContextAttributes()
    })))
  }
  const command = action => host.page.evaluate(action => window.__TAURI_INTERNALS__.invoke('desktop_preview', { action }), action)
  result.registered = await command('start')
  assert.equal(result.registered.registered, true)
  await assert.rejects(command('start'), /already registered/)
  await host.page.getByLabel('节点代码').fill('return { type: "text", text: "preserved desktop draft" }')
  if (process.env.OS_CANVAS_DESKTOP_WEB === '1') {
    webServer = createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY' })
      response.end('<!doctype html><html><body style="background:#eeeeea;color:#24231f"><h2>Desktop web node</h2><input aria-label="Web draft"><p>Independent webpage retained across desktop toggles.</p></body></html>')
    })
    webServer.listen(0, '127.0.0.1')
    await once(webServer, 'listening')
    const url = `http://127.0.0.1:${webServer.address().port}/`
    await host.page.evaluate(url => window.__TAURI_INTERNALS__.invoke('web_preview', { action: 'create', url, bounds: [620, 250, 300, 220] }), url)
    await host.expect.poll(() => {
      webpage = host.browser.contexts().flatMap(c => c.pages()).find(p => p.url().startsWith(url))
      return Boolean(webpage)
    }).toBe(true)
    await webpage.getByLabel('Web draft').fill('preserved webpage draft')
    result.webpageURL = url
  }
  target = spawn('powershell.exe', ['-NoProfile', '-STA', '-File', resolve('apps/canvas/probes/desktop-target.ps1'), '-Evidence', targetEvidence], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
  targetExit = once(target, 'exit')
  let targetErrors = ''
  target.stderr.on('data', bytes => { targetErrors += bytes })
  const readTarget = async () => JSON.parse((await readFile(resolve(targetEvidence, 'target-state.json'), 'utf8')).replace(/^\uFEFF/, ''))
  await host.expect.poll(async () => { try { return (await readTarget()).pid } catch { return null } }, { timeout: 15000 }).toBe(target.pid)
  const targetWindow = (await readTarget()).handle
  const restored = await run('powershell.exe', ['-NoProfile', '-Command', `orca computer get-app-state --app pid:${target.pid} --window-id ${targetWindow} --restore-window --json`], { windowsHide: true, timeout: 20000 })
  const focusState = JSON.parse(restored.stdout)
  assert.equal(focusState.ok, true)
  await writeFile(resolve(evidence, 'target-focus.json'), JSON.stringify(focusState, null, 2))
  const input = flag => run('powershell.exe', ['-NoProfile', '-File', resolve('apps/canvas/probes/native-input-focus.ps1'), '-TargetProcessId', String(target.pid), '-TargetWindowHandle', String(targetWindow), flag], { windowsHide: true, timeout: 15000 })
  const visibility = async (handle = 0) => JSON.parse((await run('powershell.exe', ['-NoProfile', '-File', resolve('apps/canvas/probes/native-window-visibility.ps1'), '-TargetProcessId', String(host.child.pid), '-RootHandle', String(handle)], { windowsHide: true, timeout: 15000 })).stdout)
  result.visibleBefore = await visibility()
  assert.equal(result.visibleBefore.visible, true)
  // The native input helper refuses to send if the owned target is not foreground.
  result.hideShortcut = JSON.parse((await input('-DesktopShortcut')).stdout)
  await host.expect.poll(async () => (await command('status')).hidden).toBe(true)
  result.hiddenWindows = await visibility(result.visibleBefore.handle)
  assert.equal(result.hiddenWindows.visible, false)
  assert.ok(result.hiddenWindows.children.every(child => !child.visible))
  result.underlyingInput = JSON.parse((await input('-SendProbe')).stdout)
  await host.expect.poll(async () => (await readTarget()).text).toBe('underlying-target-X')
  const clickTarget = await readTarget()
  const mouse = await run('powershell.exe', ['-NoProfile', '-Command', `orca computer click --app pid:${target.pid} --window-id ${targetWindow} --x ${clickTarget.clickX} --y ${clickTarget.clickY} --json`], { windowsHide: true, timeout: 20000 })
  result.underlyingMouse = JSON.parse(mouse.stdout)
  assert.equal(result.underlyingMouse.ok, true)
  await host.expect.poll(async () => (await readTarget()).clicks).toBe(1)
  result.restoreShortcut = JSON.parse((await input('-DesktopShortcut')).stdout)
  await host.expect.poll(async () => (await command('status')).hidden).toBe(false)
  result.restoredWindows = await visibility(result.visibleBefore.handle)
  assert.equal(result.restoredWindows.visible, true)
  assert.ok(result.restoredWindows.children.some(child => child.visible))
  await host.expect(host.page.getByLabel('节点代码')).toHaveValue('return { type: "text", text: "preserved desktop draft" }')
  if (process.env.OS_CANVAS_DESKTOP_TRANSPARENT === '1') {
    assert.equal(await host.page.evaluate(() => JSON.stringify(window.openPencil.getStore().state.pageColor)), await host.page.evaluate(() => window.__desktopPageColor))
    assert.equal(await host.page.evaluate(() => window.openPencil.getStore().graph.getNode(window.__desktopMarkerId)?.name), 'Desktop transparency marker')
    console.log(JSON.stringify({ inspectTransparent: true, pid: host.child.pid, targetPid: target.pid, targetWindow }))
    const lines = createInterface({ input: process.stdin })
    for await (const line of lines) {
      if (line === 'finish') break
      if (line === 'toggle') await command('toggle')
      if (line === 'restore') await command('restore')
      if (line === 'opaque' || line === 'transparent') {
        const enabled = line === 'transparent'
        const layers = await host.page.evaluate(enabled => {
          const store = window.openPencil.getStore()
          store.setDesktopTransparent(enabled)
          return store.canvasRenderers.map(r => r.desktopTransparent)
        }, enabled)
        assert.ok(layers.length >= 2 && layers.every(value => value === enabled))
        result.presentationSwitches ??= []
        result.presentationSwitches.push({ enabled, layers })
      }
      console.log(JSON.stringify(await command('status')))
    }
    lines.close()
  }
  if (webpage) {
    assert.equal(webpage.isClosed(), false)
    await host.expect(webpage.getByLabel('Web draft')).toHaveValue('preserved webpage draft')
    result.webpagePreserved = true
  }
  result.stopped = await command('stop')
  assert.equal(result.stopped.registered, false)
  assert.equal(result.stopped.hidden, false)
  assert.equal(result.stopped.error, null)
  // Re-registration demonstrates that explicit stop released the shortcut.
  assert.equal((await command('start')).registered, true)
  await command('stop')
  assert.deepEqual(host.errors, [])
  assert.equal(targetErrors, '')
  result.status = 'native-shortcut-and-input-release-passed'
  await writeFile(resolve(evidence, 'result.json'), JSON.stringify(result, null, 2))
} catch (error) {
  await writeFile(resolve(evidence, 'failure.json'), JSON.stringify({ ...result, error: error.stack }, null, 2))
  throw error
} finally {
  if (host) await host.page.evaluate(() => window.__TAURI_INTERNALS__.invoke('desktop_preview', { action: 'stop' })).catch(() => {})
  await writeFile(resolve(targetEvidence, 'stop-target'), '')
  if (targetExit) {
    const timeout = setTimeout(() => target.kill(), 5000)
    await targetExit
    clearTimeout(timeout)
  }
  await host?.close()
  if (webServer) { webServer.closeAllConnections(); await new Promise(resolve => webServer.close(resolve)) }
}
