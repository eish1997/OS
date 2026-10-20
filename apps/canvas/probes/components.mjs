import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const {chromium,expect}=createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const out=resolve(process.env.OS_CANVAS_EVIDENCE_DIR??'output/dev-evidence/canvas-c06/constraints'),base=process.env.OS_CANVAS_TEST_URL??'http://localhost:24650'
await mkdir(out,{recursive:true})
const name=`C06 components ${Date.now()}`,result={name,base,checks:[],errors:[]};let browser,page
async function open(){browser=await chromium.launch({channel:'msedge'});page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>result.errors.push(e.message));page.on('response',async r=>{if(r.request().method()==='POST'&&r.url().includes('/canvases/')){try{(result.saves??=[]).push(await r.json())}catch{}}});await page.goto(`${base}/?test&os-canvas&no-rulers`);await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({timeout:60000});await page.locator('#loader').waitFor({state:'detached'})}
async function snap(){return page.evaluate(()=>{const s=window.openPencil.getStore();const visit=id=>s.graph.getChildren(id).map(n=>({type:n.type,name:n.name,componentName:n.type==='INSTANCE'&&n.componentId?s.graph.getNode(n.componentId)?.name:null,horizontalConstraint:n.horizontalConstraint,verticalConstraint:n.verticalConstraint,visible:n.visible,locked:n.locked,clipsContent:n.clipsContent,layoutMode:n.layoutMode,layoutWrap:n.layoutWrap,gridTemplateColumns:n.gridTemplateColumns,gridTemplateRows:n.gridTemplateRows,gridColumnGap:n.gridColumnGap,gridRowGap:n.gridRowGap,gridPosition:n.gridPosition,itemSpacing:n.itemSpacing,paddingLeft:n.paddingLeft,paddingRight:n.paddingRight,paddingTop:n.paddingTop,paddingBottom:n.paddingBottom,primaryAxisSizing:n.primaryAxisSizing,counterAxisSizing:n.counterAxisSizing,layoutSizingHorizontal:n.layoutSizingHorizontal,x:n.x,y:n.y,width:n.width,height:n.height,children:visit(n.id)}));return visit(s.state.currentPageId)})}
async function draw(key,x,y,w,h){await page.keyboard.press(key);await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+w,y+h,{steps:12});await page.mouse.up();await page.keyboard.press('Escape')}
async function rename(oldName,newName){const layers=page.locator('[data-test-id="layers-scroll"]');await layers.getByText(oldName,{exact:true}).dblclick();const input=layers.locator('input:visible');await input.fill(newName);await input.press('Enter')}

async function selectName(name){await page.evaluate(name=>{const s=window.openPencil.getStore();const n=[...s.graph.nodes.values()].find(n=>n.name===name);if(!n)throw Error(name);s.select([n.id])},name)}
async function size(prop,value){await page.locator('[data-property="'+prop+'"]').focus();await page.locator('input:focus').fill(String(value));await page.keyboard.press('Enter')}


