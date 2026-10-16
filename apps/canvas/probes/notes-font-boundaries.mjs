import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const {chromium,expect}=createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const out=resolve(process.env.OS_CANVAS_EVIDENCE_DIR??'output/dev-evidence/canvas-c06/notes-font-boundaries')
await mkdir(out,{recursive:true})
const result={checks:[],errors:[]};let browser,page
async function open(mode){
 browser=await chromium.launch({channel:'msedge'})
 page=await browser.newPage({viewport:{width:1440,height:900}})
 page.on('pageerror',e=>result.errors.push(e.message))
 await page.goto('http://localhost:24650/?test&os-canvas&no-rulers')
 await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({timeout:60000})
 await page.locator('#loader').waitFor({state:'detached'})
 await page.evaluate(async mode=>{
  window.openPencil.getStore().state.autosaveEnabled=false
  const {fontManager}=await import('/packages/core/src/text/index.ts')
  const original=fontManager.loadFont
  const gate={mode,calls:0,released:false};window.noteFontGate=gate
  let release;const held=new Promise(resolve=>{release=resolve})
  gate.release=()=>{gate.released=true;fontManager.loadFont=original;release()}
  fontManager.loadFont=async function(...args){
   gate.calls++
   if(gate.mode==='failure'&&!gate.released) throw new Error('Controlled note font rejection')
   await held
   return original.apply(fontManager,args)
  }
 },mode)
 await page.getByRole('button',{name:'新建便签',exact:true}).click()
 await expect.poll(()=>page.evaluate(()=>!!window.openPencil.getStore().state.editingTextId)).toBe(true)
 await page.keyboard.insertText('旧内容 Old')
 await expect.poll(()=>page.evaluate(()=>window.noteFontGate.calls)).toBeGreaterThan(0)
}
async function textNodes(){return page.evaluate(()=>[...window.openPencil.getStore().graph.nodes.values()].filter(n=>n.type==='TEXT').map(n=>({text:n.text,height:n.height})))}
try{
 await open('failure')
 await page.keyboard.press('Escape')
 await expect(page.getByRole('button',{name:'重试便签字体',exact:true})).toBeVisible()
 assert.equal((await textNodes())[0].text,'旧内容 Old')
 await page.screenshot({path:resolve(out,'failure-visible.png')})
 await page.evaluate(()=>window.noteFontGate.release())
 await page.getByRole('button',{name:'重试便签字体',exact:true}).click()
 await expect(page.getByRole('button',{name:'重试便签字体',exact:true})).toBeHidden()
 await expect.poll(async()=>(await textNodes())[0].height).toBeGreaterThan(22)
 await page.screenshot({path:resolve(out,'retried.png')})
 result.checks.push('loader rejection preserves content and real retry recovers layout')
 await browser.close()
 await open('delay')
 await page.keyboard.press('Control+a');await page.keyboard.insertText('新内容 New');await page.keyboard.press('Enter');await page.keyboard.insertText('第二行')
 assert.equal((await textNodes())[0].text,'新内容 New\n第二行')
 await page.evaluate(()=>window.noteFontGate.release())
 await expect.poll(async()=>(await textNodes())[0].height).toBeGreaterThan(40)
 assert.equal((await textNodes())[0].text,'新内容 New\n第二行')
 assert.ok(await page.evaluate(()=>!!window.openPencil.getStore().state.editingTextId))
 await page.keyboard.insertText('继续输入')
 await page.keyboard.press('Escape')
 assert.equal((await textNodes())[0].text,'新内容 New\n第二行继续输入')
 await page.screenshot({path:resolve(out,'latest-content.png')})
 result.checks.push('delayed completion keeps latest content and editing focus')
 await browser.close()
 await open('delay')
 await page.keyboard.press('Escape')
 await page.locator('[data-test-id="layers-scroll"]').getByText('便签',{exact:true}).click()
 await page.keyboard.press('Delete')
 await expect.poll(textNodes).toEqual([])
 await page.evaluate(()=>window.noteFontGate.release())
 // Allow completion via loader resolution, then verify the graph stays deleted.
 await page.evaluate(async()=>{const {fontManager}=await import('/packages/core/src/text/index.ts');await fontManager.loadFont('Inter','Regular');await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))})
 assert.deepEqual(await textNodes(),[])
 await expect(page.getByRole('button',{name:'重试便签字体',exact:true})).toBeHidden()
 await page.keyboard.press('Control+z')
 await expect.poll(async()=>(await textNodes())[0]?.height).toBeGreaterThan(22)
 assert.equal((await textNodes())[0].text,'旧内容 Old')
 result.checks.push('deletion during load is preserved and undo recreates a prepared node')
 await browser.close()
 await open('delay')
 await page.keyboard.press('Escape')
 await page.evaluate(async()=>{
  const {SceneGraph}=await import('/packages/scene-graph/src/index.ts')
  window.openPencil.getStore().replaceGraph(new SceneGraph())
  window.noteFontGate.release()
  const {fontManager}=await import('/packages/core/src/text/index.ts')
  await fontManager.loadFont('Inter','Regular')
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
 })
 assert.deepEqual(await textNodes(),[])
 await expect(page.getByRole('button',{name:'重试便签字体',exact:true})).toBeHidden()
 result.checks.push('public graph replacement during load receives no stale note or error')
 assert.deepEqual(result.errors,[]);result.status='passed' 
}catch(e){result.status='failed';result.error=e.stack;await page?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});throw e}
finally{await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2));await browser?.close()}
