import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const {chromium,expect}=createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const out=resolve(process.env.OS_CANVAS_EVIDENCE_DIR??'output/dev-evidence/canvas-c06/style-pages'),base=process.env.OS_CANVAS_TEST_URL??'http://localhost:24650'
await mkdir(out,{recursive:true})
const name=`C06 cross page styles ${Date.now()}`,result={name,base,checks:[],errors:[]};let browser,page
async function open(){browser=await chromium.launch({channel:'msedge'});page=await browser.newPage({viewport:{width:1440,height:900}});page.on('console',m=>{if(m.type()==='error')(result.consoleErrors??=[]).push(m.text())});page.on('pageerror',e=>result.errors.push(e.message));page.on('response',async r=>{if(r.request().method()==='POST'&&r.url().includes('/canvases/')){try{(result.saves??=[]).push(await r.json())}catch{}}});await page.goto(`${base}/?test&os-canvas&no-rulers`);await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({timeout:60000});await page.locator('#loader').waitFor({state:'detached'})}
async function snap(){return page.evaluate(()=>{const s=window.openPencil.getStore();const visit=id=>s.graph.getChildren(id).map(n=>({type:n.type,name:n.name,componentName:n.type==='INSTANCE'&&n.componentId?s.graph.getNode(n.componentId)?.name:null,horizontalConstraint:n.horizontalConstraint,verticalConstraint:n.verticalConstraint,visible:n.visible,locked:n.locked,clipsContent:n.clipsContent,layoutMode:n.layoutMode,layoutWrap:n.layoutWrap,gridTemplateColumns:n.gridTemplateColumns,gridTemplateRows:n.gridTemplateRows,gridColumnGap:n.gridColumnGap,gridRowGap:n.gridRowGap,gridPosition:n.gridPosition,itemSpacing:n.itemSpacing,paddingLeft:n.paddingLeft,paddingRight:n.paddingRight,paddingTop:n.paddingTop,paddingBottom:n.paddingBottom,primaryAxisSizing:n.primaryAxisSizing,counterAxisSizing:n.counterAxisSizing,layoutSizingHorizontal:n.layoutSizingHorizontal,x:n.x,y:n.y,width:n.width,height:n.height,children:visit(n.id)}));return visit(s.state.currentPageId)})}
async function draw(key,x,y,w,h){await page.keyboard.press(key);await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+w,y+h,{steps:12});await page.mouse.up();await page.keyboard.press('Escape')}
async function rename(oldName,newName){const layers=page.locator('[data-test-id="layers-scroll"]');await layers.getByText(oldName,{exact:true}).dblclick();const input=layers.locator('input:visible');await input.fill(newName);await input.press('Enter')}

async function selectName(name){await page.evaluate(name=>{const s=window.openPencil.getStore();const n=[...s.graph.nodes.values()].find(n=>n.name===name);if(!n)throw Error(name);s.select([n.id])},name)}
async function size(prop,value){await page.locator('[data-property="'+prop+'"]').focus();await page.locator('input:focus').fill(String(value));await page.keyboard.press('Enter')}


