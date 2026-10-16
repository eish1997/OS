import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {openInstalledCanvas,resizeInstalledCanvas} from './native-host.mjs'
import {mkdir,writeFile,readFile} from 'node:fs/promises'
const {chromium}=createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const hostRecord=process.env.OS_CANVAS_THEME_HOST_RECORD ? JSON.parse(await readFile(process.env.OS_CANVAS_THEME_HOST_RECORD,'utf8')) : null
if(hostRecord) assert.equal(createHash('sha256').update(await readFile(hostRecord.executable)).digest('hex'),hostRecord.sha256)
const base=hostRecord ? 'http://tauri.localhost' : (process.env.OS_CANVAS_TEST_URL ?? 'http://localhost:24650')
const out=resolve(process.env.OS_CANVAS_THEME_EVIDENCE ?? 'output/dev-evidence/canvas-c05/theme')
await mkdir(out,{recursive:true})
const host=hostRecord ? await openInstalledCanvas({executablePath:hostRecord.executable}) : null
const browser=host?.browser ?? await chromium.launch({channel:'msedge'})
const page=host?.page ?? await browser.newPage({viewport:{width:1440,height:900}})
if(host) await resizeInstalledCanvas(host)
const errors=[]; page.on('pageerror',e=>errors.push(e.message))
const result={hostRecord,scope:host ? 'Explicit Windows native artifact, real WebView UI' : 'Development browser, real UI; not installed release'}
try {
 await page.addInitScript(()=>localStorage.setItem('open-pencil:theme','light'))
 await page.goto(`${base}/?test&os-canvas&no-rulers`)
 await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({timeout:120000})
 await page.locator('#loader').waitFor({state:'detached'})
 result.theme=await page.evaluate(()=>({theme:document.documentElement.dataset.theme,preference:localStorage.getItem('open-pencil:theme'),accent:getComputedStyle(document.body).getPropertyValue('--color-accent').trim()}))
 assert.equal(result.theme.theme,'dark'); assert.equal(result.theme.preference,'light'); assert.equal(result.theme.accent,'#EEEEEE')
 const active=page.locator('button.bg-accent').first()
 result.tool=await active.evaluate(el=>({background:getComputedStyle(el).backgroundColor,text:getComputedStyle(el).color}))
 assert.equal(result.tool.background,'rgb(238, 238, 238)'); assert.equal(result.tool.text,'rgb(36, 35, 31)')
 await page.screenshot({path:resolve(out,'workspace.png')})
 await page.mouse.click(700,450,{button:'right'})
 const menu=page.getByRole('menu').first(); await menu.waitFor()
 result.menu=await menu.evaluate(el=>({accent:getComputedStyle(el).getPropertyValue('--color-accent').trim(),panel:getComputedStyle(el).getPropertyValue('--color-panel').trim(),outsideWorkspace:!el.closest('.os-canvas-workspace')}))
 assert.equal(result.menu.accent,'#EEEEEE'); assert.equal(result.menu.panel,'#191919')
 await page.screenshot({path:resolve(out,'menu.png')})
 await page.keyboard.press('Escape')
 await page.goto(`${base}/?test&no-rulers`)
 await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({timeout:60000})
 result.upstream=await page.evaluate(()=>({theme:document.documentElement.dataset.theme,os:document.documentElement.dataset.osCanvas}))
 assert.equal(result.upstream.theme,'light'); assert.equal(result.upstream.os,'false')
 assert.deepEqual(errors,[]);result.status='passed'
} catch(e){result.status='failed';result.error=e.stack;throw e}
finally{result.errors=errors;await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2));if(host) await host.close(); else await browser.close()}
