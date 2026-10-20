import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const {chromium,expect}=createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const out=resolve(process.env.OS_CANVAS_EVIDENCE_DIR ?? 'output/dev-evidence/canvas-c06/lists-pencil')
await mkdir(out,{recursive:true})
const base=process.env.OS_CANVAS_TEST_URL ?? 'http://localhost:24650'
const name=`C06 lists pencil ${Date.now()}`
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
 const visit=id=>s.graph.getChildren(id).map(n=>({type:n.type,name:n.name,text:n.text,x:n.x,y:n.y,width:n.width,height:n.height,textParagraphs:n.textParagraphs,strokes:n.strokes.map(p=>({...p,cap:p.cap??n.strokeCap,join:p.join??n.strokeJoin,blendMode:p.blendMode??'NORMAL',dashPattern:p.dashPattern??[]})),vectorNetwork:n.vectorNetwork ? JSON.parse(JSON.stringify(n.vectorNetwork,(_k,v)=>typeof v==='number'?Math.fround(v):v)):null,fills:n.fills.map(f=>({type:f.type,color:f.color ? Object.fromEntries(Object.entries(f.color).map(([k,v])=>[k,Math.round(v*1000000)/1000000])) : null})),children:visit(n.id)}))
 return visit(s.state.currentPageId)
})}
async function draw(key,x,y,w,h){
 await page.keyboard.press(key);await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+w,y+h,{steps:10});await page.mouse.up();await page.keyboard.press('Escape')
}
try{
 await open()
 await page.evaluate(name=>{const s=window.openPencil.getStore();s.state.autosaveEnabled=false;s.state.documentName=name},name)
 await page.keyboard.press('t');await page.mouse.click(420,240)
 await expect.poll(()=>page.evaluate(()=>!!window.openPencil.getStore().state.editingTextId)).toBe(true)
 await page.keyboard.insertText('素材整理');await page.keyboard.press('Enter');await page.keyboard.insertText('画布开发')
 await page.keyboard.press('Control+a');await page.keyboard.press('Control+Shift+Digit8')
 await expect.poll(async()=>(await snap())[0]?.textParagraphs.map(p=>p.listType)).toEqual(['UNORDERED','UNORDERED'])
 await page.keyboard.press('Control+Shift+Digit7')
 await expect.poll(async()=>(await snap())[0]?.textParagraphs.map(p=>p.listType)).toEqual(['ORDERED','ORDERED'])
 await page.keyboard.press('Tab')
 await expect.poll(async()=>(await snap())[0]?.textParagraphs.map(p=>p.indentation)).toEqual([2,2])
 await page.keyboard.press('Shift+Tab')
 await expect.poll(async()=>(await snap())[0]?.textParagraphs.map(p=>p.indentation)).toEqual([1,1])
 await page.keyboard.press('Escape')
 result.checks.push('real Chinese multiline editing, unordered/ordered shortcuts and indent/outdent')
 const beforePencil=await snap()
 await page.keyboard.press('Shift+p');await page.mouse.move(430,450);await page.mouse.down()
 for (const [x,y] of [[450,420],[490,460],[540,400],[590,450],[630,410]]) await page.mouse.move(x,y,{steps:8})
 await page.mouse.up();await page.keyboard.press('Escape')
 await expect.poll(async()=>(await snap()).filter(n=>n.type==='VECTOR').length).toBe(1)
 const drawn=await snap(),vector=drawn.find(n=>n.type==='VECTOR')
 assert.ok(vector.vectorNetwork.vertices.length>2);assert.ok(vector.strokes.some(s=>s.visible && s.opacity>0))
 await page.keyboard.press('Control+z');await expect.poll(snap).toEqual(beforePencil)
 await page.keyboard.press('Control+Shift+z');await expect.poll(snap).toEqual(drawn)
 result.checks.push('real freehand pointer stroke, vector geometry, undo/redo')
 result.expected=await snap()
 await page.getByRole('button',{name:'保存到本机',exact:true}).click()
 await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000})
 await page.screenshot({path:resolve(out,'saved.png')})
 await browser.close();await open()
 await page.getByRole('button',{name:'本机画布',exact:true}).click()
 await page.getByLabel('本机画布列表').getByRole('button',{name:new RegExp(`^${name} ·`)}).click()
 await expect.poll(snap,{timeout:30000}).toEqual(result.expected)
 result.restored=await snap();result.checks.push('fresh browser restores list semantics and pencil vector geometry')
 await page.screenshot({path:resolve(out,'restored.png')})
 assert.deepEqual(errors,[]);result.status='passed'
}catch(e){result.status='failed';result.error=e.stack;await page?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});throw e}
finally{result.errors=errors;await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2));await browser?.close()}