async function state(){
 return page.evaluate(()=>{
  const s=window.openPencil.getStore(),all=[...s.graph.nodes.values()]
  const reference=id=>all.find(n=>n.sharedStyleType&&n.source.id===id)?.name??id
  const color=c=>Object.fromEntries(Object.entries(c).map(([k,v])=>[k,Math.fround(v)]))
  const fills=n=>n.fills.map(f=>({type:f.type,color:color(f.color),opacity:f.opacity,visible:f.visible}))
  return {
   definitions:all.filter(n=>n.sharedStyleType).map(n=>({name:n.name,type:n.sharedStyleType,fills:fills(n)})),
   pages:s.graph.getPages().map(p=>({name:p.name,nodes:s.graph.getChildren(p.id).filter(n=>!n.internalOnly).map(n=>({name:n.name,fillStyle:reference(n.fillStyleId),strokeStyle:reference(n.strokeStyleId),fills:fills(n),strokes:n.strokes.map(f=>({color:color(f.color),weight:f.weight,align:f.align,opacity:f.opacity,visible:f.visible}))}))}))
  }
 })
}
async function switchTo(name){await page.evaluate(async name=>{const s=window.openPencil.getStore();await s.switchPage(s.graph.getPages().find(p=>p.name===name).id)},name)}
async function choose(kind,label){await page.getByRole('combobox',{name:kind+'样式',exact:true}).click();await page.getByRole('option',{name:label,exact:true}).click()}
async function edit(hex){await page.evaluate(()=>window.openPencil.getStore().select([]));const panel=page.locator('[data-test-id="shared-styles-editor"]');await panel.getByRole('textbox',{name:'样式颜色',exact:true}).fill(hex);await panel.getByRole('button',{name:'保存样式修改',exact:true}).click()}
async function colors(){const {pages}=await state();return {fill:pages[0].nodes.find(n=>n.name==='Source').fills[0].color,stroke:pages[1].nodes[0].strokes[0].color,weight:pages[1].nodes[0].strokes[0].weight,align:pages[1].nodes[0].strokes[0].align}}
try{
 await open();await page.evaluate(name=>{const s=window.openPencil.getStore();s.state.documentName=name;s.state.autosaveEnabled=false;const source=s.graph.createNode('RECTANGLE',s.state.currentPageId,{name:'Source',x:350,y:250,width:200,height:120,fills:[{type:'SOLID',color:{r:1,g:0,b:0,a:1},opacity:1,visible:true}]});const second=s.graph.addPage('Other page');s.graph.createNode('RECTANGLE',second.id,{name:'Stroke target',x:350,y:250,width:200,height:120,fills:[],strokes:[{type:'SOLID',color:{r:0,g:0,b:0,a:1},opacity:1,visible:true,weight:7,align:'INSIDE'}]});s.select([source.id]);s.requestRender()},name)
 await page.getByRole('button',{name:'属性面板',exact:true}).click();await choose('填充','从当前对象创建样式')
 await switchTo('Other page');await selectName('Stroke target');await choose('描边','Source / fill')
 await expect.poll(colors).toEqual({fill:{r:1,g:0,b:0,a:1},stroke:{r:1,g:0,b:0,a:1},weight:7,align:'INSIDE'})
 const before=await state();await edit('0000FF')
 await expect.poll(colors).toEqual({fill:{r:0,g:0,b:1,a:1},stroke:{r:0,g:0,b:1,a:1},weight:7,align:'INSIDE'})
 const blue=await state()
 await page.locator('[data-test-id="canvas-element"]').focus();await page.keyboard.press('Control+z');await expect.poll(state).toEqual(before)
 await page.keyboard.press('Control+Shift+z');await expect.poll(state).toEqual(blue)
 result.checks.push('API two-page fixtures; actual fill creation/stroke binding; editing definition from other page updates source fill and remote stroke, preserves stroke geometry; undo/redo covers both pages')
 await page.getByRole('button',{name:'资产面板',exact:true}).click();await page.getByRole('button',{name:'保存到本机',exact:true}).click();await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000})
 await browser.close();await open();await page.getByRole('button',{name:'本机画布',exact:true}).click();await page.getByLabel('本机画布列表').getByRole('button',{name:new RegExp('^'+name+' ·')}).click();await expect.poll(state).toEqual(blue)
 await switchTo('Other page');await page.getByRole('button',{name:'属性面板',exact:true}).click();await edit('00FF00')
 await expect.poll(colors).toEqual({fill:{r:0,g:1,b:0,a:1},stroke:{r:0,g:1,b:0,a:1},weight:7,align:'INSIDE'})
 await selectName('Stroke target');await choose('描边','无')
 const detached=await state();assert.equal(detached.pages[1].nodes[0].strokeStyle,null)
 await edit('FF0000');await expect.poll(colors).toEqual({fill:{r:1,g:0,b:0,a:1},stroke:{r:0,g:1,b:0,a:1},weight:7,align:'INSIDE'})
 result.checks.push('disk reload preserves cross-page fill/stroke references; further edit updates both; explicit stroke detach preserves color/weight/alignment and stops later propagation')
 const final=await state()
 await page.getByRole('button',{name:'资产面板',exact:true}).click();await page.getByRole('button',{name:'保存到本机',exact:true}).click();await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000})
 await browser.close();await open();await page.getByRole('button',{name:'本机画布',exact:true}).click();await page.getByLabel('本机画布列表').getByRole('button',{name:new RegExp('^'+name+' ·')}).click();await expect.poll(state).toEqual(final)
 await switchTo('Other page');await page.getByRole('button',{name:'属性面板',exact:true}).click();await edit('0000FF')
 await expect.poll(colors).toEqual({fill:{r:0,g:0,b:1,a:1},stroke:{r:0,g:1,b:0,a:1},weight:7,align:'INSIDE'})
 result.checks.push('second save/reopen preserves detached remote stroke while original page continues following definition')
 await page.screenshot({path:resolve(out,'restored.png')})
 assert.deepEqual(result.errors,[]);assert.deepEqual(result.consoleErrors??[],[]);result.status='passed'
}catch(e){result.status='failed';result.error=e.stack;await page?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});throw e}finally{await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2));await browser?.close()}
