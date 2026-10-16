import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { openInstalledCanvas } from './native-host.mjs'

const hostRecordPath = process.env.OS_CANVAS_STARTUP_HOST_RECORD
const hostRecord = hostRecordPath ? JSON.parse(await readFile(hostRecordPath, 'utf8')) : null
if (hostRecord) assert.equal(createHash('sha256').update(await readFile(hostRecord.executable)).digest('hex'), hostRecord.sha256)
const evidence = resolve(process.env.OS_CANVAS_STARTUP_EVIDENCE ?? resolve('output/dev-evidence/canvas-c05/performance/native', hostRecord ? 'startup-fixed-release' : 'startup'))
await mkdir(evidence, { recursive: true })
const profile = await mkdtemp(join(tmpdir(), 'canvas-startup-profile-'))
assert.deepEqual(await readdir(profile), [])
const results = []
let host
try {
  for (const mode of ['fresh-webview-profile', 'reused-webview-profile']) {
    host = await openInstalledCanvas({ executablePath: hostRecord?.executable, webviewProfile: profile, keepInitialNavigation: true,
      async onStartupFailure({ browser, startup }) {
        const page = browser?.contexts()[0]?.pages()[0]
        if (!page) return
        const state = await page.evaluate(() => ({ url: location.href, body: document.body.innerText,
          canvases: [...document.querySelectorAll('canvas')].map(c => ({ ...c.dataset, width: c.width, height: c.height })) }))
        await writeFile(join(evidence, 'startup-page-failure.json'), JSON.stringify({ startup, state }, null, 2))
        await page.screenshot({ path: join(evidence, 'startup-page-failure.png') })
      } })
    assert.equal(host.page.url(), 'http://tauri.localhost/?os-canvas')
    await host.expect(host.page.getByRole('button', { name: '加入目录', exact: true })).toBeVisible()
    await host.expect(host.page.getByRole('button', { name: '保存到本机', exact: true })).toBeVisible()
    await host.expect(host.page.getByText('欢迎使用 OpenPencil', { exact: true })).toHaveCount(0)
    const input = host.page.getByLabel('本地目录路径')
    const interactionStart = performance.now()
    await input.fill('startup-input-check')
    await host.expect(input).toHaveValue('startup-input-check')
    const inputRoundTripMs = performance.now() - interactionStart
    await input.fill('')
    await host.page.getByRole('button', { name: '保存到本机', exact: true }).click()
    await host.expect(host.page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机')
    const tabs = host.page.locator('[data-test-id="tabbar-tab"]')
    await host.expect(tabs).toHaveCount(1)
    await host.page.locator('[data-test-id="tabbar-new"]').click()
    await host.expect(tabs).toHaveCount(2)
    await host.expect(input).toBeVisible()
    await host.page.getByRole('button', { name: '保存到本机', exact: true }).click()
    await host.expect(host.page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机')
    await host.page.locator('[data-test-id="tabbar-close"][data-active]').click()
    await host.expect(tabs).toHaveCount(1)
    const previousTabId = await tabs.first().getAttribute('id')
    await host.page.locator('[data-test-id="tabbar-close"]').click()
    await host.expect(tabs).toHaveCount(1)
    await host.expect.poll(() => tabs.first().getAttribute('id')).not.toBe(previousTabId)
    await host.expect(input).toBeVisible()
    await host.expect(host.page.locator('[data-test-id="canvas-element"][data-ready="1"]')).toBeVisible()
    await host.page.screenshot({ path: join(evidence, `${mode}.png`) })
    assert.deepEqual(host.errors, [])
    results.push({ mode, startup: host.startup, inputRoundTripMs, tabEntryRegression: 'new-and-last-close-passed', pageErrors: host.errors })
    await host.close(); host = null
  }
  await writeFile(join(evidence, 'result.json'), JSON.stringify({
    status: 'startup-observations-recorded', results, hostRecord,
    scope: `${hostRecord ? 'Explicit release artifact (see hostRecord)' : 'Installed release'} initial production URL, no forced reload or test URL. Existing application data. First launch uses an empty WebView profile; second launch reuses it. Both use a new native process.`,
    timing: 'Monotonic host spawn to observed canvas ready includes CDP startup/attachment and polling overhead; an observed upper bound, not an exact first-paint timestamp. Input timing includes automation transport.',
    limitations: ['OS file cache is warm and was not flushed; this is not post-reboot OS cold startup.',
      'No separate startup numeric budget was specified; the 5-second existing-canvas-open budget is measured by native-scale separately.']
  }, null, 2) + '\n')
} catch (error) {
  await writeFile(join(evidence, 'failure.json'), JSON.stringify({ error: error.stack, results }, null, 2))
  throw error
} finally { await host?.close() }
