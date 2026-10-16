import assert from 'node:assert/strict'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, writeFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join, dirname } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const root = process.cwd()
const { chromium, expect } = createRequire(resolve(root, '.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const executable = process.env.OS_CANVAS_NATIVE_EXE
const resources = process.env.OS_CANVAS_RESOURCE_DIR
const installed = process.env.OS_CANVAS_NATIVE_INSTALLED === '1'
if (!executable || (!installed && !resources)) throw new Error('Set OS_CANVAS_NATIVE_EXE and OS_CANVAS_RESOURCE_DIR')
if (installed) {
  const applicationData = join(process.env.LOCALAPPDATA, 'local.os.canvas', 'canvas')
  try { await access(applicationData); throw new Error('Installed test requires a new application data directory') }
  catch (error) { if (error.code !== 'ENOENT') throw error }
}
const data = await mkdtemp(join(tmpdir(), 'os-canvas-native-'))
const crash = process.env.OS_CANVAS_NATIVE_CRASH === '1'
const sandbox = process.env.OS_CANVAS_NATIVE_SANDBOX === '1'
const evidence = resolve(root, `output/dev-evidence/canvas-c05/desktop/${installed ? 'installed-workspace' : sandbox ? 'native-sandbox' : crash ? 'native-crash' : 'native-workspace'}`)
await mkdir(evidence, { recursive: true })
const endpoint = 'http://127.0.0.1:19420'
try { await fetch(endpoint + '/json/version'); throw new Error('CDP test port already occupied') }
catch (error) { if (error.message === 'CDP test port already occupied') throw error }
let child, exit, browser, page, servicePid, stderr = ''
const errors = []
const diagnostics = []
async function open() {
  const environment = { ...process.env }
  delete environment.OS_CANVAS_RESOURCE_DIR
  delete environment.OS_CANVAS_DATA_DIR
  if (!installed) {
    environment.OS_CANVAS_RESOURCE_DIR = resources
    environment.OS_CANVAS_DATA_DIR = join(data, 'workspace')
  }
  child = spawn(executable, [], { cwd: installed ? dirname(executable) : root, windowsHide: true,
    env: { ...environment,
      WEBVIEW2_USER_DATA_FOLDER: join(data, 'webview'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=19420' } })
  exit = once(child, 'exit')
  child.stderr.on('data', bytes => { stderr += bytes })
  child.stdout.resume()
  const deadline = Date.now() + 60000
  while (true) {
    if (child.exitCode !== null) throw new Error(`Native host exited ${child.exitCode}: ${stderr}`)
    try { const res = await fetch(endpoint + '/json/version'); if (res.ok) break } catch {}
    if (Date.now() > deadline) throw new Error('Native CDP startup timed out')
    await delay(250)
  }
  browser = await chromium.connectOverCDP(endpoint)
  const context = browser.contexts()[0]
  page = context.pages()[0] ?? await context.waitForEvent('page', { timeout: 30000 })
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) diagnostics.push(message.text()) })
  page.on('requestfailed', request => diagnostics.push(`${request.url()}: ${request.failure()?.errorText}`))
  await page.waitForURL('http://tauri.localhost/?os-canvas', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.goto('http://tauri.localhost/?test&os-canvas&no-rulers')
  await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 60000 })
  await page.locator('#loader').waitFor({ state: 'detached' })
  const { stdout } = await promisify(execFile)('powershell', ['-NoProfile', '-NonInteractive', '-Command',
    `@(Get-CimInstance Win32_Process -Filter "ParentProcessId = ${child.pid}" | Where-Object Name -eq 'node.exe' | Select-Object -ExpandProperty ProcessId) | ConvertTo-Json -Compress`], { windowsHide: true })
  const children = JSON.parse(stdout)
  const ids = Array.isArray(children) ? children : [children]
  assert.equal(ids.length, 1, 'Native host must own one workspace service')
  servicePid = ids[0]
  if (installed) {
    const owned = await promisify(execFile)('powershell', ['-NoProfile', '-NonInteractive', '-Command',
      `(Get-CimInstance Win32_Process -Filter "ProcessId = ${servicePid}").ExecutablePath`], { windowsHide: true })
    assert.equal(owned.stdout.trim().toLowerCase(), join(dirname(executable), 'canvas/runtime/node.exe').toLowerCase())
  }
}
async function close(force = false) {
  // Exit through the native host's normal process plugin, not by killing WebView2.
  if (force) child.kill('SIGKILL')
  else await page.evaluate(() => { void window.__TAURI_INTERNALS__.invoke('plugin:process|exit', { code: 0 }) }).catch(() => {})
  const [code] = await Promise.race([exit, delay(10000).then(() => { throw new Error('Native host did not exit') })])
  if (!force) assert.equal(code, 0, stderr)
  await expect.poll(() => {
    try { process.kill(servicePid, 0); return false } catch (error) {
      if (error.code === 'ESRCH') return true
      throw error
    }
  }, { timeout: 10000 }).toBe(true)
  await browser.close().catch(() => {})
}
async function snapshot() {
  return page.evaluate(() => {
    const store = window.openPencil.getStore()
    return store.graph.getNode(store.state.currentPageId).childIds.map(id => {
      const node = store.graph.getNode(id)
      return { type: node.type, x: node.x, y: node.y, width: node.width, height: node.height }
    })
  })
}
try {
  await open()
  const guard = await page.evaluate(async () => {
    const url = 'http://osworkspace.localhost/os-workspace/health'
    let outside
    try { outside = (await fetch('http://osworkspace.localhost/outside', { headers: { 'X-OS-Workspace': '1' } })).status }
    catch { outside = 'preflight-blocked' }
    return { valid: (await fetch(url, { headers: { 'X-OS-Workspace': '1' } })).status,
      noHeader: (await fetch(url)).status,
      outside }
  })
  assert.deepEqual(guard, { valid: 200, noHeader: 403, outside: 'preflight-blocked' })
  let untrusted = null
  if (sandbox) {
  untrusted = await page.evaluate(() => new Promise((resolve, reject) => {
    const frame = document.createElement('iframe')
    frame.setAttribute('sandbox', 'allow-scripts')
    frame.style.display = 'none'
    const cleanup = () => { clearTimeout(timer); window.removeEventListener('message', receive); frame.remove() }
    const receive = event => {
      if (event.source !== frame.contentWindow || event.data?.type !== 'canvas-origin-probe') return
      const result = { origin: event.origin, ...event.data }
      cleanup(); resolve(result)
    }
    const timer = setTimeout(() => { cleanup(); reject(new Error('Untrusted frame did not report')) }, 10000)
    window.addEventListener('message', receive)
    frame.srcdoc = `<script>
      (async () => {
        let status;
        try { status = (await fetch('http://osworkspace.localhost/os-workspace/health',
          { headers: { 'X-OS-Workspace': '1' } })).status; }
        catch { status = 'blocked'; }
        parent.postMessage({type:'canvas-origin-probe', status}, '*');
      })();
    <\/script>`
    document.body.append(frame)
  }))
  assert.equal(untrusted.origin, 'null')
  assert.ok(untrusted.status === 'blocked' || untrusted.status === 403)
  }
  const name = `Native-${Date.now()}`
  await page.evaluate(name => { window.openPencil.getStore().state.documentName = name }, name)
  const bounds = await page.locator('[data-test-id="canvas-area"]').boundingBox()
  await page.keyboard.press('r')
  await page.mouse.move(bounds.x + 450, bounds.y + 220)
  await page.mouse.down()
  await page.mouse.move(bounds.x + 670, bounds.y + 380, { steps: 10 })
  await page.mouse.up()
  const original = await snapshot()
  assert.equal(original.length, 1)
  await page.getByRole('button', { name: '保存到本机', exact: true }).click()
  await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机', { timeout: 30000 })
  await page.screenshot({ path: join(evidence, 'saved.png') })
  await close(crash)
  await open()
  await page.getByRole('button', { name: '本机画布', exact: true }).click()
  await page.getByRole('button', { name: `${name} · 1`, exact: true }).click()
  await expect.poll(snapshot, { timeout: 30000 }).toEqual(original)
  await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机')
  await page.screenshot({ path: join(evidence, 'reopened.png') })
  assert.deepEqual(errors, sandbox ? ["Cannot read properties of undefined (reading 'plugins')"] : [])
  await close()
  await writeFile(join(evidence, 'result.json'), JSON.stringify({ status: sandbox ? 'sandbox-incomplete' : 'passed', original, guard, untrusted, crash, installed, errors,
    checks: ['real Tauri WebView2 and private service', 'native protocol header/path rejection',
      ...(sandbox ? ['opaque-origin sandbox iframe cannot access workspace; injection error retained'] : []),
      'mouse drawing and confirmed disk save', crash ? 'forced host termination releases service' : 'native exit releases owned service process',
      'new native process restores scene'],
    limits: [...(sandbox ? ['Tauri path initialization throws in opaque sandbox frame; origin isolation not fully accepted'] : []),
      ...(installed ? [] : ['installer not covered']), 'other window labels and generated-node runtime not covered'] }, null, 2))
} catch (error) {
  await page?.screenshot({ path: join(evidence, 'failure.png') }).catch(() => {})
  const dom = await page?.content().catch(() => '')
  await writeFile(join(evidence, 'failure.json'), JSON.stringify({ error: error.stack, stderr, errors, diagnostics, dom }, null, 2))
  throw error
} finally {
  if (child && child.exitCode === null) child.kill()
  await browser?.close().catch(() => {})
}
