import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { openInstalledCanvas } from './native-host.mjs'
import { createServer } from 'node:http'

const denyFontCache = process.env.OS_CANVAS_DENY_FONT_CACHE === '1'
const validationRecord = process.env.OS_CANVAS_VALIDATION_RECORD
const validation = validationRecord ? JSON.parse(await readFile(validationRecord, 'utf8')) : null
if (validation) {
  assert.match(validation.identifier, /^local\.os\.canvas\.validation[a-f0-9]{32}$/)
  assert.equal(denyFontCache, false, 'Clean-data validation must not use cache fault injection')
  const dataPath = join(process.env.LOCALAPPDATA, validation.identifier)
  await assert.rejects(stat(dataPath), { code: 'ENOENT' }, 'Validation data directory must not exist before first launch')
}
const evidence = resolve('output/dev-evidence/canvas-c05/desktop', validation ? 'offline-clean-data' : denyFontCache ? 'installed-offline-no-font-cache' : 'installed-offline')
await mkdir(evidence, { recursive: true })
const folder = await mkdtemp(join(tmpdir(), 'canvas-offline-'))
await writeFile(join(folder, '离线中文素材.txt'), 'Local offline sample')
const blocked = [], warnings = []
const proxyRequests = []
const proxy = createServer((request, response) => {
  proxyRequests.push(request.url); response.writeHead(503); response.end('Offline test: external network unavailable')
})
proxy.on('connect', (request, socket) => { proxyRequests.push(request.url); socket.end('HTTP/1.1 503 Service Unavailable\r\n\r\n') })
await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve))
const proxyUrl = `http://127.0.0.1:${proxy.address().port}`
let host, page
const options = { executablePath: validation?.executable,
  browserArguments: validation ? `--proxy-server=${proxyUrl} --proxy-bypass-list="localhost;127.0.0.1;*.localhost"` : '',
  environment: { HTTP_PROXY: proxyUrl, HTTPS_PROXY: proxyUrl, ALL_PROXY: proxyUrl,
  http_proxy: proxyUrl, https_proxy: proxyUrl, all_proxy: proxyUrl,
  NO_PROXY: 'localhost,127.0.0.1,.localhost', no_proxy: 'localhost,127.0.0.1,.localhost' },
  async beforeNavigate({ page, context }) {
  if (denyFontCache) await page.addInitScript(() => {
    window.__canvasFontCacheProbe = { installed: false, denied: [], fontCalls: [] }
    const install = () => {
      const internal = window.__TAURI_INTERNALS__
      if (!internal?.invoke) { setTimeout(install, 0); return }
      const descriptor = Object.getOwnPropertyDescriptor(internal, 'invoke')
      if (!descriptor?.writable) {
        window.__canvasFontCacheProbe.unsupported = 'Native invoke is immutable; cache fault injection cannot be installed'
        return
      }
      const original = internal.invoke.bind(internal)
      internal.invoke = (command, args, ...rest) => {
        if (command.startsWith('plugin:fs|') || command.includes('font')) {
          window.__canvasFontCacheProbe.fontCalls.push({ command, path: args?.path, family: args?.family })
        }
        if (command === 'plugin:fs|read_file' && String(args?.path).replaceAll('\\', '/').startsWith('cache/v1/font-cache/')) {
          window.__canvasFontCacheProbe.denied.push({ command, path: args.path, at: performance.now() })
          return Promise.reject(new Error('Probe: downloaded font cache unavailable'))
        }
        return original(command, args, ...rest)
      }
      window.__canvasFontCacheProbe.installed = true
      window.__canvasFontCacheProbe.installedAt = performance.now()
    }
    install()
  })
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    if (['http:', 'https:'].includes(url.protocol) && !['tauri.localhost', 'osworkspace.localhost', 'ipc.localhost'].includes(url.hostname)) {
      blocked.push(url.href)
      return route.abort('internetdisconnected')
    }
    return route.continue()
  })
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.clearBrowserCache')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  page.on('console', msg => { if (['warning', 'error'].includes(msg.type())) warnings.push(msg.text()) })
} }
async function snapshot() {
  return page.evaluate(() => {
    const s = window.openPencil.getStore()
    return [...s.graph.nodes.values()].filter(n => n.type === 'TEXT').map(n => ({ text: n.text, fontFamily: n.fontFamily, x: n.x, y: n.y }))
  })
}
try {
  host = await openInstalledCanvas(options); page = host.page
  if (denyFontCache) {
    const probe = await page.evaluate(() => window.__canvasFontCacheProbe)
    assert.ok(probe?.installed, probe?.unsupported ?? 'Font-cache probe not installed')
  }
  await page.getByLabel('本地目录路径').fill(folder)
  await page.getByRole('button', { name: '加入目录', exact: true }).click()
  await host.expect.poll(async () => JSON.stringify(await snapshot())).toContain('离线中文素材.txt')
  await page.evaluate(() => {
    const s = window.openPencil.getStore()
    s.graph.createNode('TEXT', s.state.currentPageId, { name: 'Offline text', text: '离线画布 Offline canvas 123',
      x: 380, y: 340, width: 650, height: 60, fontSize: 28, fontFamily: 'Inter',
      fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 }, opacity: 1, visible: true }] })
    s.requestRender()
  })
  await page.getByRole('button', { name: '保存到本机', exact: true }).click()
  await host.expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机', { timeout: 30000 })
  const original = await snapshot()
  const firstCacheProbe = await page.evaluate(() => window.__canvasFontCacheProbe ?? null)
  if (denyFontCache) assert.ok(firstCacheProbe?.installed && firstCacheProbe.denied.length > 0, 'Must observe rejected font-cache reads')
  await page.screenshot({ path: join(evidence, 'saved.png') })
  assert.deepEqual(host.errors, [])
  await host.close(); host = await openInstalledCanvas(options); page = host.page
  await page.getByRole('button', { name: '我的目录', exact: true }).click()
  await page.getByRole('button', { name: folder, exact: true }).click()
  await host.expect.poll(snapshot, { timeout: 30000 }).toEqual(original)
  await page.screenshot({ path: join(evidence, 'reopened.png') })
  assert.deepEqual(host.errors, [])
  assert.ok(proxyRequests.some(url => /fonts\.google\.com|api\.fontsource\.org/.test(url)),
    'Must observe native font HTTP requests reaching the rejecting proxy')
  const reopenedCacheProbe = await page.evaluate(() => window.__canvasFontCacheProbe ?? null)
  if (validation) assert.ok((await stat(join(process.env.LOCALAPPDATA, validation.identifier, 'canvas', 'workspace.sqlite'))).isFile(), 'Native workspace must use isolated application data')
  if (denyFontCache) assert.ok(reopenedCacheProbe?.installed && reopenedCacheProbe.denied.length > 0, 'Must reject font-cache reads after restart')
  await writeFile(join(evidence, 'result.json'), JSON.stringify({ status: 'workflow-passed-visual-review-required', folder, original, blocked, proxyRequests, warnings,
    denyFontCache, firstCacheProbe, reopenedCacheProbe,
    validation, initiallyAbsentDataDirectory: Boolean(validation),
    cacheScope: validation ? 'Actual application data directory absent before launch; no font-cache fault injection. System fonts remain available.'
      : 'Optional renderer bridge fault injection rejects downloaded-font cache reads; system fonts remain available. Does not alter disk cache or prove a fresh OS installation.',
    scope: validation
      ? 'Separate release application identity with initially absent data directory; renderer proxy configured before process launch plus routing after attachment, native reqwest uses rejecting proxy. System fonts remain available. Not a fresh Windows installation or OS-wide network isolation.'
      : 'Renderer external HTTP(S) blocked before test navigation, cache disabled, fresh WebView profile each process; native reqwest uses a local rejecting proxy. First pre-attachment renderer navigation not blocked. Not an OS-wide offline claim.' }, null, 2))
} catch (error) {
  await page?.screenshot({ path: join(evidence, 'failure.png') }).catch(() => {})
  const cacheProbe = await page?.evaluate(() => window.__canvasFontCacheProbe ?? null).catch(() => null)
  await writeFile(join(evidence, 'failure.json'), JSON.stringify({ error: error.stack, blocked, warnings, errors: host?.errors, cacheProbe }, null, 2))
  throw error
} finally { try { await host?.close() } finally { proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)) } }
