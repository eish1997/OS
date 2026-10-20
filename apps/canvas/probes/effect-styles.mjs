import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const {chromium,expect}=createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const out=resolve(process.env.OS_CANVAS_EVIDENCE_DIR??'output/dev-evidence/canvas-c06/effect-styles'),base=process.env.OS_CANVAS_TEST_URL??'http://localhost:24650'
await mkdir(out,{recursive:true})
const name=`C06 effect styles ${Date.now()}`,result={name,base,checks:[],errors:[]};let browser,page
async function open(){browser=await chromium.launch({channel:'msedge'});page=await browser.newPage({viewport:{width:1440,height:900}});page.on('console',m=>{if(m.type()==='error')(result.consoleErrors??=[]).push(m.text())});page.on('pageerror',e=>result.errors.push(e.message));page.on('response',async r=>{if(r.request().method()==='POST'&&r.url().includes('/canvases/')){try{(result.saves??=[]).push(await r.json())}catch{}}});await page.goto(`${base}/?test&os-canvas&no-rulers`);await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({timeout:60000});await page.locator('#loader').waitFor({state:'detached'})}
async function snap(){return page.evaluate(()=>{const s=window.openPencil.getStore();const visit=id=>s.graph.getChildren(id).map(n=>({type:n.type,name:n.name,componentName:n.type==='INSTANCE'&&n.componentId?s.graph.getNode(n.componentId)?.name:null,horizontalConstraint:n.horizontalConstraint,verticalConstraint:n.verticalConstraint,visible:n.visible,locked:n.locked,clipsContent:n.clipsContent,layoutMode:n.layoutMode,layoutWrap:n.layoutWrap,gridTemplateColumns:n.gridTemplateColumns,gridTemplateRows:n.gridTemplateRows,gridColumnGap:n.gridColumnGap,gridRowGap:n.gridRowGap,gridPosition:n.gridPosition,itemSpacing:n.itemSpacing,paddingLeft:n.paddingLeft,paddingRight:n.paddingRight,paddingTop:n.paddingTop,paddingBottom:n.paddingBottom,primaryAxisSizing:n.primaryAxisSizing,counterAxisSizing:n.counterAxisSizing,layoutSizingHorizontal:n.layoutSizingHorizontal,x:n.x,y:n.y,width:n.width,height:n.height,children:visit(n.id)}));return visit(s.state.currentPageId)})}
async function draw(key,x,y,w,h){await page.keyboard.press(key);await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+w,y+h,{steps:12});await page.mouse.up();await page.keyboard.press('Escape')}
async function rename(oldName,newName){const layers=page.locator('[data-test-id="layers-scroll"]');await layers.getByText(oldName,{exact:true}).dblclick();const input=layers.locator('input:visible');await input.fill(newName);await input.press('Enter')}

async function selectName(name){await page.evaluate(name=>{const s=window.openPencil.getStore();const n=[...s.graph.nodes.values()].find(n=>n.name===name);if(!n)throw Error(name);s.select([n.id])},name)}
async function size(prop,value){await page.locator('[data-property="'+prop+'"]').focus();await page.locator('input:focus').fill(String(value));await page.keyboard.press('Enter')}


