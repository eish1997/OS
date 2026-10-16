import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { openInstalledCanvas, resizeInstalledCanvas } from './native-host.mjs'

const smallFixture = process.env.OS_CANVAS_SAVE_FIXTURE === '20mib'
const evidence = resolve('output/dev-evidence/canvas-c05/performance/native', smallFixture ? 'save-20mib' : '.')
const fixture = JSON.parse(await readFile(join(evidence, smallFixture ? 'fixture.json' : 'scale.json'), 'utf8'))
const result = { canvasId: fixture.canvasId, snapshotBytes: fixture.snapshotBytes,
  scope: 'Installed release, diagnostic wrappers; DOM status time recorded independently of automation polling' }
let host, page
try {
  host = await openInstalledCanvas(); page = host.page
  await resizeInstalledCanvas(host)
  await page.evaluate(() => { window.openPencil.getStore().state.autosaveEnabled = false })
  await page.getByRole('button', { name: '保存到本机', exact: true }).click()
  await host.expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机', { timeout: 30000 })
  if (smallFixture) {
    const alreadyImported = await page.evaluate(async id => {
      const response = await fetch('http://osworkspace.localhost/os-workspace/canvases', { headers: { 'X-OS-Workspace': '1' } })
      if (!response.ok) throw new Error('Cannot inspect native fixture state')
      return (await response.json()).some(row => row.canvasId === id)
    }, fixture.canvasId)
    if (!alreadyImported) {
    await page.getByText('作品包', { exact: true }).click()
    await page.getByLabel('选择作品包导入').setInputFiles(join(evidence, 'fixture.oscanvas'), { timeout: 120000 })
    await host.expect(page.locator('[data-slot="package-status"]')).toContainText('作品已导入', { timeout: 120000 })
    }
  }
  await page.getByRole('button', { name: '本机画布', exact: true }).click()
  await page.getByLabel('本机画布列表').getByRole('button', { name: new RegExp(`^${fixture.name} ·`) }).click()
  await host.expect.poll(() => page.evaluate(() => {
    const s = window.openPencil.getStore(); return s.graph.getChildren(s.state.currentPageId).length
  }), { timeout: 30000 }).toBe(1000)
  await page.evaluate(() => {
    const s = window.openPencil.getStore()
    s.state.autosaveEnabled = false
    const node = s.graph.getChildren(s.state.currentPageId).find(n => n.name.startsWith('Native saved shape') || n.name === 'Scale shape 0')
    s.graph.updateNode(node.id, { name: `Native saved shape ${Date.now()}` }); s.requestRender()
    const events = window.__saveProfile = []
    const record = (name, start, extra = {}) => events.push({ name, start, end: performance.now(), ...extra })
    const status = document.querySelector('[data-slot="local-save-status"]')
    const observer = new MutationObserver(() => {
      if (status.textContent === '已保存到本机') {
        record('saved-status-dom', performance.now()); observer.disconnect()
      }
    })
    observer.observe(status, { childList: true, characterData: true, subtree: true })
    const json = JSON.stringify
    JSON.stringify = function (...args) {
      const start = performance.now(), value = json.apply(this, args)
      if (args[0]?.sceneBase64) record('save-json-encoding', start, { bytes: value.length })
      return value
    }
    if (Uint8Array.prototype.toBase64) {
      const original = Uint8Array.prototype.toBase64
      Uint8Array.prototype.toBase64 = function (...args) {
        const start = performance.now(), value = original.apply(this, args)
        if (this.byteLength > 1024 * 1024) record('base64', start, { bytes: this.byteLength })
        return value
      }
    }
    const fetch = window.fetch
    window.fetch = async function (input, init) {
      const start = performance.now()
      const response = await fetch.call(this, input, init)
      if (init?.method === 'POST' && String(input).includes('/canvases/')) record('save-request-until-headers', start, { status: response.status })
      return response
    }
    const recovery = s.protectSavedRecovery
    s.protectSavedRecovery = async function (...args) {
      const start = performance.now(), value = await recovery.apply(this, args)
      record('protect-recovery', start); return value
    }
    document.addEventListener('click', event => {
      if (event.target.closest('button')?.textContent.trim() === '保存到本机') record('save-click', performance.now())
    }, { capture: true })
  })
  await page.getByRole('button', { name: '保存到本机', exact: true }).click()
  await host.expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机', { timeout: 120000 })
  result.events = await page.evaluate(() => ({ events: window.__saveProfile, observedSavedAt: performance.now() }))
  const events = result.events.events
  assert.equal(events.filter(e => e.name === 'save-click').length, 1)
  assert.equal(events.filter(e => e.name === 'save-request-until-headers').length, 1)
  assert.equal(events.find(e => e.name === 'save-request-until-headers').status, 200)
  assert.equal(events.filter(e => e.name === 'saved-status-dom').length, 1)
  result.domSaveMs = events.find(e => e.name === 'saved-status-dom').start - events.find(e => e.name === 'save-click').start
  if (smallFixture) {
    const actualBytes = events.find(e => e.name === 'base64')?.bytes
    assert.ok(actualBytes >= 20 * 1024 ** 2 && actualBytes <= 20.25 * 1024 ** 2)
    result.actualSnapshotBytes = actualBytes
    result.saveBudgetMs = 2000
    result.saveBudgetPassed = result.domSaveMs <= 2000
  }
  assert.deepEqual(host.errors, [])
  result.status = 'diagnostic-complete'
  console.log(JSON.stringify(result))
} catch (error) {
  result.status = 'failed'; result.error = error.stack
  result.visibleText = await page?.locator('body').innerText().catch(() => '')
  await page?.screenshot({ path: join(evidence, 'save-profile-failure.png') }).catch(() => {})
  throw error
}
finally { await writeFile(join(evidence, 'save-profile.json'), JSON.stringify(result, null, 2)); await host?.close() }
