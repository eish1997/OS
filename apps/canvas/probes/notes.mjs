import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const {chromium,expect}=createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const out=resolve(process.env.OS_CANVAS_EVIDENCE_DIR ?? 'output/dev-evidence/canvas-c06/notes')
await mkdir(out,{recursive:true})
const base=process.env.OS_CANVAS_TEST_URL ?? 'http://localhost:24650'
const name=`C06 notes ${Date.now()}`
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
async function inspectStage(stage){
 if(process.env.OS_CANVAS_NOTE_DIAGNOSTIC!=='1') return
 result.stages??=[]
 result.stages.push(await page.evaluate(async stage=>{
  const {fontManager,documentFontStatus}=await import('/packages/core/src/text/index.ts')
  const s=window.openPencil.getStore()
  return {stage,fonts:documentFontStatus(s.graph,s.state.currentPageId),generation:fontManager.generation(),nodes:[...s.graph.nodes.values()].filter(n=>n.type==='TEXT').map(n=>({text:n.text,width:n.width,height:n.height,x:n.x,y:n.y,visible:n.visible,opacity:n.opacity,family:n.fontFamily,picture:!!n.textPicture,blocked:fontManager.isNodeBlocked(n.id)}))}
 },stage))
 await page.screenshot({path:resolve(out,stage+'.png')})
}
async function draw(key,x,y,w,h){
 await page.keyboard.press(key);await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+w,y+h,{steps:10});await page.mouse.up();await page.keyboard.press('Escape')
}
try{
 await open()
 await page.evaluate(name=>{const s=window.openPencil.getStore();s.state.autosaveEnabled=false;s.state.documentName=name},name)
 await page.getByRole('button',{name:'新建便签',exact:true}).click()
 await expect.poll(()=>page.evaluate(()=>!!window.openPencil.getStore().state.editingTextId)).toBe(true)
 await page.keyboard.insertText('便签测试 Note');await page.keyboard.press('Enter');await page.keyboard.insertText('整理素材与想法')
 await page.keyboard.press('Escape')
 await expect.poll(async()=>(await snap())[0]?.children[0]?.text).toBe('便签测试 Note\n整理素材与想法')
 await expect.poll(async()=>(await snap())[0]?.children[0]?.height,{timeout:30000}).toBeGreaterThan(40)
 await inspectStage('created-text')
 if(process.env.OS_CANVAS_NOTE_FONT_DIAGNOSTIC==='1') {
  await page.evaluate(async()=>{
   const {ensureGraphFonts}=await import('/src/app/editor/fonts/index.ts')
   const {layoutAuthoredNodes}=await import('/packages/core/src/layout.ts')
   const s=window.openPencil.getStore(),root=s.graph.getChildren(s.state.currentPageId)[0]
   await ensureGraphFonts(s.graph,[root.id],s.renderer)
   layoutAuthoredNodes(s.graph,[root.id]);s.requestRender()
  })
  await inspectStage('diagnostic-font-ready')
 }

 const created=await snap();assert.equal(created[0].type,'FRAME')
 await page.keyboard.press('Control+z');await expect.poll(async()=>(await snap())[0]?.children[0]?.text).toBe('')
 await page.keyboard.press('Control+z');await expect.poll(snap).toEqual([])
 await page.keyboard.press('Control+Shift+z');await page.keyboard.press('Control+Shift+z');await expect.poll(snap).toEqual(created)
 await inspectStage('after-redo')
 await page.locator('[data-test-id="layers-scroll"]').getByText('便签',{exact:true}).click()
 result.beforeDrag=await page.evaluate(()=>{const s=window.openPencil.getStore();return {tool:s.state.activeTool,editing:s.state.editingTextId,selected:[...s.state.selectedIds],zoom:s.state.zoom,panX:s.state.panX,panY:s.state.panY,entered:s.state.enteredContainerId,hit:s.graph.hitTestSelectable(720,484,s.state.currentPageId,s.state.selectedIds,2)?.id,nodes:[...s.graph.nodes.values()].map(n=>({id:n.id,type:n.type,parent:n.parentId,children:n.childIds,visible:n.visible,locked:n.locked})),target:document.elementFromPoint(620,358)?.outerHTML.slice(0,300)}})
 await page.mouse.move(720,520);await page.mouse.down();await page.mouse.move(520,620,{steps:12});await page.mouse.up()
 result.afterDrag=await page.evaluate(()=>{const s=window.openPencil.getStore();return {tool:s.state.activeTool,editing:s.state.editingTextId,selected:[...s.state.selectedIds]}})
 await expect.poll(async()=>(await snap())[0]?.x).toBe(created[0].x-200)
 await expect.poll(async()=>(await snap())[0]?.y).toBe(created[0].y+100)
 await page.getByRole('textbox',{name:'本地目录路径',exact:true}).fill('note-panel-draft')
 await inspectStage('before-properties')
 await page.getByRole('button',{name:'属性面板',exact:true}).click()
 await inspectStage('after-properties')
 const properties=page.locator('[data-slot="os-properties-overlay"]')
 await expect(properties).toBeVisible()
 result.propertyInputs=await properties.locator('input').evaluateAll(ns=>ns.map(n=>({label:n.getAttribute('aria-label'),value:n.value})))
 await properties.locator('[data-slot="root"][aria-label="宽度"]').click()
 const width=properties.locator('input').filter({visible:true}).first()
 await width.fill('320');await width.press('Enter')
 await expect.poll(async()=>(await snap())[0]?.width).toBe(320)
 await inspectStage('after-width')
 const color=properties.locator('input[data-property="color-hex"]').first()
 await color.fill('DDE6D5');await color.press('Tab')
 await expect.poll(async()=>(await snap())[0]?.fills[0]?.color?.r).toBe(0.866667)
 await inspectStage('after-color')
 if(process.env.OS_CANVAS_NOTE_DIAGNOSTIC==='1') {
  const png=await page.evaluate(async()=>{const s=window.openPencil.getStore();return [...await s.renderExportImage([s.graph.getChildren(s.state.currentPageId)[0].id],1,'PNG')]})
  await writeFile(resolve(out,'styled-export.png'),Buffer.from(png))
  await inspectStage('after-export')
 }

 await page.screenshot({path:resolve(out,'properties.png')})
 await page.getByRole('button',{name:'资产面板',exact:true}).click()
 await expect(properties).toBeHidden()
 await expect(page.getByRole('textbox',{name:'本地目录路径',exact:true})).toHaveValue('note-panel-draft')
 await page.keyboard.press('Control+z');await expect.poll(async()=>(await snap())[0]?.fills[0]?.color?.r).toBe(0.933333)
 await page.keyboard.press('Control+z');await expect.poll(async()=>(await snap())[0]?.width).toBe(240)
 await page.keyboard.press('Control+Shift+z');await expect.poll(async()=>(await snap())[0]?.width).toBe(320)
 await page.keyboard.press('Control+Shift+z');await expect.poll(async()=>(await snap())[0]?.fills[0]?.color?.r).toBe(0.866667)
 result.checks.push('asset draft survives panel switch; property color/width undo and redo')
 result.checks.push('unobstructed native property inputs change note width and paper fill')
 await page.keyboard.press('Control+d');await expect.poll(async()=>(await snap()).length).toBe(2)
 await page.keyboard.press('ArrowRight');await page.keyboard.press('Escape')
 result.checks.push('real create button and multiline Chinese typing, text/create undo-redo, layer selection, duplicate and nudge')
 result.expected=await snap()
 await page.getByRole('button',{name:'保存到本机',exact:true}).click()
 await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000})
 await page.screenshot({path:resolve(out,'saved.png')})
 await browser.close();await open()
 await page.getByRole('button',{name:'本机画布',exact:true}).click()
 await page.getByLabel('本机画布列表').getByRole('button',{name:new RegExp(`^${name} ·`)}).click()
 await expect.poll(snap,{timeout:30000}).toEqual(result.expected)
 result.restored=await snap();result.checks.push('fresh browser restores both editable note frames and Chinese content')
 await page.screenshot({path:resolve(out,'restored.png')})
 const point=await page.evaluate(()=>{
  const s=window.openPencil.getStore(),n=s.graph.getChildren(s.state.currentPageId)[0],rect=document.querySelector('[data-test-id="canvas-element"]').getBoundingClientRect()
  return {x:rect.left+(n.x+30)*s.state.zoom+s.state.panX,y:rect.top+(n.y+30)*s.state.zoom+s.state.panY}
 })
 await page.mouse.dblclick(point.x,point.y)
 await expect.poll(()=>page.evaluate(()=>!!window.openPencil.getStore().state.editingTextId)).toBe(true)
 await page.keyboard.press('Control+a');await page.keyboard.insertText('长便签内容需要完整展示。'.repeat(30));await page.keyboard.press('Escape')
 await expect.poll(async()=>(await snap())[0]?.height).toBeGreaterThan(200)
 result.longSource=await page.evaluate(()=>{const s=window.openPencil.getStore(),n=s.graph.getChildren(s.state.currentPageId)[0];return {source:n.source,derived:n.derivedLayout,height:n.height}})
 const expanded=await snap();assert.ok(expanded[0].height>=expanded[0].children[0].height+32-0.01)
 result.checks.push('freshly reopened note accepts double-click editing; long body grows the paper with padding')
 await page.screenshot({path:resolve(out,'long-note.png')})
 await page.getByRole('button',{name:'保存到本机',exact:true}).click()
 await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000})
 await browser.close();await open()
 await page.getByRole('button',{name:'本机画布',exact:true}).click()
 await page.getByLabel('本机画布列表').getByRole('button',{name:new RegExp(`^${name} ·`)}).click()
 await expect.poll(snap,{timeout:30000}).toEqual(expanded)
 assert.deepEqual(errors,[]);result.status='passed'
}catch(e){result.status='failed';result.error=e.stack;await page?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});throw e}
finally{result.errors=errors;await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2));await browser?.close()}
