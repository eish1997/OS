import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const {chromium,expect}=createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const out=resolve(process.env.OS_CANVAS_EVIDENCE_DIR ?? 'output/dev-evidence/canvas-c06/connections-basic')
await mkdir(out,{recursive:true})
const base=process.env.OS_CANVAS_TEST_URL ?? 'http://localhost:24650'
const name=`C06 connections ${Date.now()}`
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
 await draw('r',400,250,120,90);await draw('r',750,350,120,90)
 await page.keyboard.press('Control+a')
 await page.getByRole('button',{name:'连接对象',exact:true}).click()
 const line=()=>page.evaluate(()=>{
   const s=window.openPencil.getStore(),n=[...s.graph.nodes.values()].find(n=>n.name==='关系连接')
   return n ? {x:n.x,y:n.y,width:n.width,height:n.height,vertices:n.vectorNetwork?.vertices.map(v=>({...v,handleMirroring:v.handleMirroring ?? 'NONE'})),link:n.pluginData.find(p=>p.key==='os.canvas/connection')?.value} : null
 })
 await expect.poll(line).not.toBeNull()
 result.initial=await line();assert.ok(result.initial.vertices?.length===2)
 assert.equal(result.initial.x,520);assert.equal(result.initial.width,230)
 const filterFixture=await page.evaluate(()=>{
   const s=window.openPencil.getStore(),nodes=s.graph.getChildren(s.state.currentPageId)
   const link=nodes.find(n=>n.name==='关系连接'),source=nodes.find(n=>n.name==='Rectangle 1')
   s.graph.updateNode(link.id,{name:'Keep relation'});s.graph.updateNode(source.id,{name:'Keep source'});s.select([])
   return {line:link.id,source:source.id}
 })
 const authored=await snap()
 await page.locator('[data-slot="local-filter-panel"] summary').click()
 const clip={x:628,y:337,width:16,height:16}
 const visiblePixels=await page.screenshot({clip})
 await page.getByRole('textbox',{name:'筛选名称或文件名'}).fill('Keep')
 await expect.poll(()=>page.evaluate(id=>window.openPencil.getStore().graph.isViewHidden(id),filterFixture.line)).toBe(true)
 await expect.poll(()=>page.evaluate(id=>window.openPencil.getStore().graph.isViewHidden(id),filterFixture.source)).toBe(false)
 const hiddenPixels=await page.screenshot({clip});assert.equal(visiblePixels.equals(hiddenPixels),false)
 await page.screenshot({path:resolve(out,'filtered.png')})
 await page.getByRole('button',{name:'清除筛选',exact:true}).click()
 await expect.poll(()=>page.evaluate(id=>window.openPencil.getStore().graph.isViewHidden(id),filterFixture.line)).toBe(false)
 assert.deepEqual(await snap(),authored)
 assert.equal(visiblePixels.equals(await page.screenshot({clip})),true)
 await page.locator('[data-slot="local-filter-panel"] summary').click()
 await page.evaluate(ids=>{
   const s=window.openPencil.getStore();s.graph.updateNode(ids.line,{name:'关系连接'});s.graph.updateNode(ids.source,{name:'Rectangle 1'})
 },filterFixture)
 result.checks.push('real filter hides connector when target is hidden despite matching line name; pixels restore, authored graph unchanged')

 await page.keyboard.press('Control+a');await page.keyboard.press('Control+d')
 const selectedCopy=()=>page.evaluate(()=>{
   const s=window.openPencil.getStore(),nodes=[...s.state.selectedIds].map(id=>s.graph.getNode(id))
   const uuid=n=>n.pluginData.find(p=>p.key==='os.canvas/nodeId')?.value
   const link=nodes.find(n=>n.pluginData.some(p=>p.key==='os.canvas/connection'))
   return {identities:nodes.map(uuid).sort(),link:link ? JSON.parse(link.pluginData.find(p=>p.key==='os.canvas/connection').value) : null}
 })
 await expect.poll(async()=>(await selectedCopy()).identities.length).toBe(3)
 result.copy=await selectedCopy()
 assert.ok(result.copy.identities.includes(result.copy.link.source));assert.ok(result.copy.identities.includes(result.copy.link.target))
 assert.notEqual(result.copy.link.source,JSON.parse(result.initial.link).source)
 assert.notEqual(result.copy.link.target,JSON.parse(result.initial.link).target)
 await page.keyboard.press('Control+z')
 await expect.poll(()=>page.evaluate(()=>window.openPencil.getStore().graph.getChildren(window.openPencil.getStore().state.currentPageId).length)).toBe(3)
 await page.keyboard.press('Control+Shift+z');await expect.poll(selectedCopy).toEqual(result.copy)
 await page.keyboard.press('Delete')
 await expect.poll(()=>page.evaluate(()=>window.openPencil.getStore().graph.getChildren(window.openPencil.getStore().state.currentPageId).length)).toBe(3)
 result.checks.push('duplicate endpoints and relation remaps both UUIDs before history; undo/redo retains remap')
 for(const includeSource of [false,true]){
   await page.evaluate(includeSource=>{
     const s=window.openPencil.getStore(),nodes=s.graph.getChildren(s.state.currentPageId)
     const link=nodes.find(n=>n.pluginData.some(p=>p.key==='os.canvas/connection'))
     const relation=JSON.parse(link.pluginData.find(p=>p.key==='os.canvas/connection').value)
     const source=nodes.find(n=>n.pluginData.some(p=>p.key==='os.canvas/nodeId' && p.value===relation.source))
     s.select(includeSource ? [source.id,link.id] : [link.id])
   },includeSource)
   await page.keyboard.press('Control+d')
   const copied=await selectedCopy(),original=JSON.parse(result.initial.link)
   assert.equal(copied.identities.length,includeSource ? 2 : 1)
   assert.equal(copied.link.target,original.target)
   if(includeSource){assert.notEqual(copied.link.source,original.source);assert.ok(copied.identities.includes(copied.link.source))}
   else assert.equal(copied.link.source,original.source)
   await page.keyboard.press('Control+z');await page.keyboard.press('Control+Shift+z')
   await expect.poll(selectedCopy).toEqual(copied)
   await page.keyboard.press('Delete')
 }
 await page.evaluate(()=>{
   const s=window.openPencil.getStore(),link=s.graph.getChildren(s.state.currentPageId).find(n=>n.name==='关系连接')
   s.select([link.id])
 })
 await page.keyboard.press('Delete');await expect.poll(line).toBeNull()
 await page.keyboard.press('Control+z');await expect.poll(line).toEqual(result.initial)
 result.checks.push('line-only copy retains endpoints; source+line remaps source only; undo/redo and relation deletion restore; fixture selection via editor API')

 await page.keyboard.press('Escape');await page.mouse.click(450,290)
 await page.keyboard.press('Shift+ArrowRight')
 await expect.poll(async()=>(await line()).x).toBe(530)
 await page.keyboard.press('Control+z');await expect.poll(line).toEqual(result.initial)
 await page.keyboard.press('Control+Shift+z');await expect.poll(async()=>(await line()).x).toBe(530)
 result.moved=await line()
 await page.keyboard.press('Delete')
 await expect(page.getByRole('status').filter({hasText:'1 条连接缺少端点'})).toBeVisible()
 assert.deepEqual(await line(),result.moved)
 await page.keyboard.press('Control+z');await expect(page.getByText('1 条连接缺少端点',{exact:true})).toHaveCount(0)
 await expect.poll(line).toEqual(result.moved)
 result.checks.push('UI connection creation, endpoint movement follows, undo/redo, deletion preserves relation, undo reconnects')
 await page.getByRole('button',{name:'保存到本机',exact:true}).click()
 await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000})
 await page.screenshot({path:resolve(out,'saved.png')})
 await browser.close();await open()
 await page.getByRole('button',{name:'本机画布',exact:true}).click()
 await page.getByLabel('本机画布列表').getByRole('button',{name:new RegExp(`^${name} ·`)}).click()
 await expect.poll(line,{timeout:30000}).toEqual(result.moved)
 await page.mouse.click(460,290);await page.keyboard.press('ArrowRight')
 await expect.poll(async()=>(await line()).x).toBe(531)
 result.checks.push('fresh browser reopen retains endpoint identities and live follow')
 await page.keyboard.press('Control+a')
 result.clipboardSource=await selectedCopy()
 await page.evaluate(async()=>{window.__connectionCopy=(await window.openPencil.getStore().prepareCopy()).snapshot})
 await page.locator('[data-test-id="tabbar-new"]').click()
 await expect.poll(()=>page.evaluate(()=>window.openPencil.getStore().graph.getChildren(window.openPencil.getStore().state.currentPageId).length)).toBe(0)
 await page.evaluate(async()=>{await window.openPencil.getStore().pasteSnapshot(window.__connectionCopy)})
 result.pasted=await selectedCopy()
 assert.equal(result.pasted.identities.length,3)
 assert.ok(result.pasted.identities.every(id=>!result.clipboardSource.identities.includes(id)))
 assert.ok(result.pasted.identities.includes(result.pasted.link.source));assert.ok(result.pasted.identities.includes(result.pasted.link.target))
 await page.mouse.click(700,700);await page.keyboard.press('Control+z')
 await expect.poll(()=>page.evaluate(()=>window.openPencil.getStore().graph.getChildren(window.openPencil.getStore().state.currentPageId).length)).toBe(0)
 await page.keyboard.press('Control+Shift+z');await expect.poll(selectedCopy).toEqual(result.pasted)
 result.checks.push('real app prepareCopy/pasteSnapshot across tabs allocates fresh identities, remaps endpoints and survives undo/redo; OS clipboard not exercised')
 await page.screenshot({path:resolve(out,'restored.png')})
 assert.deepEqual(errors,[]);result.status='passed'
}catch(e){result.status='failed';result.error=e.stack;await page?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});throw e}
finally{result.errors=errors;await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2));await browser?.close()}
