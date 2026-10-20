import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const {chromium,expect}=createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const out=resolve(process.env.OS_CANVAS_EVIDENCE_DIR??'output/dev-evidence/canvas-c06/constraints'),base=process.env.OS_CANVAS_TEST_URL??'http://localhost:24650'
await mkdir(out,{recursive:true})
const name=`C06 constraints ${Date.now()}`,result={name,base,checks:[],errors:[]};let browser,page
async function open(){browser=await chromium.launch({channel:'msedge'});page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>result.errors.push(e.message));page.on('response',async r=>{if(r.request().method()==='POST'&&r.url().includes('/canvases/')){try{(result.saves??=[]).push(await r.json())}catch{}}});await page.goto(`${base}/?test&os-canvas&no-rulers`);await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({timeout:60000});await page.locator('#loader').waitFor({state:'detached'})}
async function snap(){return page.evaluate(()=>{const s=window.openPencil.getStore();const visit=id=>s.graph.getChildren(id).map(n=>({type:n.type,name:n.name,horizontalConstraint:n.horizontalConstraint,verticalConstraint:n.verticalConstraint,visible:n.visible,locked:n.locked,clipsContent:n.clipsContent,layoutMode:n.layoutMode,layoutWrap:n.layoutWrap,gridTemplateColumns:n.gridTemplateColumns,gridTemplateRows:n.gridTemplateRows,gridColumnGap:n.gridColumnGap,gridRowGap:n.gridRowGap,gridPosition:n.gridPosition,itemSpacing:n.itemSpacing,paddingLeft:n.paddingLeft,paddingRight:n.paddingRight,paddingTop:n.paddingTop,paddingBottom:n.paddingBottom,primaryAxisSizing:n.primaryAxisSizing,counterAxisSizing:n.counterAxisSizing,layoutSizingHorizontal:n.layoutSizingHorizontal,x:n.x,y:n.y,width:n.width,height:n.height,children:visit(n.id)}));return visit(s.state.currentPageId)})}
async function draw(key,x,y,w,h){await page.keyboard.press(key);await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+w,y+h,{steps:12});await page.mouse.up();await page.keyboard.press('Escape')}
async function rename(oldName,newName){const layers=page.locator('[data-test-id="layers-scroll"]');await layers.getByText(oldName,{exact:true}).dblclick();const input=layers.locator('input:visible');await input.fill(newName);await input.press('Enter')}

async function selectName(name){await page.evaluate(name=>{const s=window.openPencil.getStore();const n=[...s.graph.nodes.values()].find(n=>n.name===name);if(!n)throw Error(name);s.select([n.id])},name)}
async function size(prop,value){await page.locator('[data-property="'+prop+'"]').focus();await page.locator('input:focus').fill(String(value));await page.keyboard.press('Enter')}

try{
 await open()
 result.lifecycle=await page.evaluate(async()=>{
  const {useSizePreview}=await import('/packages/vue/src/controls/layout/size-preview.ts')
  const s=window.openPencil.getStore();s.state.autosaveEnabled=false
  const f=s.graph.createNode('FRAME',s.state.currentPageId,{width:200,height:200})
  const a=s.graph.createNode('RECTANGLE',f.id,{x:20,y:30,width:40,height:50,horizontalConstraint:'SCALE',verticalConstraint:'SCALE'})
  const nested=s.graph.createNode('FRAME',f.id,{x:100,y:100,width:80,height:80,horizontalConstraint:'STRETCH',verticalConstraint:'STRETCH'})
  const b=s.graph.createNode('RECTANGLE',nested.id,{x:10,y:10,width:20,height:20,horizontalConstraint:'MAX',verticalConstraint:'MAX'})
  const state=()=>[f,a,nested,b].map(n=>[n.x,n.y,n.width,n.height])
  const start=state();const p=useSizePreview(s)
  p.update(f.id,{width:300},'test resize');p.update(f.id,{width:400},'test resize')
  const live=state();p.cancel();const canceled=state()
  p.update(f.id,{width:300},'test resize');s.select([a.id]);const selectionCanceled=state()
  p.update(f.id,{width:400,height:400},'test resize');p.commit();const committed=state()
  s.undo.undo();const undone=state();s.undo.redo();const redone=state()
  return {start,live,canceled,selectionCanceled,committed,undone,redone}
 })
 const r=result.lifecycle
 assert.deepEqual(r.live.map(n=>n.slice(0,4)),[[0,0,400,200],[40,30,80,50],[100,100,280,80],[210,10,20,20]])
 assert.deepEqual(r.canceled,r.start);assert.deepEqual(r.selectionCanceled,r.start)
 assert.deepEqual(r.undone,r.start);assert.deepEqual(r.redone,r.committed)
 assert.deepEqual(r.committed,[[0,0,400,400],[40,60,80,100],[100,100,280,280],[210,210,20,20]])
 result.checks.push('controlled composable integration: repeated preview uses original baseline; cancel and selection change restore subtree; nested stretch/pin commits and undoes in one entry')
 assert.deepEqual(result.errors,[]);result.status='passed'
}catch(e){result.status='failed';result.error=e.stack;throw e}finally{await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2));await browser?.close()}
