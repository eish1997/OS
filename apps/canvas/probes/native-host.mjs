import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { once } from 'node:events'
import { readFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { setTimeout as delay } from 'node:timers/promises'

export async function resizeInstalledCanvas(host, width = 1440, height = 900) {
  const viewport = await host.page.evaluate(() => ({ width: innerWidth, height: innerHeight, scale: devicePixelRatio }))
  const dx = Math.round((width - viewport.width) * viewport.scale)
  const dy = Math.round((height - viewport.height) * viewport.scale)
  if (dx || dy) {
    const command = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class CanvasProbeWindow {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out Rect r);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int hgt, uint flags);
}
'@
$process = Get-Process -Id ${host.child.pid} -ErrorAction Stop
$handle = $process.MainWindowHandle
if ($handle -eq 0) { throw 'Owned native window missing' }
$rect = New-Object CanvasProbeWindow+Rect
if (-not [CanvasProbeWindow]::GetWindowRect($handle, [ref]$rect)) { throw 'Window bounds unavailable' }
if (-not [CanvasProbeWindow]::SetWindowPos($handle, [IntPtr]::Zero, 0, 0, ($rect.Right-$rect.Left+${dx}), ($rect.Bottom-$rect.Top+${dy}), 22)) { throw 'Window resize failed' }
`
    await promisify(execFile)('powershell.exe', ['-NoProfile', '-Command', command], { windowsHide: true, timeout: 15000 })
  }
  await host.expect.poll(() => host.page.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual({ width, height })
}

export async function openInstalledCanvas({ beforeNavigate, onStartupFailure, environment = {}, executablePath, browserArguments = '', webviewProfile, keepInitialNavigation = false, initialURL = 'http://tauri.localhost/?os-canvas' } = {}) {
  const root = process.cwd()
  const { chromium, expect } = createRequire(resolve(root, '.runtime/open-pencil-upstream/package.json'))('@playwright/test')
  const installation = JSON.parse(await readFile('output/dev-evidence/canvas-c05/desktop/installation.json', 'utf8'))
  const executable = executablePath ?? join(installation.directory, 'OpenPencil.exe')
  const endpoint = 'http://127.0.0.1:19420'
  try { await fetch(endpoint + '/json/version'); throw new Error('Native test port occupied') }
  catch (error) { if (error.message === 'Native test port occupied') throw error }
  const env = { ...process.env, ...environment, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=19420 ${browserArguments}`,
    WEBVIEW2_USER_DATA_FOLDER: webviewProfile ?? await mkdtemp(join(tmpdir(), 'canvas-installed-webview-')) }
  delete env.OS_CANVAS_RESOURCE_DIR; delete env.OS_CANVAS_DATA_DIR
  const launchTime = performance.now()
  const startup = { launchEpochMs: Date.now(), webviewProfile: env.WEBVIEW2_USER_DATA_FOLDER, keepInitialNavigation }
  const child = spawn(executable, [], { cwd: dirname(executable), env, windowsHide: true })
  const exit = once(child, 'exit')
  let stderr = '', browser
  child.stdout.resume(); child.stderr.on('data', bytes => { stderr += bytes })
  try {
    const deadline = Date.now() + 60000
    while (true) {
      if (child.exitCode !== null) throw new Error(`Installed host exited ${child.exitCode}: ${stderr}`)
      try { if ((await fetch(endpoint + '/json/version')).ok) break } catch {}
      if (Date.now() >= deadline) throw new Error('Native startup timed out')
      await delay(250)
    }
    startup.debugEndpointMs = performance.now() - launchTime
    browser = await chromium.connectOverCDP(endpoint)
    startup.debugAttachedMs = performance.now() - launchTime
    const context = browser.contexts()[0]
    const page = context.pages()[0] ?? await context.waitForEvent('page')
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.waitForURL(initialURL, { waitUntil: 'domcontentloaded' })
    await beforeNavigate?.({ page, context, browser })
    if (!keepInitialNavigation) await page.goto('http://tauri.localhost/?test&os-canvas&no-rulers')
    await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 60000 })
    startup.canvasReadyObservedMs = performance.now() - launchTime
    startup.navigation = await page.evaluate(() => {
      const entry = performance.getEntriesByType('navigation')[0]
      return { timeOrigin: performance.timeOrigin, domContentLoadedMs: entry?.domContentLoadedEventEnd,
        loadEventMs: entry?.loadEventEnd, url: location.href }
    })
    return { page, browser, expect, errors, child, startup,
      async close() {
        try {
          await page.evaluate(() => { void window.__TAURI_INTERNALS__.invoke('plugin:process|exit', { code: 0 }) }).catch(() => {})
          const [code] = await Promise.race([exit, delay(10000).then(() => { throw new Error('Native exit timed out') })])
          if (code !== 0) throw new Error(`Native exit ${code}: ${stderr}`)
        } finally {
          if (child.exitCode === null) child.kill()
          await browser.close().catch(() => {})
        }
        // WebView2 can outlive the native parent briefly; do not race the next launch.
        const deadline = Date.now() + 10000
        while (true) {
          try { await fetch(endpoint + '/json/version', { signal: AbortSignal.timeout(1000) }) }
          catch { break }
          if (Date.now() >= deadline) throw new Error('Native WebView debugging endpoint did not exit')
          await delay(100)
        }
      } }
  } catch (error) {
    await onStartupFailure?.({ browser, startup, error }).catch(() => {})
    if (child.exitCode === null) child.kill()
    await browser?.close().catch(() => {})
    throw error
  }
}
