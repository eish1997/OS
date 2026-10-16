import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const {chromium,expect}=createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const out=resolve(process.env.OS_CANVAS_EVIDENCE_DIR??'output/dev-evidence/canvas-c06/variable-binding'),base=process.env.OS_CANVAS_TEST_URL??'http://localhost:24650'
await mkdir(out,{recursive:true})
const name=`C06 variable binding ${Date.now()}`,result={name,base,checks:[],errors:[]};let browser,page
async function open(){browser=await chromium.launch({channel:'msedge'});page=await browser.newPage({viewport:{width:1440,height:900}});page.on('console',m=>{if(m.type()==='error')(result.consoleErrors??=[]).push(m.text())});page.on('pageerror',e=>result.errors.push(e.message));page.on('response',async r=>{if(r.request().method()==='POST'&&r.url().includes('/canvases/')){try{(result.saves??=[]).push(await r.json())}catch{}}});await page.goto(`${base}/?test&os-canvas&no-rulers`);await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({timeout:60000});await page.locator('#loader').waitFor({state:'detached'})}
async function snap(){return page.evaluate(()=>{const s=window.openPencil.getStore();const visit=id=>s.graph.getChildren(id).map(n=>({type:n.type,name:n.name,componentName:n.type==='INSTANCE'&&n.componentId?s.graph.getNode(n.componentId)?.name:null,horizontalConstraint:n.horizontalConstraint,verticalConstraint:n.verticalConstraint,visible:n.visible,locked:n.locked,clipsContent:n.clipsContent,layoutMode:n.layoutMode,layoutWrap:n.layoutWrap,gridTemplateColumns:n.gridTemplateColumns,gridTemplateRows:n.gridTemplateRows,gridColumnGap:n.gridColumnGap,gridRowGap:n.gridRowGap,gridPosition:n.gridPosition,itemSpacing:n.itemSpacing,paddingLeft:n.paddingLeft,paddingRight:n.paddingRight,paddingTop:n.paddingTop,paddingBottom:n.paddingBottom,primaryAxisSizing:n.primaryAxisSizing,counterAxisSizing:n.counterAxisSizing,layoutSizingHorizontal:n.layoutSizingHorizontal,x:n.x,y:n.y,width:n.width,height:n.height,children:visit(n.id)}));return visit(s.state.currentPageId)})}
async function draw(key,x,y,w,h){await page.keyboard.press(key);await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+w,y+h,{steps:12});await page.mouse.up();await page.keyboard.press('Escape')}
async function rename(oldName,newName){const layers=page.locator('[data-test-id="layers-scroll"]');await layers.getByText(oldName,{exact:true}).dblclick();const input=layers.locator('input:visible');await input.fill(newName);await input.press('Enter')}

async function selectName(name){await page.evaluate(name=>{const s=window.openPencil.getStore();const n=[...s.graph.nodes.values()].find(n=>n.name===name);if(!n)throw Error(name);s.select([n.id])},name)}
async function size(prop,value){await page.locator('[data-property="'+prop+'"]').focus();await page.locator('input:focus').fill(String(value));await page.keyboard.press('Enter')}


