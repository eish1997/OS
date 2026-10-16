import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const {chromium,expect}=createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const browser=await chromium.connectOverCDP('http://127.0.0.1:19420')
const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('http://tauri.localhost'))
const command=action=>page.evaluate(action=>window.__TAURI_INTERNALS__.invoke('desktop_preview',{action}),action)
const code=page.getByLabel('节点代码');const original=await code.inputValue()
const result={scope:'Native node execution requested before hide and completed while hidden; short synchronous QuickJS task only'}
try {
 await code.fill('const until = Date.now() + 500; while (Date.now() < until) {} return { type: "text", text: "completed while hidden" }')
 await page.getByRole('button',{name:'运行节点',exact:true}).click()
 await expect(page.locator('[data-slot="isolation-status"]')).toHaveText('运行中')
 result.hidden=await command('toggle');assert.equal(result.hidden.hidden,true)
 await expect(page.locator('[data-slot="isolation-status"]')).toHaveText('completed',{timeout:15000})
 await expect(page.locator('[data-slot="isolation-result"]')).toHaveText('completed while hidden')
 result.completedHidden=await command('status');assert.equal(result.completedHidden.hidden,true)
 result.restored=await command('restore');assert.equal(result.restored.hidden,false)
 await expect(page.locator('[data-slot="isolation-result"]')).toHaveText('completed while hidden')
 result.status='passed'
} catch(error) {result.error=String(error);throw error}
finally {
 await command('restore');await code.fill(original)
 await writeFile('output/dev-evidence/canvas-c01/desktop/layers-native/node-coexistence.json',JSON.stringify(result,null,2))
 await browser.close()
}
