import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const {chromium,expect}=createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const out=resolve(process.env.OS_CANVAS_EVIDENCE_DIR??'output/dev-evidence/canvas-c06/constraints'),base=process.env.OS_CANVAS_TEST_URL??'http://localhost:24650'
await mkdir(out,{recursive:true})
const name=`C06 booleans ${Date.now()}`,result={name,base,checks:[],errors:[]};let browser,page
async function open(){browser=await chromium.launch({channel:'msedge'});page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>result.errors.push(e.message));page.on('response',async r=>{if(r.request().method()==='POST'&&r.url().includes('/canvases/')){try{(result.saves??=[]).push(await r.json())}catch{}}});await page.goto(`${base}/?test&os-canvas&no-rulers`);await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({timeout:60000});await page.locator('#loader').waitFor({state:'detached'})}
async function snap(){return page.evaluate(()=>{const s=window.openPencil.getStore();const visit=id=>s.graph.getChildren(id).map(n=>({type:n.type,name:n.name,booleanOperation:n.booleanOperation,horizontalConstraint:n.horizontalConstraint,verticalConstraint:n.verticalConstraint,visible:n.visible,locked:n.locked,clipsContent:n.clipsContent,layoutMode:n.layoutMode,layoutWrap:n.layoutWrap,gridTemplateColumns:n.gridTemplateColumns,gridTemplateRows:n.gridTemplateRows,gridColumnGap:n.gridColumnGap,gridRowGap:n.gridRowGap,gridPosition:n.gridPosition,itemSpacing:n.itemSpacing,paddingLeft:n.paddingLeft,paddingRight:n.paddingRight,paddingTop:n.paddingTop,paddingBottom:n.paddingBottom,primaryAxisSizing:n.primaryAxisSizing,counterAxisSizing:n.counterAxisSizing,layoutSizingHorizontal:n.layoutSizingHorizontal,x:n.x,y:n.y,width:n.width,height:n.height,children:visit(n.id)}));return visit(s.state.currentPageId)})}
async function draw(key,x,y,w,h){await page.keyboard.press(key);await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+w,y+h,{steps:12});await page.mouse.up();await page.keyboard.press('Escape')}
async function rename(oldName,newName){const layers=page.locator('[data-test-id="layers-scroll"]');await layers.getByText(oldName,{exact:true}).dblclick();const input=layers.locator('input:visible');await input.fill(newName);await input.press('Enter')}

async function selectName(name){await page.evaluate(name=>{const s=window.openPencil.getStore();const n=[...s.graph.nodes.values()].find(n=>n.name===name);if(!n)throw Error(name);s.select([n.id])},name)}
async function size(prop,value){await page.locator('[data-property="'+prop+'"]').focus();await page.locator('input:focus').fill(String(value));await page.keyboard.press('Enter')}


