import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const {chromium,expect}=createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const out=resolve(process.env.OS_CANVAS_EVIDENCE_DIR??'output/dev-evidence/canvas-c06/variables'),base=process.env.OS_CANVAS_TEST_URL??'http://localhost:24650'
await mkdir(out,{recursive:true})
const name=`C06 variables ${Date.now()}`,result={name,base,checks:[],errors:[]};let browser,page
async function open(){browser=await chromium.launch({channel:'msedge'});page=await browser.newPage({viewport:{width:1440,height:900}});page.on('console',m=>{if(m.type()==='error')(result.consoleErrors??=[]).push(m.text())});page.on('pageerror',e=>result.errors.push(e.message));page.on('response',async r=>{if(r.request().method()==='POST'&&r.url().includes('/canvases/')){try{(result.saves??=[]).push(await r.json())}catch{}}});await page.goto(`${base}/?test&os-canvas&no-rulers`);await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({timeout:60000});await page.locator('#loader').waitFor({state:'detached'})}
async function snap(){return page.evaluate(()=>{const s=window.openPencil.getStore();const visit=id=>s.graph.getChildren(id).map(n=>({type:n.type,name:n.name,componentName:n.type==='INSTANCE'&&n.componentId?s.graph.getNode(n.componentId)?.name:null,horizontalConstraint:n.horizontalConstraint,verticalConstraint:n.verticalConstraint,visible:n.visible,locked:n.locked,clipsContent:n.clipsContent,layoutMode:n.layoutMode,layoutWrap:n.layoutWrap,gridTemplateColumns:n.gridTemplateColumns,gridTemplateRows:n.gridTemplateRows,gridColumnGap:n.gridColumnGap,gridRowGap:n.gridRowGap,gridPosition:n.gridPosition,itemSpacing:n.itemSpacing,paddingLeft:n.paddingLeft,paddingRight:n.paddingRight,paddingTop:n.paddingTop,paddingBottom:n.paddingBottom,primaryAxisSizing:n.primaryAxisSizing,counterAxisSizing:n.counterAxisSizing,layoutSizingHorizontal:n.layoutSizingHorizontal,x:n.x,y:n.y,width:n.width,height:n.height,children:visit(n.id)}));return visit(s.state.currentPageId)})}
async function draw(key,x,y,w,h){await page.keyboard.press(key);await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+w,y+h,{steps:12});await page.mouse.up();await page.keyboard.press('Escape')}
async function rename(oldName,newName){const layers=page.locator('[data-test-id="layers-scroll"]');await layers.getByText(oldName,{exact:true}).dblclick();const input=layers.locator('input:visible');await input.fill(newName);await input.press('Enter')}

async function selectName(name){await page.evaluate(name=>{const s=window.openPencil.getStore();const n=[...s.graph.nodes.values()].find(n=>n.name===name);if(!n)throw Error(name);s.select([n.id])},name)}
async function size(prop,value){await page.locator('[data-property="'+prop+'"]').focus();await page.locator('input:focus').fill(String(value));await page.keyboard.press('Enter')}


async function tokens(){return page.evaluate(()=>{const s=window.openPencil.getStore();return [...s.graph.variableCollections.values()].map(c=>({name:c.name,modes:c.modes.map(m=>m.name),variables:c.variableIds.map(id=>s.graph.variables.get(id)).filter(Boolean).map(v=>({name:v.name,type:v.type,values:c.modes.map(m=>v.valuesByMode[m.modeId])}))}))})}
try{
 await open();await page.evaluate(name=>{const s=window.openPencil.getStore();s.state.documentName=name;s.state.autosaveEnabled=false},name)
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
 const saved=await tokens();result.tokens=saved
 await page.keyboard.press('Control+z');await expect.poll(async()=>(await tokens())[0].variables[0].values).toEqual([0])
 await page.keyboard.press('Control+Shift+z');await expect.poll(tokens).toEqual(saved)
 for(const value of ['-2.5','0','24']){
  const field=page.locator('[data-test-id="token-inspector"] input[type="number"]')
  await field.fill(value);await field.press('Enter')
  await expect.poll(async()=>(await tokens())[0].variables[0].values).toEqual([Number(value)])
 }
 const field=page.locator('[data-test-id="token-inspector"] input[type="number"]')
 await field.fill('');await field.press('Enter');await expect(field).toHaveValue('24');await expect.poll(tokens).toEqual(saved)
 result.checks.push('numeric edits undo/redo; negative decimals and zero commit; empty value restores stored value')
 result.checks.push('actual UI creates collection and number variable, renames and changes value')
 await page.keyboard.press('Escape')
 await page.getByRole('button',{name:'资产面板',exact:true}).click();await page.getByRole('button',{name:'保存到本机',exact:true}).click();await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000})
 await browser.close();await open();await page.getByRole('button',{name:'本机画布',exact:true}).click();await page.getByLabel('本机画布列表').getByRole('button',{name:new RegExp('^'+name+' ·')}).click();await expect.poll(tokens).toEqual(saved)
 await page.getByRole('button',{name:'属性面板',exact:true}).click();await page.getByRole('button',{name:'打开变量',exact:true}).click()
 await expect(page.locator('[data-test-id="variable-row"]')).toContainText('spacing-base')
 await page.locator('[data-test-id="variable-row"]').click();await expect(page.locator('[data-test-id="token-inspector"] input[type="number"]')).toHaveValue('24')
 result.checks.push('fresh browser reload restores collection, variable name/type/value and editable inspector')
 await page.screenshot({path:resolve(out,'restored.png')})
 assert.deepEqual(result.errors,[]);assert.deepEqual(result.consoleErrors??[],[]);result.status='passed'
}catch(e){result.status='failed';result.error=e.stack;await page?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});throw e}finally{await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2));await browser?.close()}
