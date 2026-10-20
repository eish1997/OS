import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const {chromium,expect}=createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const out=resolve(process.env.OS_CANVAS_EVIDENCE_DIR??'output/dev-evidence/canvas-c06/search'),base=process.env.OS_CANVAS_TEST_URL??'http://localhost:24650'
await mkdir(out,{recursive:true})
const name=`C06 search ${Date.now()}`,result={name,base,checks:[],errors:[]};let browser,page
async function open(){browser=await chromium.launch({channel:'msedge'});page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>result.errors.push(e.message));await page.goto(`${base}/?test&os-canvas&no-rulers`);await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({timeout:60000});await page.locator('#loader').waitFor({state:'detached'})}
async function snap(){return page.evaluate(()=>{const s=window.openPencil.getStore();const visit=id=>s.graph.getChildren(id).map(n=>({type:n.type,name:n.name,visible:n.visible,locked:n.locked,clipsContent:n.clipsContent,x:n.x,y:n.y,width:n.width,height:n.height,children:visit(n.id)}));return visit(s.state.currentPageId)})}
async function draw(key,x,y,w,h){await page.keyboard.press(key);await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+w,y+h,{steps:12});await page.mouse.up();await page.keyboard.press('Escape')}
async function rename(oldName,newName){const layers=page.locator('[data-test-id="layers-scroll"]');await layers.getByText(oldName,{exact:true}).dblclick();const input=layers.locator('input:visible');await input.fill(newName);await input.press('Enter')}
try{
 await open();await page.evaluate(()=>{window.openPencil.getStore().state.autosaveEnabled=false})
 await draw('f',350,250,260,300);await rename((await snap())[0].name,'方案甲')
 await draw('f',750,250,260,300);await rename((await snap())[1].name,'方案乙')
 await page.getByRole('button',{name:'查找对象',exact:true}).click()
 const panel=page.getByRole('region',{name:'画布搜索',exact:true}),query=page.getByRole('textbox',{name:'搜索对象名称',exact:true})
 await query.fill('方案');await panel.getByRole('button',{name:'搜索',exact:true}).click()
 await expect(panel.getByRole('status')).toHaveText('找到 2 个对象')
 await panel.getByRole('button',{name:/方案乙/}).click()
 await expect.poll(()=>page.evaluate(()=>{const s=window.openPencil.getStore();return [...s.state.selectedIds].map(id=>s.graph.getNode(id)?.name)})).toEqual(['方案乙'])
 result.checks.push('Chinese substring search returns two named results and click selects chosen object')
 await query.fill('不存在的名称');await query.press('Enter');await expect(panel.getByRole('status')).toHaveText('未找到匹配对象')
 await query.fill('方案甲');await query.press('Enter');await panel.getByRole('button',{name:/方案甲/}).click()
 await page.locator('[data-test-id="canvas-element"]').focus();await page.keyboard.press('Delete')
 await panel.getByRole('button',{name:/方案甲/}).click();await expect(panel.getByRole('status')).toHaveText('对象已删除或画布已切换，请重新搜索')
 result.checks.push('empty result and stale deleted result are handled without selecting another object')
 // Create a second page using the public editor page action; search remains real UI.
 await page.evaluate(async()=>{const s=window.openPencil.getStore();const first=s.state.currentPageId;const second=s.addPage('第二页');await s.switchPage(second);const id=s.createShape('RECTANGLE',100,100,100,100,undefined,'跨页目标');window.searchTarget=id;await s.switchPage(first)})
 await query.fill('跨页');await query.press('Enter');await expect(panel.getByRole('status')).toHaveText('找到 1 个对象')
 await panel.getByRole('button',{name:/跨页目标.*第二页/}).click()
 await expect.poll(()=>page.evaluate(()=>{const s=window.openPencil.getStore();return {page:s.graph.getNode(s.state.currentPageId)?.name,selected:[...s.state.selectedIds]}})).toEqual({page:'第二页',selected:[await page.evaluate(()=>window.searchTarget)]})
 result.checks.push('cross-page result shows page path and locates on that page')
 await page.screenshot({path:resolve(out,'cross-page.png')})
 await page.evaluate(()=>{const s=window.openPencil.getStore();s.graph.updateNode(window.searchTarget,{visible:false})})
 await panel.getByRole('button',{name:/跨页目标/}).click()
 await expect(panel.getByRole('status')).toHaveText('已定位；对象或父级处于隐藏状态')
 await page.evaluate(()=>{const s=window.openPencil.getStore();s.graph.insertChildAt(window.searchTarget,s.graph.getPages()[0].id,0)})
 await panel.getByRole('button',{name:/跨页目标/}).click()
 await expect(panel.getByRole('status')).toHaveText('对象已移动，请重新搜索')
 await query.fill('');await query.press('Enter');await expect(panel.getByRole('status')).toHaveText('请输入对象名称')
 result.checks.push('locate reads current visibility, rejects moved result, and empty query requests input')
 await page.evaluate(()=>{const s=window.openPencil.getStore();for(let i=0;i<101;i++)s.createShape('RECTANGLE',i*4,100,20,20,undefined,'重复名称')})
 await query.fill('重复名称');await query.press('Enter')
 await expect(panel.getByRole('status')).toHaveText('找到 101 个对象')
 await expect(panel.getByRole('button',{name:/重复名称/})).toHaveCount(100)
 await panel.getByRole('button',{name:'显示更多',exact:true}).click()
 await expect(panel.getByRole('button',{name:/重复名称/})).toHaveCount(101)
 await query.fill('新查询')
 await expect(panel.getByRole('button',{name:/重复名称/})).toHaveCount(0)
 result.checks.push('same-name objects remain distinct, 100-result batches expand, changing query clears stale results')
 assert.deepEqual(result.errors,[]);result.status='passed'
}catch(e){result.status='failed';result.error=e.stack;await page?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});throw e}finally{await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2));await browser?.close()}
