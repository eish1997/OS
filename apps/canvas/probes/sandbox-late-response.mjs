import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const { chromium, expect } = createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const directory = resolve('output/dev-evidence/canvas-c01/isolation/late-response')
await mkdir(directory, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
let releaseOld
const held = new Promise(resolve => { releaseOld = resolve })
let oldId, newId, starts = 0
const canceled = []
try {
  await page.goto('http://localhost:14350/?test&os-canvas&isolation-prototype')
  await expect(page.locator('[data-test-id="canvas-element"][data-ready="1"]')).toBeVisible({ timeout: 60000 })
  await page.route('**/os-workspace/node-runs', async route => {
    const response = await route.fetch()
    const job = await response.json()
    if (++starts === 1) { oldId = job.id; await held }
    else newId = job.id
    await route.fulfill({ response })
  })
  page.on('request', request => {
    const match = request.url().match(/node-runs\/([^/]+)\/cancel$/)
    if (match) canceled.push(match[1])
  })
  const code = page.getByLabel('节点代码')
  const run = page.getByRole('button', { name: '运行节点', exact: true })
  const cancel = page.getByRole('button', { name: '取消节点', exact: true })
  await code.fill('while (true) {}')
  await run.click()
  await expect.poll(() => oldId).toBeTruthy()
  await cancel.click()
  await run.click()
  await expect.poll(() => newId).toBeTruthy()
  releaseOld()
  await expect.poll(() => canceled.includes(oldId)).toBe(true)
  await cancel.click()
  await expect.poll(() => canceled.includes(newId)).toBe(true)
  const job = await page.evaluate(async id => (await fetch(`/os-workspace/node-runs/${id}`, {
    headers: { 'X-OS-Workspace': '1' }
  })).json(), newId)
  assert.equal(job.status, 'canceled')
  await expect(code).toHaveValue('while (true) {}')
  await writeFile(resolve(directory, 'result.json'), JSON.stringify({ status: 'passed', oldId, newId, canceled,
    scope: 'Real local service jobs; only first HTTP response delivery is delayed. Old run canceled after new run starts; cancel targets the new worker.' }, null, 2))
} catch (error) {
  await writeFile(resolve(directory, 'failure.json'), JSON.stringify({ error: error.stack, oldId, newId, canceled }, null, 2))
  throw error
} finally { releaseOld(); await browser.close() }
