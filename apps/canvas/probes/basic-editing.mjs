import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const {chromium,expect}=createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const out=resolve(process.env.OS_CANVAS_EVIDENCE_DIR ?? 'output/dev-evidence/canvas-c06/basic-editing')
await mkdir(out,{recursive:true})
const base=process.env.OS_CANVAS_TEST_URL ?? 'http://localhost:24650'
const name=`C06 basic ${Date.now()}`
let browser,page;const errors=[];const result={name,base,checks:[]}
async function open(){
 browser=await chromium.launch({channel:'msedge'})
 page=await browser.newPage({viewport:{width:1440,height:900}})
 page.on('pageerror',e=>errors.push(e.message))
 await page.goto(`${base}/?test&os-canvas&no-rulers`)
 await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({timeout:60000})
 await page.locator('#loader').waitFor({state:'detached'})
}
async function snap(){return page.evaluate(()=>{
 const s=window.openPencil.getStore()
 const visit=id=>s.graph.getChildren(id).map(n=>({type:n.type,name:n.name,text:n.text,x:n.x,y:n.y,width:n.width,height:n.height,fills:n.fills.map(f=>({type:f.type,color:f.color ? Object.fromEntries(Object.entries(f.color).map(([k,v])=>[k,Math.round(v*1000000)/1000000])) : null})),children:visit(n.id)}))
 return visit(s.state.currentPageId)
})}
async function draw(key,x,y,w,h){
 await page.keyboard.press(key);await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+w,y+h,{steps:10});await page.mouse.up();await page.keyboard.press('Escape')
}
try{
 await open()
 await page.evaluate(name=>{const s=window.openPencil.getStore();s.state.autosaveEnabled=false;s.state.documentName=name},name)
 await draw('r',400,250,120,90)
 await draw('o',620,250,100,90)
 await page.keyboard.press('t');await page.mouse.click(430,420)
 await expect.poll(()=>page.evaluate(()=>!!window.openPencil.getStore().state.editingTextId)).toBe(true)
 await page.keyboard.insertText('白板基础 Canvas 06')
 await page.keyboard.press('Escape')
 await expect.poll(async()=>(await snap()).find(n=>n.type==='TEXT')?.text).toBe('白板基础 Canvas 06')
 result.created=await snap();assert.deepEqual(result.created.map(n=>n.type).sort(),['ELLIPSE','RECTANGLE','TEXT'])
 result.textFill=await page.evaluate(()=>{
 const s=window.openPencil.getStore();return s.graph.getChildren(s.state.currentPageId).find(n=>n.type==='TEXT').fills[0].color
 })
 assert.ok(result.textFill.r > 0.9 && result.textFill.g > 0.9 && result.textFill.b > 0.9)
 result.checks.push('pointer rectangle/ellipse and readable keyboard Chinese text')
 await page.keyboard.press('Control+a');await page.keyboard.press('Control+g')
 await expect.poll(async()=>(await snap())[0]?.type).toBe('GROUP')
 const grouped=await snap();assert.equal(grouped.length,1);assert.equal(grouped[0].children.length,3)
 await page.keyboard.press('ArrowRight')
 await expect.poll(async()=>(await snap())[0].x).toBe(grouped[0].x+1)
 await page.keyboard.press('Control+z');await expect.poll(snap).toEqual(grouped)
 await page.keyboard.press('Control+Shift+z');await expect.poll(async()=>(await snap())[0].x).toBe(grouped[0].x+1)
 result.checks.push('group, move, undo and redo through keyboard')
 await page.mouse.click(460,290,{button:'right'})
 await page.locator('[data-test-id="context-frame-selection"]').click()
 await expect.poll(async()=>(await snap())[0]?.type).toBe('FRAME')
 result.checks.push('frame selection from context menu')
 await page.keyboard.press('Escape')
 await draw('f',800,450,230,160)
 await page.keyboard.press('t');await page.mouse.click(830,480)
 await expect.poll(()=>page.evaluate(()=>!!window.openPencil.getStore().state.editingTextId)).toBe(true)
 await page.keyboard.insertText('White frame text');await page.keyboard.press('Escape')
 result.containerText=await page.evaluate(()=>{
   const s=window.openPencil.getStore(),n=[...s.graph.nodes.values()].find(n=>n.text==='White frame text')
   return {fill:n.fills[0].color,parent:s.graph.getNode(n.parentId).type}
 })
 assert.equal(result.containerText.parent,'FRAME')
 assert.deepEqual(result.containerText.fill,{r:0,g:0,b:0,a:1})
 result.checks.push('new white frame retains dark text; saved fill colors roundtrip')
 result.expected=await snap()
 await page.getByRole('button',{name:'保存到本机',exact:true}).click()
 await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000})
 await page.screenshot({path:resolve(out,'saved.png')})
 await browser.close();await open()
 await page.getByRole('button',{name:'本机画布',exact:true}).click()
 await page.getByLabel('本机画布列表').getByRole('button',{name:new RegExp(`^${name} ·`)}).click()
 await expect.poll(snap,{timeout:30000}).toEqual(result.expected)
 result.restored=await snap();result.checks.push('fresh browser process restores nested artwork and Chinese content')
 await page.screenshot({path:resolve(out,'restored.png')})
 assert.deepEqual(errors,[]);result.status='passed'
}catch(e){result.status='failed';result.error=e.stack;await page?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});throw e}
finally{result.errors=errors;await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2));await browser?.close()}