async function tokens(){return page.evaluate(()=>{const s=window.openPencil.getStore();return [...s.graph.variableCollections.values()].map(c=>({name:c.name,modes:c.modes.map(m=>m.name),variables:c.variableIds.map(id=>s.graph.variables.get(id)).filter(Boolean).map(v=>({name:v.name,type:v.type,values:c.modes.map(m=>v.valuesByMode[m.modeId])}))}))})}
try{
 await open();await page.evaluate(name=>{const s=window.openPencil.getStore();s.state.documentName=name;s.state.autosaveEnabled=false},name)
 await page.locator('[data-test-id="canvas-element"]').focus();await draw('r',400,300,120,80);await expect.poll(async()=>(await snap()).length).toBe(1)
 await page.getByRole('button',{name:'属性面板',exact:true}).click()
 await page.getByRole('button',{name:'打开变量',exact:true}).click()
 await page.locator('[data-test-id="variables-create-collection"]').click()
 await page.locator('[data-test-id="variables-add-variable"]').click()
 await page.locator('[data-test-id="variables-add-float"]').click()
 await page.locator('[data-test-id="variable-row"]').click()
 const inspector=page.locator('[data-test-id="token-inspector"]')
 await inspector.locator('input').first().fill('spacing-base');await inspector.locator('input').first().press('Enter')
 await expect.poll(async()=>(await tokens())[0].variables[0].name).toBe('spacing-base')
 await inspector.locator('input[type="number"]').fill('24');await inspector.locator('input[type="number"]').press('Enter')
 await expect.poll(async()=>(await tokens())[0].variables).toEqual([{name:'spacing-base',type:'FLOAT',values:[24]}])

 await page.keyboard.press('Escape')
 await page.locator('[data-test-id="canvas-element"]').focus();await page.locator('[data-test-id="variables-dialog"]').waitFor({state:'hidden'});await page.mouse.click(450,340)
 await page.locator('[data-property="width"]').getByRole('button',{name:'应用变量',exact:true}).click()
 await page.getByRole('option',{name:'spacing-base',exact:true}).click()
 await expect.poll(async()=>(await snap())[0].width).toBe(24)
 async function bound(){return page.evaluate(()=>{const s=window.openPencil.getStore();const n=s.graph.getChildren(s.state.currentPageId)[0];return {width:n.width,height:n.height,bindings:Object.fromEntries(Object.entries(n.boundVariables).map(([k,v])=>[k,s.graph.variables.get(v)?.name??v]))}})}
 result.initialBound=await bound()
 async function edit(value){
  await page.evaluate(()=>window.openPencil.getStore().select([]))
  await page.getByRole('button',{name:'打开变量',exact:true}).click();await page.locator('[data-test-id="variable-row"]').click()
  const field=page.locator('[data-test-id="token-inspector"] input[type="number"]');await field.fill(String(value));await field.press('Enter');await page.keyboard.press('Escape');await page.locator('[data-test-id="variables-dialog"]').waitFor({state:'hidden'})
 }
 await edit(180);await expect.poll(async()=>(await snap())[0].width).toBe(180)
 const linked=await bound();assert.ok(Object.keys(linked.bindings).length)
 await page.locator('[data-test-id="canvas-element"]').focus();await page.keyboard.press('Control+z');await expect.poll(async()=>(await snap())[0].width).toBe(24)
 await page.keyboard.press('Control+Shift+z');await expect.poll(bound).toEqual(linked)
 result.checks.push('real rectangle drawing and width-variable picker; variable changes resize object; undo/redo updates geometry')
 const saved=await tokens()
 await page.getByRole('button',{name:'资产面板',exact:true}).click();await page.getByRole('button',{name:'保存到本机',exact:true}).click();await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000})
 await browser.close();await open();await page.getByRole('button',{name:'本机画布',exact:true}).click();await page.getByLabel('本机画布列表').getByRole('button',{name:new RegExp('^'+name+' ·')}).click();await expect.poll(tokens).toEqual(saved);await expect.poll(bound).toEqual(linked)
 await page.getByRole('button',{name:'属性面板',exact:true}).click();await edit(240);await expect.poll(async()=>(await snap())[0].width).toBe(240)
 await page.evaluate(()=>{const s=window.openPencil.getStore();s.select([s.graph.getChildren(s.state.currentPageId)[0].id])})
 await page.locator('[data-property="width"]').getByRole('button',{name:'应用变量',exact:true}).click();await page.getByRole('button',{name:'解除变量绑定',exact:true}).click()
 await expect.poll(async()=>(await bound()).bindings).toEqual({});await expect.poll(async()=>(await snap())[0].width).toBe(240)
 await page.locator('[data-test-id="canvas-element"]').focus();await page.keyboard.press('Control+z');await expect.poll(async()=>Object.keys((await bound()).bindings).length).toBe(1)
 await page.keyboard.press('Control+Shift+z');await expect.poll(async()=>(await bound()).bindings).toEqual({})
 await edit(300);await expect.poll(async()=>(await snap())[0].width).toBe(240)
 result.checks.push('binding persists across fresh browser and responds to further edits; detach preserves value, undo/redo restores/removes binding, subsequent token edits leave detached shape unchanged')

 const detached=await bound(),detachedTokens=await tokens()
 await page.getByRole('button',{name:'资产面板',exact:true}).click();await page.getByRole('button',{name:'保存到本机',exact:true}).click();await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000})
 await browser.close();await open();await page.getByRole('button',{name:'本机画布',exact:true}).click();await page.getByLabel('本机画布列表').getByRole('button',{name:new RegExp('^'+name+' ·')}).click();await expect.poll(tokens).toEqual(detachedTokens);await expect.poll(bound).toEqual(detached)
 await page.getByRole('button',{name:'属性面板',exact:true}).click();await edit(360);await expect.poll(async()=>(await snap())[0].width).toBe(240)
 await page.evaluate(()=>{const s=window.openPencil.getStore();s.select([s.graph.getChildren(s.state.currentPageId)[0].id])})
 result.checks.push('detached binding stays absent after a second disk roundtrip; further variable edit still leaves width unchanged')
 await page.screenshot({path:resolve(out,'restored.png')})
 assert.deepEqual(result.errors,[]);assert.deepEqual(result.consoleErrors??[],[]);result.status='passed'
}catch(e){result.status='failed';result.error=e.stack;await page?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});throw e}finally{await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2));await browser?.close()}
