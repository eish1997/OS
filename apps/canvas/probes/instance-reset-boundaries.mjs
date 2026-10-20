import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const {chromium,expect}=createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const out=resolve(process.env.OS_CANVAS_EVIDENCE_DIR??'output/dev-evidence/canvas-c06/constraints'),base=process.env.OS_CANVAS_TEST_URL??'http://localhost:24650'
await mkdir(out,{recursive:true})
const name=`C06 reset boundaries ${Date.now()}`,result={name,base,checks:[],errors:[]};let browser,page
async function open(){browser=await chromium.launch({channel:'msedge'});page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>result.errors.push(e.message));page.on('response',async r=>{if(r.request().method()==='POST'&&r.url().includes('/canvases/')){try{(result.saves??=[]).push(await r.json())}catch{}}});await page.goto(`${base}/?test&os-canvas&no-rulers`);await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({timeout:60000});await page.locator('#loader').waitFor({state:'detached'})}
async function snap(){return page.evaluate(()=>{const s=window.openPencil.getStore();const visit=id=>s.graph.getChildren(id).map(n=>({type:n.type,name:n.name,componentName:n.type==='INSTANCE'&&n.componentId?s.graph.getNode(n.componentId)?.name:null,horizontalConstraint:n.horizontalConstraint,verticalConstraint:n.verticalConstraint,visible:n.visible,locked:n.locked,clipsContent:n.clipsContent,layoutMode:n.layoutMode,layoutWrap:n.layoutWrap,gridTemplateColumns:n.gridTemplateColumns,gridTemplateRows:n.gridTemplateRows,gridColumnGap:n.gridColumnGap,gridRowGap:n.gridRowGap,gridPosition:n.gridPosition,itemSpacing:n.itemSpacing,paddingLeft:n.paddingLeft,paddingRight:n.paddingRight,paddingTop:n.paddingTop,paddingBottom:n.paddingBottom,primaryAxisSizing:n.primaryAxisSizing,counterAxisSizing:n.counterAxisSizing,layoutSizingHorizontal:n.layoutSizingHorizontal,x:n.x,y:n.y,width:n.width,height:n.height,children:visit(n.id)}));return visit(s.state.currentPageId)})}
async function draw(key,x,y,w,h){await page.keyboard.press(key);await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+w,y+h,{steps:12});await page.mouse.up();await page.keyboard.press('Escape')}
async function rename(oldName,newName){const layers=page.locator('[data-test-id="layers-scroll"]');await layers.getByText(oldName,{exact:true}).dblclick();const input=layers.locator('input:visible');await input.fill(newName);await input.press('Enter')}

async function selectName(name){await page.evaluate(name=>{const s=window.openPencil.getStore();const n=[...s.graph.nodes.values()].find(n=>n.name===name);if(!n)throw Error(name);s.select([n.id])},name)}
async function size(prop,value){await page.locator('[data-property="'+prop+'"]').focus();await page.locator('input:focus').fill(String(value));await page.keyboard.press('Enter')}



try{
 await open()
 await page.evaluate(()=>{const s=window.openPencil.getStore();s.state.autosaveEnabled=false;const c=s.graph.createNode('COMPONENT',s.state.currentPageId,{name:'Main',x:350,y:250,width:100,height:80});s.graph.createNode('RECTANGLE',c.id,{width:100,height:80});s.createInstanceFromComponent(c.id,550,250);const i=s.graph.getChildren(s.state.currentPageId).find(n=>n.type==='INSTANCE');window.resetIds={c:c.id,i:i.id};s.select([i.id]);s.requestRender()})
 await page.getByRole('button',{name:'属性面板',exact:true}).click()
 const button=page.getByRole('button',{name:'重置实例修改',exact:true})
 await expect(button).toBeEnabled();await page.screenshot({path:resolve(out,'button.png')})

 await size('width',250);const overridden=await snap()
 await page.evaluate(()=>{const s=window.openPencil.getStore();window.originalResetLayout=s.runLayoutForNode;s.runLayoutForNode=()=>{throw new Error('reset-layout-test-fault')}})
 await button.click();await expect(page.getByRole('alert')).toContainText('reset-layout-test-fault')
 await expect.poll(snap).toEqual(overridden)
 await page.evaluate(()=>{window.openPencil.getStore().runLayoutForNode=window.originalResetLayout})
 await button.click();await expect(page.getByRole('alert')).toHaveCount(0)
 await expect.poll(async()=>(await snap()).find(n=>n.type==='INSTANCE').width).toBe(100)
 await page.locator('[data-test-id="canvas-element"]').focus();await page.keyboard.press('Control+z')
 await expect.poll(snap).toEqual(overridden)
 await page.evaluate(()=>{const s=window.openPencil.getStore();s.select([window.resetIds.i])})
 result.checks.push('controlled post-reset layout failure rolls back all data; retry succeeds and undo restores override')
 await page.evaluate(()=>{const s=window.openPencil.getStore();s.updateNode(window.resetIds.i,{locked:true})})
 await expect(button).toBeDisabled()
 await page.evaluate(()=>{const s=window.openPencil.getStore();s.updateNode(window.resetIds.i,{locked:false})})
 await expect(button).toBeEnabled()
 await page.evaluate(()=>{const s=window.openPencil.getStore();s.graph.deleteNode(window.resetIds.c);s.requestRender()})
 await expect(button).toBeDisabled()
 result.checks.push('actual reset button enabled state tracks instance lock/unlock and missing main without reselecting')
 assert.deepEqual(result.errors,[]);result.status='passed'
}catch(e){result.status='failed';result.error=e.stack;await page?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});throw e}finally{await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2));await browser?.close()}
