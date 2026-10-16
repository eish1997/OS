import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const {chromium,expect}=createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const out=resolve(process.env.OS_CANVAS_EVIDENCE_DIR??'output/dev-evidence/canvas-c06/constraints'),base=process.env.OS_CANVAS_TEST_URL??'http://localhost:24650'
await mkdir(out,{recursive:true})
const name=`C06 vector editing ${Date.now()}`,result={name,base,checks:[],errors:[]};let browser,page
async function open(){browser=await chromium.launch({channel:'msedge'});page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>result.errors.push(e.message));page.on('response',async r=>{if(r.request().method()==='POST'&&r.url().includes('/canvases/')){try{(result.saves??=[]).push(await r.json())}catch{}}});await page.goto(`${base}/?test&os-canvas&no-rulers`);await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({timeout:60000});await page.locator('#loader').waitFor({state:'detached'})}
async function snap(){return page.evaluate(()=>{const s=window.openPencil.getStore();const visit=id=>s.graph.getChildren(id).map(n=>({type:n.type,name:n.name,vectorNetwork:n.vectorNetwork,booleanOperation:n.booleanOperation,horizontalConstraint:n.horizontalConstraint,verticalConstraint:n.verticalConstraint,visible:n.visible,locked:n.locked,clipsContent:n.clipsContent,layoutMode:n.layoutMode,layoutWrap:n.layoutWrap,gridTemplateColumns:n.gridTemplateColumns,gridTemplateRows:n.gridTemplateRows,gridColumnGap:n.gridColumnGap,gridRowGap:n.gridRowGap,gridPosition:n.gridPosition,itemSpacing:n.itemSpacing,paddingLeft:n.paddingLeft,paddingRight:n.paddingRight,paddingTop:n.paddingTop,paddingBottom:n.paddingBottom,primaryAxisSizing:n.primaryAxisSizing,counterAxisSizing:n.counterAxisSizing,layoutSizingHorizontal:n.layoutSizingHorizontal,x:n.x,y:n.y,width:n.width,height:n.height,children:visit(n.id)}));return visit(s.state.currentPageId)})}
async function draw(key,x,y,w,h){await page.keyboard.press(key);await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+w,y+h,{steps:12});await page.mouse.up();await page.keyboard.press('Escape')}
async function rename(oldName,newName){const layers=page.locator('[data-test-id="layers-scroll"]');await layers.getByText(oldName,{exact:true}).dblclick();const input=layers.locator('input:visible');await input.fill(newName);await input.press('Enter')}

async function selectName(name){await page.evaluate(name=>{const s=window.openPencil.getStore();const n=[...s.graph.nodes.values()].find(n=>n.name===name);if(!n)throw Error(name);s.select([n.id])},name)}
async function size(prop,value){await page.locator('[data-property="'+prop+'"]').focus();await page.locator('input:focus').fill(String(value));await page.keyboard.press('Enter')}