async function tokens(){return page.evaluate(()=>{const s=window.openPencil.getStore();return [...s.graph.variableCollections.values()].map(c=>({name:c.name,modes:c.modes.map(m=>m.name),variables:c.variableIds.map(id=>s.graph.variables.get(id)).filter(Boolean).map(v=>({name:v.name,type:v.type,values:c.modes.map(m=>v.valuesByMode[m.modeId])}))}))})}
async function state(){return page.evaluate(()=>{const s=window.openPencil.getStore(),all=[...s.graph.nodes.values()];const fields=n=>({name:n.name,effects:n.effects.map(e=>({type:e.type,color:Object.fromEntries(Object.entries(e.color).map(([k,v])=>[k,Math.fround(v)])),offset:e.offset,radius:e.radius,spread:e.spread,visible:e.visible})),style:all.find(d=>d.sharedStyleType&&d.source.id===n.effectStyleId)?.name??n.effectStyleId});return {definitions:all.filter(n=>n.sharedStyleType==='EFFECT').map(fields),objects:s.graph.getChildren(s.state.currentPageId).filter(n=>!n.internalOnly).map(fields)}})}
async function choose(label){await page.getByRole('combobox',{name:'效果样式',exact:true}).click();await page.getByRole('option',{name:label,exact:true}).click()}
async function save(){await page.getByRole('button',{name:'保存样式修改',exact:true}).click()}
async function field(label,value){await page.getByRole('spinbutton',{name:'效果 1 '+label,exact:true}).fill(String(value))}
try{
 await open();await page.evaluate(name=>{const s=window.openPencil.getStore();s.state.documentName=name;s.state.autosaveEnabled=false;for(let i=0;i<2;i++)s.graph.createNode('RECTANGLE',s.state.currentPageId,{name:'Effect target '+i,x:350+i*300,y:250,width:200,height:120,fills:[{type:'SOLID',color:{r:1,g:1,b:1,a:1},opacity:1,visible:true}],effects:i?[]:[{type:'DROP_SHADOW',color:{r:0,g:0,b:0,a:0.25},offset:{x:0,y:4},radius:8,spread:0,visible:true}]});s.select([s.graph.getChildren(s.state.currentPageId)[0].id]);s.requestRender()},name)
 await page.getByRole('button',{name:'属性面板',exact:true}).click();await choose('从当前对象创建样式');await expect.poll(async()=>(await state()).definitions.length).toBe(1)
 const title=(await state()).definitions[0].name;await selectName('Effect target 1');await choose(title)
 await page.evaluate(()=>window.openPencil.getStore().select([]));const before=await state()
 await field('模糊',20);await field('水平偏移',-8);await field('垂直偏移',12);await field('扩展',3);await field('透明度 %',50)
 await page.getByRole('textbox',{name:'效果 1 颜色',exact:true}).fill('FF0000');await save()
 const expected=[{type:'DROP_SHADOW',color:{r:1,g:0,b:0,a:0.5},offset:{x:-8,y:12},radius:20,spread:3,visible:true}]
 await expect.poll(async()=>(await state()).objects.map(n=>n.effects)).toEqual([expected,expected]);const edited=await state()
 await page.locator('[data-test-id="canvas-element"]').focus();await page.keyboard.press('Control+z');await expect.poll(state).toEqual(before)
 await page.keyboard.press('Control+Shift+z');await expect.poll(state).toEqual(edited)
 await field('模糊',-1);await save();await expect(page.locator('[data-test-id="shared-styles-editor"] [role="alert"]')).toContainText('模糊不能');assert.deepEqual(await state(),edited);await field('模糊',20);await save()
 await page.getByRole('button',{name:'添加样式效果',exact:true}).click();await page.getByRole('combobox',{name:'效果 2 类型',exact:true}).click();await page.getByRole('option',{name:'内阴影',exact:true}).click();await save()
 await expect.poll(async()=>(await state()).objects.map(n=>n.effects.map(e=>e.type))).toEqual([['DROP_SHADOW','INNER_SHADOW'],['DROP_SHADOW','INNER_SHADOW']])
 await page.getByRole('checkbox',{name:'效果 2 可见',exact:true}).uncheck();await save();await expect.poll(async()=>(await state()).objects.map(n=>n.effects[1].visible)).toEqual([false,false])
 await page.getByRole('checkbox',{name:'效果 2 可见',exact:true}).check();await save();await expect.poll(async()=>(await state()).objects.map(n=>n.effects[1].visible)).toEqual([true,true])
 const two=await state();await page.getByRole('button',{name:'删除效果 1',exact:true}).click();await save();await expect.poll(async()=>(await state()).objects.map(n=>n.effects.length)).toEqual([1,1])
 await page.locator('[data-test-id="canvas-element"]').focus();await page.keyboard.press('Control+z');await expect.poll(state).toEqual(two)
 await save();await expect.poll(state).toEqual(two)
 result.checks.push('API rectangle fixtures; UI creates/applies effect style, edits shadow parameters, undo/redo, rejects negative blur; adds inner shadow, removes effect and undoes deletion')
 await page.getByRole('button',{name:'资产面板',exact:true}).click();await page.getByRole('button',{name:'保存到本机',exact:true}).click();await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000})
 await browser.close();await open();await page.getByRole('button',{name:'本机画布',exact:true}).click();await page.getByLabel('本机画布列表').getByRole('button',{name:new RegExp('^'+name+' ·')}).click();await expect.poll(state).toEqual(two)
 await page.getByRole('button',{name:'属性面板',exact:true}).click();await page.evaluate(()=>window.openPencil.getStore().select([]));await field('模糊',24);await save();await expect.poll(async()=>(await state()).objects.map(n=>n.effects[0].radius)).toEqual([24,24])
 result.checks.push('multi-effect definition and references persist in fresh browser, further radius edit propagates')
 await page.screenshot({path:resolve(out,'restored.png')})
 await page.getByRole('combobox',{name:'效果 2 类型',exact:true}).click();await page.getByRole('option',{name:'图层模糊',exact:true}).click();await save()
 await expect.poll(async()=>(await state()).objects.map(n=>n.effects[1].type)).toEqual(['LAYER_BLUR','LAYER_BLUR'])
 result.checks.push('visibility toggles and changing a shadow to layer blur update both references')
 await page.screenshot({path:resolve(out,'layer-blur.png')})
 assert.deepEqual(result.errors,[]);assert.deepEqual(result.consoleErrors??[],[]);result.status='passed'
}catch(e){result.status='failed';result.error=e.stack;await page?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});throw e}finally{await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2));await browser?.close()}