try{
 await open();await page.evaluate(name=>{const s=window.openPencil.getStore();s.state.documentName=name;s.state.autosaveEnabled=false},name)
 const canvas=page.locator('[data-test-id="canvas-element"]');await canvas.focus()
 await draw('r',400,300,120,80)
 await page.mouse.click(450,340);await page.keyboard.press('Control+Alt+k')
 await expect.poll(async()=>(await snap())[0].type).toBe('COMPONENT')
 const component=await snap()
 await page.keyboard.press('Control+z');await expect.poll(async()=>(await snap())[0].type).toBe('RECTANGLE')
 await page.keyboard.press('Control+Shift+z');await expect.poll(snap).toEqual(component)
 await page.getByRole('menuitem',{name:'对象',exact:true}).click();await page.getByRole('menuitem',{name:/创建实例/}).click()
 await expect.poll(async()=>(await snap()).filter(n=>n.type==='INSTANCE').length).toBe(1)
 await page.getByRole('button',{name:'属性面板',exact:true}).click()
 await page.evaluate(()=>{const s=window.openPencil.getStore();const c=s.graph.getChildren(s.state.currentPageId).find(n=>n.type==='COMPONENT');s.select([s.graph.getChildren(c.id)[0].id])})
 const before=await snap()
 await size('width',180)
 await expect.poll(async()=>{const nodes=await snap();return nodes.filter(n=>['COMPONENT','INSTANCE'].includes(n.type)).map(n=>n.children[0].width)}).toEqual([180,180])
 const synced=await snap()
 await canvas.focus();await page.keyboard.press('Control+z');await expect.poll(snap).toEqual(before)
 await page.keyboard.press('Control+Shift+z');await expect.poll(snap).toEqual(synced)
 result.checks.push('real drawing, create-component shortcut and create-instance menu; definition child width edits propagate and undo/redo together')
 await page.getByRole('button',{name:'资产面板',exact:true}).click();await page.getByRole('button',{name:'保存到本机',exact:true}).click();await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000})
 await browser.close();await open();await page.getByRole('button',{name:'本机画布',exact:true}).click();await page.getByLabel('本机画布列表').getByRole('button',{name:new RegExp('^'+name+' ·')}).click();await expect.poll(snap).toEqual(synced)
 await page.evaluate(()=>{const s=window.openPencil.getStore();const c=s.graph.getChildren(s.state.currentPageId).find(n=>n.type==='COMPONENT');s.select([s.graph.getChildren(c.id)[0].id])})
 await page.getByRole('button',{name:'属性面板',exact:true}).click();await size('width',200)
 await expect.poll(async()=>(await snap()).filter(n=>['COMPONENT','INSTANCE'].includes(n.type)).map(n=>n.children[0].width)).toEqual([200,200])
 result.checks.push('fresh browser restores component link and editing definition still propagates to instance')

 await page.evaluate(()=>{const s=window.openPencil.getStore();s.select([s.graph.getChildren(s.state.currentPageId).find(n=>n.type==='INSTANCE').id])})

 if(process.env.OS_CANVAS_INSTANCE_OVERRIDE==='1'){
  await size('width',250)
  await expect.poll(async()=>(await snap()).find(n=>n.type==='INSTANCE').width).toBe(250)
  await page.evaluate(()=>{const s=window.openPencil.getStore();s.select([s.graph.getChildren(s.state.currentPageId).find(n=>n.type==='COMPONENT').id])})
  await size('width',300)
  await expect.poll(async()=>(await snap()).find(n=>n.type==='INSTANCE').width).toBe(250)
  const overrides=await snap()
  await page.getByRole('button',{name:'资产面板',exact:true}).click();await page.getByRole('button',{name:'保存到本机',exact:true}).click();await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000})
  await browser.close();await open();await page.getByRole('button',{name:'本机画布',exact:true}).click();await page.getByLabel('本机画布列表').getByRole('button',{name:new RegExp('^'+name+' ·')}).click();await expect.poll(snap).toEqual(overrides)
  await page.evaluate(()=>{const s=window.openPencil.getStore();s.select([s.graph.getChildren(s.state.currentPageId).find(n=>n.type==='COMPONENT').id])})
  await page.getByRole('button',{name:'属性面板',exact:true}).click();await size('width',320)
  await expect.poll(async()=>(await snap()).find(n=>n.type==='INSTANCE').width).toBe(250)
  result.checks.push('instance width override survives definition width change, disk roundtrip and another definition change')
  await page.evaluate(()=>{const s=window.openPencil.getStore();s.select([s.graph.getChildren(s.state.currentPageId).find(n=>n.type==='INSTANCE').id])})
 }

 if(process.env.OS_CANVAS_INSTANCE_RESET==='1'){
  const overridden=await snap()
  await page.getByRole('button',{name:'重置实例修改',exact:true}).click()
  await expect.poll(async()=>(await snap()).find(n=>n.type==='INSTANCE').width).toBe(320)
  const resetScene=await snap()
  const priorInstance=overridden.find(n=>n.type==='INSTANCE'),resetInstance=resetScene.find(n=>n.type==='INSTANCE')
  assert.deepEqual([resetInstance.x,resetInstance.y],[priorInstance.x,priorInstance.y])
  await page.locator('[data-test-id="canvas-element"]').focus();await page.keyboard.press('Control+z');await expect.poll(snap).toEqual(overridden)
  await page.keyboard.press('Control+Shift+z');await expect.poll(snap).toEqual(resetScene)
  await page.evaluate(()=>{const s=window.openPencil.getStore();s.select([s.graph.getChildren(s.state.currentPageId).find(n=>n.type==='COMPONENT').id])})
  await size('width',340)
  await expect.poll(async()=>(await snap()).find(n=>n.type==='INSTANCE').width).toBe(340)

  const resetSaved=await snap()
  await page.getByRole('button',{name:'资产面板',exact:true}).click();await page.getByRole('button',{name:'保存到本机',exact:true}).click();await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000})
  await browser.close();await open();await page.getByRole('button',{name:'本机画布',exact:true}).click();await page.getByLabel('本机画布列表').getByRole('button',{name:new RegExp('^'+name+' ·')}).click();await expect.poll(snap).toEqual(resetSaved)
  await page.evaluate(()=>{const s=window.openPencil.getStore();s.select([s.graph.getChildren(s.state.currentPageId).find(n=>n.type==='COMPONENT').id])})
  await page.getByRole('button',{name:'属性面板',exact:true}).click();await size('width',360)
  await expect.poll(async()=>(await snap()).find(n=>n.type==='INSTANCE').width).toBe(360)
  result.checks.push('real reset button restores main width, one-step undo restores override, redo resumes following later main edits')
  await page.evaluate(()=>{const s=window.openPencil.getStore();s.select([s.graph.getChildren(s.state.currentPageId).find(n=>n.type==='INSTANCE').id])})
 }
 const linked=await snap()
 await page.getByRole('menuitem',{name:'对象',exact:true}).click();await page.getByRole('menuitem',{name:/分离实例/}).click()
 await expect.poll(async()=>(await snap()).some(n=>n.type==='INSTANCE')).toBe(false)
 const detached=await snap();assert.ok(detached.some(n=>n.type==='FRAME'&&n.children.length===1))
 await page.locator('[data-test-id="canvas-element"]').focus();await page.keyboard.press('Control+z');await expect.poll(snap).toEqual(linked)
 await page.keyboard.press('Control+Shift+z');await expect.poll(snap).toEqual(detached)
 await page.getByRole('button',{name:'资产面板',exact:true}).click();await page.getByRole('button',{name:'保存到本机',exact:true}).click();await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000})
 await browser.close();await open();await page.getByRole('button',{name:'本机画布',exact:true}).click();await page.getByLabel('本机画布列表').getByRole('button',{name:new RegExp('^'+name+' ·')}).click();await expect.poll(snap).toEqual(detached)
 result.checks.push('real detach-instance menu preserves subtree; undo restores link; redo and second save keep detached frame')
 await page.screenshot({path:resolve(out,'restored.png')})
 assert.deepEqual(result.errors,[]);result.status='passed'
}catch(e){result.status='failed';result.error=e.stack;await page?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});throw e}finally{await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2));await browser?.close()}
