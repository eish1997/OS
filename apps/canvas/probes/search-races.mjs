import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const {chromium,expect}=createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const out=resolve(process.env.OS_CANVAS_EVIDENCE_DIR??'output/dev-evidence/canvas-c06/search-races'),base=process.env.OS_CANVAS_TEST_URL??'http://localhost:24650'
await mkdir(out,{recursive:true})
const name=`C06 search ${Date.now()}`,result={name,base,checks:[],errors:[]};let browser,page
async function open(){browser=await chromium.launch({channel:'msedge'});page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>result.errors.push(e.message));await page.goto(`${base}/?test&os-canvas&no-rulers`);await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({timeout:60000});await page.locator('#loader').waitFor({state:'detached'})}
async function snap(){return page.evaluate(()=>{const s=window.openPencil.getStore();const visit=id=>s.graph.getChildren(id).map(n=>({type:n.type,name:n.name,visible:n.visible,locked:n.locked,clipsContent:n.clipsContent,x:n.x,y:n.y,width:n.width,height:n.height,children:visit(n.id)}));return visit(s.state.currentPageId)})}
async function draw(key,x,y,w,h){await page.keyboard.press(key);await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+w,y+h,{steps:12});await page.mouse.up();await page.keyboard.press('Escape')}
async function rename(oldName,newName){const layers=page.locator('[data-test-id="layers-scroll"]');await layers.getByText(oldName,{exact:true}).dblclick();const input=layers.locator('input:visible');await input.fill(newName);await input.press('Enter')}
async function hold(mode='delay') {
 await page.evaluate(mode=>{
  const s=window.openPencil.getStore(), original=s.loadPageNodes
  let release;const pending=new Promise(r=>release=r)
  window.searchGate={calls:0,done:false,release:async()=>{s.loadPageNodes=original;release();await new Promise(r=>setTimeout(r,50))}}
  s.loadPageNodes=async (...args)=>{window.searchGate.calls++;await pending;try{if(mode==='failure')throw new Error('Controlled page load failure');return await original(...args)}finally{window.searchGate.done=true}}
 },mode)
}
try{
 await open();await page.evaluate(()=>{const s=window.openPencil.getStore();s.state.autosaveEnabled=false;s.createShape('RECTANGLE',100,100,100,100,undefined,'目标')})
 await page.getByRole('button',{name:'查找对象',exact:true}).click()
 const panel=page.getByRole('region',{name:'画布搜索',exact:true}),query=panel.getByRole('textbox',{name:'搜索对象名称',exact:true})
 await query.fill('目标');await hold();await query.press('Enter')
 await expect.poll(()=>page.evaluate(()=>window.searchGate.calls)).toBe(1)
 await query.fill('新查询');await page.evaluate(()=>window.searchGate.release())
 await expect(panel.getByRole('status')).toHaveText('');await expect(panel.getByRole('button',{name:/目标/})).toHaveCount(0)
 result.checks.push('query edit during controlled page load discards old results')
 await query.fill('目标');await hold('failure');await query.press('Enter')
 await expect.poll(()=>page.evaluate(()=>window.searchGate.calls)).toBe(1)
 await page.evaluate(()=>window.searchGate.release());await expect(panel.getByRole('status')).toHaveText('搜索失败，请重试')
 await query.press('Enter');await expect(panel.getByRole('status')).toHaveText('找到 1 个对象')
 result.checks.push('controlled load rejection shows error and real retry succeeds')
 await hold();await query.press('Enter');await expect.poll(()=>page.evaluate(()=>window.searchGate.calls)).toBe(1)
 await page.evaluate(()=>{const s=window.openPencil.getStore();s.replaceGraph(new s.graph.constructor())})
 await page.evaluate(()=>window.searchGate.release())
 await expect(panel.getByRole('status')).toHaveText('');await expect(panel.getByRole('button',{name:/目标/})).toHaveCount(0)
 result.checks.push('graph replacement while search waits discards old results')
 assert.deepEqual(result.errors,[]);result.status='passed'
}catch(e){result.status='failed';result.error=e.stack;await page?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});throw e}finally{await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2));await browser?.close()}
