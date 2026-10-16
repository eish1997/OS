import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const {chromium,expect}=createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const out=resolve(process.env.OS_CANVAS_EVIDENCE_DIR??'output/dev-evidence/canvas-c06/constraints'),base=process.env.OS_CANVAS_TEST_URL??'http://localhost:24650'
await mkdir(out,{recursive:true})
const name=`C06 snapping ${Date.now()}`,result={name,base,checks:[],errors:[]};let browser,page
async function open(){browser=await chromium.launch({channel:'msedge'});page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>result.errors.push(e.message));page.on('response',async r=>{if(r.request().method()==='POST'&&r.url().includes('/canvases/')){try{(result.saves??=[]).push(await r.json())}catch{}}});await page.goto(`${base}/?test&os-canvas&no-rulers`);await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({timeout:60000});await page.locator('#loader').waitFor({state:'detached'})}
async function snap(){return page.evaluate(()=>{const s=window.openPencil.getStore();const visit=id=>s.graph.getChildren(id).map(n=>({type:n.type,name:n.name,horizontalConstraint:n.horizontalConstraint,verticalConstraint:n.verticalConstraint,visible:n.visible,locked:n.locked,clipsContent:n.clipsContent,layoutMode:n.layoutMode,layoutWrap:n.layoutWrap,gridTemplateColumns:n.gridTemplateColumns,gridTemplateRows:n.gridTemplateRows,gridColumnGap:n.gridColumnGap,gridRowGap:n.gridRowGap,gridPosition:n.gridPosition,itemSpacing:n.itemSpacing,paddingLeft:n.paddingLeft,paddingRight:n.paddingRight,paddingTop:n.paddingTop,paddingBottom:n.paddingBottom,primaryAxisSizing:n.primaryAxisSizing,counterAxisSizing:n.counterAxisSizing,layoutSizingHorizontal:n.layoutSizingHorizontal,x:n.x,y:n.y,width:n.width,height:n.height,children:visit(n.id)}));return visit(s.state.currentPageId)})}
async function draw(key,x,y,w,h){await page.keyboard.press(key);await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+w,y+h,{steps:12});await page.mouse.up();await page.keyboard.press('Escape')}
async function rename(oldName,newName){const layers=page.locator('[data-test-id="layers-scroll"]');await layers.getByText(oldName,{exact:true}).dblclick();const input=layers.locator('input:visible');await input.fill(newName);await input.press('Enter')}

async function selectName(name){await page.evaluate(name=>{const s=window.openPencil.getStore();const n=[...s.graph.nodes.values()].find(n=>n.name===name);if(!n)throw Error(name);s.select([n.id])},name)}
async function size(prop,value){await page.locator('[data-property="'+prop+'"]').focus();await page.locator('input:focus').fill(String(value));await page.keyboard.press('Enter')}


try{
 await open()
 await page.evaluate(name=>{const s=window.openPencil.getStore();s.state.autosaveEnabled=false;s.state.documentName=name;for(const [name,x,y,width] of [['Target',600,200,100],['Mover',350,450,80]])s.graph.createNode('RECTANGLE',s.state.currentPageId,{name,x,y,width,height:60,fills:[{type:'SOLID',color:{r:0.8,g:0.4,b:0.2,a:1},opacity:1,visible:true}]});s.requestRender()},name)
 const original=await snap(),canvas=page.locator('[data-test-id="canvas-element"]')
 async function drag(zoom,offset){
  const points=await page.evaluate(({zoom,offset})=>{const s=window.openPencil.getStore();s.state.zoom=zoom;s.state.panX=150;s.state.panY=20;s.select([]);s.requestRender();return {x:390*zoom+150,y:480*zoom+20,toX:640*zoom+150+offset}}, {zoom,offset})
  await page.waitForTimeout(100)
  const box=await canvas.boundingBox()
  await page.mouse.move(box.x+points.x,box.y+points.y);await page.mouse.down();await page.mouse.move(box.x+points.toX,box.y+points.y,{steps:15});await page.mouse.up()
 }
 for(const zoom of [1,0.7]){
  await drag(zoom,2)
  await expect.poll(async()=>(await snap()).find(n=>n.name==='Mover').x).toBe(600)
  const snapped=await snap()
  await canvas.focus();await page.keyboard.press('Control+z');await expect.poll(snap).toEqual(original)
  await page.keyboard.press('Control+Shift+z');await expect.poll(snap).toEqual(snapped)
  await page.keyboard.press('Control+z');await expect.poll(snap).toEqual(original)
  result.checks.push('real pointer 2 CSS px from target left edge snaps exactly at zoom '+zoom+' with undo/redo')
 }
 await drag(1,12)
 await expect.poll(async()=>(await snap()).find(n=>n.name==='Mover').x).toBe(610)
 await canvas.focus();await page.keyboard.press('Control+z');await expect.poll(snap).toEqual(original)
 result.checks.push('12 CSS px from left edge places centers 2px apart, correctly snaps unequal-width centers at x610')
 await drag(1,35)
 await expect.poll(async()=>(await snap()).find(n=>n.name==='Mover').x).toBe(635)
 await canvas.focus();await page.keyboard.press('Control+z');await expect.poll(snap).toEqual(original)
 result.checks.push('pointer outside all edge/center thresholds stays at x635')
 await drag(1,2);const scene=await snap()
 await page.getByRole('button',{name:'保存到本机',exact:true}).click();await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000})
 await browser.close();await open();await page.getByRole('button',{name:'本机画布',exact:true}).click();await page.getByLabel('本机画布列表').getByRole('button',{name:new RegExp('^'+name+' ·')}).click();await expect.poll(snap).toEqual(scene)
 await page.screenshot({path:resolve(out,'restored.png')});result.checks.push('snapped coordinates survive disk save and fresh browser')
 assert.deepEqual(result.errors,[]);result.status='passed'
}catch(e){result.status='failed';result.error=e.stack;await page?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});throw e}finally{await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2));await browser?.close()}