try{
 await open()
 await page.evaluate(name=>{const s=window.openPencil.getStore();s.state.autosaveEnabled=false;s.state.documentName=name;const n=s.graph.createNode('VECTOR',s.state.currentPageId,{name:'Editable path',x:400,y:300,width:200,height:150,fills:[{type:'SOLID',color:{r:0.8,g:0.4,b:0.2,a:1},opacity:1,visible:true}],vectorNetwork:{vertices:[{x:0,y:0,handleMirroring:'NONE'},{x:200,y:0,handleMirroring:'NONE'},{x:100,y:150,handleMirroring:'NONE'}],segments:[{start:0,end:1,tangentStart:{x:50,y:50},tangentEnd:{x:-50,y:50}},{start:1,end:2,tangentStart:{x:0,y:0},tangentEnd:{x:0,y:0}},{start:2,end:0,tangentStart:{x:0,y:0},tangentEnd:{x:0,y:0}}],regions:[{windingRule:'NONZERO',loops:[[0,1,2]]}]}});s.select([n.id]);s.requestRender()},name)
 const canvas=page.locator('[data-test-id="canvas-element"]');await canvas.focus();await page.keyboard.press('Enter')
 await expect.poll(()=>page.evaluate(()=>!!window.openPencil.getStore().getNodeEditState())).toBe(true)
 const original=await snap()
 const p=await page.evaluate(()=>{const s=window.openPencil.getStore(),v=s.getNodeEditState().vertices[2];return{x:v.x*s.state.zoom+s.state.panX,y:v.y*s.state.zoom+s.state.panY}})
 const box=await canvas.boundingBox()
 await page.mouse.move(box.x+p.x,box.y+p.y);await page.mouse.down();await page.mouse.move(box.x+p.x+35,box.y+p.y+20,{steps:12});await page.mouse.up()
 await expect.poll(async()=>(await snap())[0].vectorNetwork.vertices).not.toEqual(original[0].vectorNetwork.vertices)
 const edited=await snap()
 result.before=original;result.edited=edited
 await page.keyboard.press('Control+z');result.undoState=await page.evaluate(()=>{const s=window.openPencil.getStore();return {vertices:s.getNodeEditState()?.vertices,history:s.getNodeEditState()?.history.length,future:s.getNodeEditState()?.future.length}});await expect.poll(snap).toEqual(original)
 await page.keyboard.press('Control+Shift+z');await expect.poll(snap).toEqual(edited)
 await page.keyboard.press('Escape')
 await expect.poll(()=>page.evaluate(()=>!!window.openPencil.getStore().getNodeEditState())).toBe(false)
 await page.keyboard.press('Control+z');await expect.poll(snap).toEqual(original)
 result.documentHistory=await page.evaluate(()=>({canUndo:window.openPencil.getStore().undo.canUndo,undoLabel:window.openPencil.getStore().undo.undoLabel}))
 assert.equal(result.documentHistory.canUndo,false,'one editing session must not replay its internal undo/redo as additional document edits')
 await page.keyboard.press('Control+Shift+z');await expect.poll(snap).toEqual(edited)
 result.checks.push('Enter enters vector edit, actual pointer changes vertex, undo/redo restores full geometry and network')

 await page.keyboard.press('Enter')
 await expect.poll(()=>page.evaluate(()=>!!window.openPencil.getStore().getNodeEditState())).toBe(true)
 const handle=await page.evaluate(()=>{const s=window.openPencil.getStore(),e=s.getNodeEditState(),v=e.vertices[0],t=e.segments[0].tangentStart;return {vx:v.x*s.state.zoom+s.state.panX,vy:v.y*s.state.zoom+s.state.panY,hx:(v.x+t.x)*s.state.zoom+s.state.panX,hy:(v.y+t.y)*s.state.zoom+s.state.panY}})
 await page.mouse.click(box.x+handle.vx,box.y+handle.vy)
 await page.mouse.move(box.x+handle.hx,box.y+handle.hy);await page.mouse.down();await page.mouse.move(box.x+handle.hx+25,box.y+handle.hy-20,{steps:12});await page.mouse.up()
 await expect.poll(async()=>(await snap())[0].vectorNetwork.segments[0].tangentStart).toEqual({x:75,y:30})
 const curved=await snap()
 await page.keyboard.press('Control+z');await expect.poll(snap).toEqual(edited)
 await page.keyboard.press('Control+Shift+z');await expect.poll(snap).toEqual(curved)
 await page.keyboard.press('Escape')
 await page.keyboard.press('Control+z');await expect.poll(snap).toEqual(edited)
 await page.keyboard.press('Control+z');await expect.poll(snap).toEqual(original)
 await page.keyboard.press('Control+Shift+z');await expect.poll(snap).toEqual(edited)
 await page.keyboard.press('Control+Shift+z');await expect.poll(snap).toEqual(curved)
 result.checks.push('second session real Bezier handle drag, local undo/redo, separate document history steps across two sessions')
 const scene=await snap()
 await page.getByRole('button',{name:'保存到本机',exact:true}).click();await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000})
 await browser.close();await open();await page.getByRole('button',{name:'本机画布',exact:true}).click();await page.getByLabel('本机画布列表').getByRole('button',{name:new RegExp('^'+name+' ·')}).click();await expect.poll(snap).toEqual(scene)
 await page.screenshot({path:resolve(out,'restored.png')});result.checks.push('full vector vertices, segments, tangent vectors and regions persist after fresh browser reopen')
 assert.deepEqual(result.errors,[]);result.status='passed'
}catch(e){result.status='failed';result.error=e.stack;await page?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});throw e}finally{await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2));await browser?.close()}
