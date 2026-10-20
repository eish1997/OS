import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const {chromium,expect}=createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const out=resolve(process.env.OS_CANVAS_EVIDENCE_DIR??'output/dev-evidence/canvas-c06/layer-management'),base=process.env.OS_CANVAS_TEST_URL??'http://localhost:24650'
await mkdir(out,{recursive:true})
const name=`C06 layers ${Date.now()}`,result={name,base,checks:[],errors:[]};let browser,page
async function open(){browser=await chromium.launch({channel:'msedge'});page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>result.errors.push(e.message));await page.goto(`${base}/?test&os-canvas&no-rulers`);await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({timeout:60000});await page.locator('#loader').waitFor({state:'detached'})}
async function snap(){return page.evaluate(()=>{const s=window.openPencil.getStore();const visit=id=>s.graph.getChildren(id).map(n=>({type:n.type,name:n.name,visible:n.visible,locked:n.locked,clipsContent:n.clipsContent,x:n.x,y:n.y,width:n.width,height:n.height,children:visit(n.id)}));return visit(s.state.currentPageId)})}
async function draw(key,x,y,w,h){await page.keyboard.press(key);await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+w,y+h,{steps:12});await page.mouse.up();await page.keyboard.press('Escape')}
async function rename(oldName,newName){const layers=page.locator('[data-test-id="layers-scroll"]');await layers.getByText(oldName,{exact:true}).dblclick();const input=layers.locator('input:visible');await input.fill(newName);await input.press('Enter')}
async function startTrace(){
 if(process.env.OS_CANVAS_RESTORE_TRACE!=='1')return
 page.on('request',r=>{if(r.method()==='POST') {result.requests??=[];result.requests.push({at:Date.now(),path:new URL(r.url()).pathname})}})
 await page.evaluate(()=>{
  const s=window.openPencil.getStore();window.restoreTrace=[]
  const push=(event,detail)=>window.restoreTrace.push({at:performance.now(),event,detail,dirty:s.hasUnsavedChanges(),importing:s.graph.isApplyingImportedState,layout:s.graph.isApplyingLayout})
  for(const event of ['graph:replaced','history:changed','viewport:changed','node:created','node:deleted','node:reparented','node:reordered'])s.onEditorEvent(event,(...args)=>push(event,args.map(a=>typeof a==='object'?a?.id: a)))
  s.onEditorEvent('node:updated',(id,changes)=>push('node:updated',{id,name:s.graph.getNode(id)?.name,changes}))
  let previous
  setInterval(()=>{
   if(s.state.autosaveEnabled){s.state.autosaveEnabled=false;push('autosave-disabled')}
   const state=JSON.stringify({dirty:s.hasUnsavedChanges(),status:document.querySelector('[data-slot="local-save-status"]')?.textContent})
   if(state!==previous){push('state',JSON.parse(state));previous=state}
  },10)
 })
}
async function closeTraced(){
 if(process.env.OS_CANVAS_RESTORE_TRACE==='1'){result.traces??=[];result.traces.push(await page.evaluate(()=>window.restoreTrace))}
 await browser.close()
}
async function selectName(name){await page.locator('[data-test-id="layers-scroll"]').getByText(name,{exact:true}).click();await page.locator('[data-test-id="canvas-element"]').focus()}
async function objectState(name){return page.evaluate(name=>{const s=window.openPencil.getStore(),n=[...s.graph.nodes.values()].find(n=>n.name===name);return {parent:s.graph.getNode(n.parentId)?.name,world:s.graph.getAbsolutePosition(n.id),x:n.x,y:n.y,width:n.width,height:n.height}},name)}
try{
 await open();await startTrace();await page.evaluate(name=>{const s=window.openPencil.getStore();s.state.autosaveEnabled=false;s.state.documentName=name},name)
 await draw('f',350,250,280,300);await rename((await snap())[0].name,'源画框')
 await draw('f',750,250,280,300);await rename((await snap())[1].name,'目标画框')
 await draw('r',390,300,120,100);await draw('r',450,340,120,100)
 const initial=await snap();result.initial=initial
 assert.deepEqual(initial[0].children.map(n=>n.name),['Rectangle 1','Rectangle 2'])
 if(process.env.OS_CANVAS_LOCK_HIT==='1') {
  await selectName('Rectangle 2');await page.keyboard.press('Control+Shift+l');await page.keyboard.press('Escape')
  const locked=await objectState('Rectangle 2')
  await page.mouse.move(550,420);await page.mouse.down();await page.mouse.move(580,450,{steps:12});await page.mouse.up()
  const afterLockedDrag=await objectState('Rectangle 2')
  assert.equal(afterLockedDrag.x,locked.x);assert.equal(afterLockedDrag.y,locked.y)
  assert.deepEqual(await page.evaluate(()=>{const s=window.openPencil.getStore();return [...s.state.selectedIds].map(id=>s.graph.getNode(id)?.name)}),['源画框'])
  assert.equal(afterLockedDrag.world.x,locked.world.x+30);assert.equal(afterLockedDrag.world.y,locked.world.y+30)
  await page.keyboard.press('Control+z');await expect.poll(()=>objectState('Rectangle 2')).toEqual(locked)
  await selectName('Rectangle 2');await page.keyboard.press('Control+Shift+l')
  await expect.poll(snap).toEqual(initial)
  await page.keyboard.press('Control+Shift+h');await page.keyboard.press('Escape');await page.mouse.click(550,420)
  const hitNames=await page.evaluate(()=>{const s=window.openPencil.getStore();return [...s.state.selectedIds].map(id=>s.graph.getNode(id)?.name)})
  assert.ok(!hitNames.includes('Rectangle 2'))
  await selectName('Rectangle 2');await page.keyboard.press('Control+Shift+h');await expect.poll(snap).toEqual(initial)
  result.checks.push('locked child cannot be directly selected or moved; parent movement carries it without changing local geometry; hidden object is excluded from pointer selection; restoring states preserves scene')
 }
 await selectName('Rectangle 2');await page.keyboard.press('Control+BracketLeft')
 await expect.poll(async()=>(await snap())[0].children.map(n=>n.name)).toEqual(['Rectangle 2','Rectangle 1'])
 await page.keyboard.press('Control+z');await expect.poll(snap).toEqual(initial)
 await page.keyboard.press('Control+Shift+z')
 const reordered=await snap()
 result.checks.push('send backward changes sibling order with undo and redo')
 const before=await objectState('Rectangle 2')
 const ids=await page.evaluate(()=>Object.fromEntries([...window.openPencil.getStore().graph.nodes.values()].map(n=>[n.name,n.id])))
 const row=id=>page.locator(`[data-node-id="${id}"] [data-test-id="layers-item"]`)
 await row(ids['Rectangle 2']).dragTo(row(ids['目标画框']),{targetPosition:{x:100,y:12}})
 await expect.poll(async()=>(await objectState('Rectangle 2')).parent).toBe('目标画框')
 const after=await objectState('Rectangle 2');result.transfer={before,after}
 assert.deepEqual(after.world,before.world)
 assert.equal(after.width,before.width);assert.equal(after.height,before.height)
 await page.locator('[data-test-id="canvas-element"]').focus()
 const transferred=await snap()
 await page.keyboard.press('Control+z');await expect.poll(snap).toEqual(reordered)
 await page.keyboard.press('Control+Shift+z');await expect.poll(snap).toEqual(transferred)
 result.checks.push('real layer drag reparents between frames while preserving world geometry; undo/redo restores hierarchy')
 await page.getByRole('button',{name:'保存到本机',exact:true}).click();await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000})
 await closeTraced();await open();await startTrace();await page.getByRole('button',{name:'本机画布',exact:true}).click();await page.getByLabel('本机画布列表').getByRole('button',{name:new RegExp(`^${name} ·`)}).click()
 await expect.poll(snap).toEqual(transferred);await expect(page.locator('[data-slot="title-font-loading"]')).toBeHidden({timeout:30000})
 assert.equal(await page.evaluate(()=>window.openPencil.getStore().hasUnsavedChanges()),false)
 await page.screenshot({path:resolve(out,'restored.png')});result.checks.push('fresh reopen preserves sibling order, hierarchy and geometry')
 // Reveal the reparented object inside its new frame through real keyboard movement.
 const targetRow=page.locator('[data-test-id="layers-scroll"]').getByText('目标画框',{exact:true})
 await targetRow.click();await page.locator('[data-test-id="canvas-element"]').focus();await page.keyboard.press('Enter')
 for(let step=0;step<40;step++)await page.keyboard.press('Shift+ArrowRight')
 await page.keyboard.press('Escape')
 const placed=await objectState('Rectangle 2');assert.equal(placed.x,100)
 await selectName('Rectangle 2')
 const pointer=await page.evaluate(()=>{const s=window.openPencil.getStore(),n=[...s.graph.nodes.values()].find(n=>n.name==='Rectangle 2'),p=s.graph.getAbsolutePosition(n.id),b=document.querySelector('[data-test-id="canvas-element"]').getBoundingClientRect();return {x:b.left+s.state.panX+(p.x+n.width/2)*s.state.zoom,y:b.top+s.state.panY+(p.y+n.height/2)*s.state.zoom}})
 const beforeDrag=await snap()
 await page.mouse.move(pointer.x,pointer.y);await page.mouse.down();await page.mouse.move(pointer.x-400,pointer.y,{steps:30});await page.mouse.up()
 await expect.poll(async()=>(await objectState('Rectangle 2')).parent).toBe('源画框')
 const dragged=await objectState('Rectangle 2');assert.equal(dragged.world.x,placed.world.x-400);assert.equal(dragged.world.y,placed.world.y)
 const finalScene=await snap()
 await page.keyboard.press('Control+z');await expect.poll(snap).toEqual(beforeDrag)
 await page.keyboard.press('Control+Shift+z');await expect.poll(snap).toEqual(finalScene)
 await page.getByRole('button',{name:'保存到本机',exact:true}).click();await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000})
 await closeTraced();await open();await startTrace();await page.getByRole('button',{name:'本机画布',exact:true}).click();await page.getByLabel('本机画布列表').getByRole('button',{name:new RegExp(`^${name} ·`)}).click();await expect.poll(snap).toEqual(finalScene)
 await expect(page.locator('[data-slot="title-font-loading"]')).toBeHidden({timeout:30000})
 if(process.env.OS_CANVAS_RESTORE_TRACE==='1') await page.waitForTimeout(1500) // Observe beyond the 1s autosave debounce with autosave disabled.
 result.finalDirty=await page.evaluate(()=>window.openPencil.getStore().hasUnsavedChanges())
 result.finalSaveStatus=await page.locator('[data-slot="local-save-status"]').innerText()
 await page.screenshot({path:resolve(out,'canvas-drag-restored.png')})
 assert.equal(result.finalDirty,false)
 result.checks.push('canvas pointer drag reparents back, changes world position, supports undo/redo and second fresh reopen')
 assert.deepEqual(result.errors,[]);result.status='passed' 
}catch(e){result.status='failed';result.error=e.stack;await page?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});throw e}finally{if(process.env.OS_CANVAS_RESTORE_TRACE==='1'&&page&&!page.isClosed()){result.traces??=[];result.traces.push(await page.evaluate(()=>window.restoreTrace).catch(()=>null))}await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2));await browser?.close()}
