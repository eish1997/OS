import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const {chromium,expect}=createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const out=resolve(process.env.OS_CANVAS_EVIDENCE_DIR??'output/dev-evidence/canvas-c06/constraints'),base=process.env.OS_CANVAS_TEST_URL??'http://localhost:24650'
await mkdir(out,{recursive:true})
const name=`C06 pen path ${Date.now()}`,result={name,base,checks:[],errors:[]};let browser,page
async function open(){browser=await chromium.launch({channel:'msedge'});page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>result.errors.push(e.message));page.on('response',async r=>{if(r.request().method()==='POST'&&r.url().includes('/canvases/')){try{(result.saves??=[]).push(await r.json())}catch{}}});await page.goto(`${base}/?test&os-canvas&no-rulers`);await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({timeout:60000});await page.locator('#loader').waitFor({state:'detached'})}
async function snap(){return page.evaluate(()=>{const s=window.openPencil.getStore();const visit=id=>s.graph.getChildren(id).map(n=>({type:n.type,name:n.name,vectorNetwork:n.vectorNetwork?{...n.vectorNetwork,vertices:n.vectorNetwork.vertices.map(v=>({...v,handleMirroring:v.handleMirroring??'NONE'}))}:n.vectorNetwork,booleanOperation:n.booleanOperation,horizontalConstraint:n.horizontalConstraint,verticalConstraint:n.verticalConstraint,visible:n.visible,locked:n.locked,clipsContent:n.clipsContent,layoutMode:n.layoutMode,layoutWrap:n.layoutWrap,gridTemplateColumns:n.gridTemplateColumns,gridTemplateRows:n.gridTemplateRows,gridColumnGap:n.gridColumnGap,gridRowGap:n.gridRowGap,gridPosition:n.gridPosition,itemSpacing:n.itemSpacing,paddingLeft:n.paddingLeft,paddingRight:n.paddingRight,paddingTop:n.paddingTop,paddingBottom:n.paddingBottom,primaryAxisSizing:n.primaryAxisSizing,counterAxisSizing:n.counterAxisSizing,layoutSizingHorizontal:n.layoutSizingHorizontal,x:n.x,y:n.y,width:n.width,height:n.height,children:visit(n.id)}));return visit(s.state.currentPageId)})}
async function draw(key,x,y,w,h){await page.keyboard.press(key);await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+w,y+h,{steps:12});await page.mouse.up();await page.keyboard.press('Escape')}
async function rename(oldName,newName){const layers=page.locator('[data-test-id="layers-scroll"]');await layers.getByText(oldName,{exact:true}).dblclick();const input=layers.locator('input:visible');await input.fill(newName);await input.press('Enter')}

async function selectName(name){await page.evaluate(name=>{const s=window.openPencil.getStore();const n=[...s.graph.nodes.values()].find(n=>n.name===name);if(!n)throw Error(name);s.select([n.id])},name)}
async function size(prop,value){await page.locator('[data-property="'+prop+'"]').focus();await page.locator('input:focus').fill(String(value));await page.keyboard.press('Enter')}




try{
 await open();await page.evaluate(name=>{const s=window.openPencil.getStore();s.state.documentName=name;s.state.autosaveEnabled=false},name)
 const canvas=page.locator('[data-test-id="canvas-element"]'),box=await canvas.boundingBox()
 await canvas.focus();await page.keyboard.press('p')
 for(const [x,y] of [[400,300],[600,300],[500,480],[400,300]])await page.mouse.click(box.x+x,box.y+y)
 await expect.poll(async()=>(await snap()).length).toBe(1)
 await expect.poll(async()=>(await snap())[0].vectorNetwork.vertices.length).toBe(3)
 const original=await snap();assert.equal(original[0].type,'VECTOR');assert.equal(original[0].vectorNetwork.segments.length,3)
 await page.keyboard.press('Escape');await page.keyboard.press('v')
 await page.mouse.click(box.x+500,box.y+300);await page.keyboard.press('Enter')
 await expect.poll(()=>page.evaluate(()=>!!window.openPencil.getStore().getNodeEditState())).toBe(true)
 await page.keyboard.press('p');await page.mouse.click(box.x+500,box.y+300)
 await expect.poll(()=>page.evaluate(()=>window.openPencil.getStore().getNodeEditState()?.vertices.length)).toBe(4)
 await page.keyboard.press('Control+z');await expect.poll(()=>page.evaluate(()=>window.openPencil.getStore().getNodeEditState()?.vertices.length)).toBe(3)
 await page.keyboard.press('Control+Shift+z');await expect.poll(()=>page.evaluate(()=>window.openPencil.getStore().getNodeEditState()?.vertices.length)).toBe(4)
 await page.keyboard.down('Alt');await page.mouse.click(box.x+500,box.y+300);await page.keyboard.up('Alt')
 await expect.poll(()=>page.evaluate(()=>window.openPencil.getStore().getNodeEditState()?.vertices.length)).toBe(3)
 await page.keyboard.press('Control+z');await expect.poll(()=>page.evaluate(()=>window.openPencil.getStore().getNodeEditState()?.vertices.length)).toBe(4)
 await page.keyboard.press('Escape')
 assert.equal((await snap())[0].vectorNetwork.vertices.length,4)
 await page.keyboard.press('Escape');await page.keyboard.press('p')
 await page.mouse.click(box.x+750,box.y+300)
 await page.mouse.move(box.x+850,box.y+380);await page.mouse.down();await page.mouse.move(box.x+880,box.y+350,{steps:10});await page.mouse.up()
 await page.mouse.click(box.x+950,box.y+450);await page.keyboard.press('Enter')
 await expect.poll(async()=>(await snap()).length).toBe(2)
 const scene=await snap(),openPath=scene[1].vectorNetwork
 assert.equal(openPath.vertices.length,3);assert.equal(openPath.segments.length,2)
 assert.ok(openPath.segments.some(s=>s.tangentStart.x!==0||s.tangentStart.y!==0||s.tangentEnd.x!==0||s.tangentEnd.y!==0))
 result.checks.push('real Pen drag creates Bezier control tangents; Enter commits open three-point two-segment path')
 result.checks.push('real Pen clicks create closed three-point path; Pen edge click inserts point; Alt click removes; local undo/redo preserves topology')
 await page.getByRole('button',{name:'保存到本机',exact:true}).click();await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000})
 await browser.close();await open();await page.getByRole('button',{name:'本机画布',exact:true}).click();await page.getByLabel('本机画布列表').getByRole('button',{name:new RegExp('^'+name+' ·')}).click();await expect.poll(snap).toEqual(scene)
 await page.screenshot({path:resolve(out,'restored.png')})
 result.checks.push('pen-created and point-edited network persists exactly across actual disk save and fresh browser')
 assert.deepEqual(result.errors,[]);result.status='passed'
}catch(e){result.status='failed';result.error=e.stack;await page?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});throw e}finally{await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2));await browser?.close()}