try{
 await open()
 await page.evaluate(name=>{const s=window.openPencil.getStore();s.state.autosaveEnabled=false;s.state.documentName=name;window.pairs=[];for(let i=0;i<4;i++){const ids=[];for(let j=0;j<2;j++){const n=s.graph.createNode('RECTANGLE',s.state.currentPageId,{name:'Shape '+i+' '+j,x:330+i*180+j*50,y:300+j*50,width:100,height:100,fills:[{type:'SOLID',color:{r:0.8,g:0.4,b:0.2,a:1},opacity:1,visible:true}]});ids.push(n.id)}window.pairs.push(ids)}s.select(window.pairs[0]);s.requestRender()},name)
 await page.getByRole('button',{name:'属性面板',exact:true}).click()
 const canvas=page.locator('[data-test-id="canvas-element"]')
 for(const [i,op] of ['Union','Subtract','Intersect','Exclude'].entries()){
  await page.evaluate(i=>window.openPencil.getStore().select(window.pairs[i]),i)
  const before=await snap()
  if(process.env.OS_CANVAS_BOOLEAN_KEYS==='1'){
   await canvas.focus();await page.keyboard.press('Alt+Shift+'+({Union:'u',Subtract:'s',Intersect:'i',Exclude:'e'}[op]))
  }else{
   await page.locator('[data-test-id="boolean-operations-trigger"]').click()
   await page.locator('[data-test-id="boolean-operation-boolean'+op+'"]').click()
  }
  await expect.poll(async()=>(await snap()).filter(n=>n.type==='BOOLEAN_OPERATION').length).toBe(i+1)
  const after=await snap(),group=after.find(n=>n.type==='BOOLEAN_OPERATION'&&n.booleanOperation===op.toUpperCase())
  assert.ok(group);assert.equal(group.children.length,2)
  await canvas.focus();await page.keyboard.press('Control+z');await expect.poll(snap).toEqual(before)
  await page.keyboard.press('Control+Shift+z');await expect.poll(snap).toEqual(after)
  result.checks.push(op+' actual operation creates non-destructive group retaining two operands; undo/redo exact')
 }
 await page.evaluate(()=>window.openPencil.getStore().select([]))
 await page.screenshot({path:resolve(out,'operations.png')})
 result.input=process.env.OS_CANVAS_BOOLEAN_KEYS==='1'?'keyboard shortcuts':'menus'
 const scene=await snap()
 await page.getByRole('button',{name:'资产面板',exact:true}).click();await page.getByRole('button',{name:'保存到本机',exact:true}).click();await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000})
 await browser.close();await open();await page.getByRole('button',{name:'本机画布',exact:true}).click();await page.getByLabel('本机画布列表').getByRole('button',{name:new RegExp('^'+name+' ·')}).click();await expect.poll(snap).toEqual(scene)
 await page.screenshot({path:resolve(out,'restored.png')})
 result.checks.push('four operation types and operand trees persist across actual save and fresh browser')

 await page.locator('[data-test-id="layers-scroll"]').getByText('Union',{exact:true}).click()
 await page.getByRole('button',{name:'属性面板',exact:true}).click()
 if(process.env.OS_CANVAS_BOOLEAN_KEYS==='1'){
  await page.locator('[data-test-id="canvas-element"]').focus();await page.keyboard.press('Alt+Shift+f')
 }else{
  await page.getByRole('menuitem',{name:'对象',exact:true}).click()
  await page.getByRole('menuitem',{name:/扁平化/}).click()
 }
 await expect.poll(async()=>(await snap())[0].type).toBe('VECTOR')
 const flattened=await snap()
 await expect.poll(()=>page.evaluate(()=>{const s=window.openPencil.getStore();return s.graph.getChildren(s.state.currentPageId)[0].vectorNetwork?.vertices.length??0})).toBeGreaterThan(0)
 await page.locator('[data-test-id="canvas-element"]').focus();await page.keyboard.press('Control+z');await expect.poll(snap).toEqual(scene)
 await page.keyboard.press('Control+Shift+z');await expect.poll(snap).toEqual(flattened)
 await page.getByRole('button',{name:'资产面板',exact:true}).click();await page.getByRole('button',{name:'保存到本机',exact:true}).click();await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000})
 await browser.close();await open();await page.getByRole('button',{name:'本机画布',exact:true}).click();await page.getByLabel('本机画布列表').getByRole('button',{name:new RegExp('^'+name+' ·')}).click();await expect.poll(snap).toEqual(flattened)
 await expect.poll(()=>page.evaluate(()=>{const s=window.openPencil.getStore();return s.graph.getChildren(s.state.currentPageId)[0].vectorNetwork?.vertices.length??0})).toBeGreaterThan(0)
 await page.screenshot({path:resolve(out,'flattened-restored.png')})
 result.checks.push('real flatten action creates nonempty vector, undo restores boolean operands, redo and second save/reopen preserve vector')
 assert.deepEqual(result.errors,[]);result.status='passed'
}catch(e){result.status='failed';result.error=e.stack;await page?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});throw e}finally{await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2));await browser?.close()}
