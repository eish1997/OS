import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const {chromium,expect}=createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const out=resolve(process.env.OS_CANVAS_EVIDENCE_DIR??'output/dev-evidence/canvas-c06/sections-frames'),base=process.env.OS_CANVAS_TEST_URL??'http://localhost:24650'
await mkdir(out,{recursive:true})
const name=`C06 sections ${Date.now()}`,result={name,base,checks:[],errors:[]};let browser,page
async function open(){browser=await chromium.launch({channel:'msedge'});page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>result.errors.push(e.message));await page.goto(`${base}/?test&os-canvas&no-rulers`);await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({timeout:60000});await page.locator('#loader').waitFor({state:'detached'})}
async function snap(){return page.evaluate(()=>{const s=window.openPencil.getStore();const visit=id=>s.graph.getChildren(id).map(n=>({type:n.type,name:n.name,visible:n.visible,locked:n.locked,clipsContent:n.clipsContent,x:n.x,y:n.y,width:n.width,height:n.height,children:visit(n.id)}));return visit(s.state.currentPageId)})}
async function draw(key,x,y,w,h){await page.keyboard.press(key);await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+w,y+h,{steps:12});await page.mouse.up();await page.keyboard.press('Escape')}
async function rename(oldName,newName){const layers=page.locator('[data-test-id="layers-scroll"]');await layers.getByText(oldName,{exact:true}).dblclick();const input=layers.locator('input:visible');await input.fill(newName);await input.press('Enter')}
try{
 await open();await page.evaluate(name=>{const s=window.openPencil.getStore();s.state.autosaveEnabled=false;s.state.documentName=name},name)
 await draw('Shift+s',350,220,650,460)
 let scene=await snap();assert.equal(scene[0].type,'SECTION')
 if(process.env.OS_CANVAS_TITLE_FAILURE==='1') await page.evaluate(async()=>{
  const {fontManager}=await import('/packages/core/src/text/index.ts')
  const original=fontManager.ensureFallbackPack
  window.restoreTitleFonts=()=>{fontManager.ensureFallbackPack=original}
  fontManager.ensureFallbackPack=async()=>({})
 })
 await rename(scene[0].name,'素材分区')
 if(process.env.OS_CANVAS_TITLE_FAILURE==='1') {
  await expect(page.getByRole('button',{name:'重试标题字体',exact:true})).toBeVisible()
  assert.equal((await snap())[0].name,'素材分区')
  await page.screenshot({path:resolve(out,'font-failure.png')})
  await page.evaluate(()=>window.restoreTitleFonts())
  await page.getByRole('button',{name:'重试标题字体',exact:true}).click()
  await expect(page.getByRole('button',{name:'重试标题字体',exact:true})).toBeHidden()
  await expect(page.locator('[data-slot="title-font-loading"]')).toBeHidden({timeout:30000})
  await page.locator('[data-test-id="canvas-element"]').focus()
  result.checks.push('empty fallback result preserves title and visible retry recovers')
 }
 await draw('f',400,300,260,260)
 scene=await snap();result.afterFrame=scene
 assert.equal(scene[0].children[0].type,'FRAME')
 await rename(scene[0].children[0].name,'方案画框')
 await draw('r',430,340,100,80)
 scene=await snap();result.nested=scene
 assert.equal(scene[0].children[0].children[0].type,'RECTANGLE')
 await page.locator('[data-test-id="layers-scroll"]').getByText('方案画框',{exact:true}).click()
 await page.locator('[data-test-id="canvas-element"]').focus()
 await page.keyboard.press('Enter')
 await expect.poll(()=>page.evaluate(()=>[...window.openPencil.getStore().state.selectedIds].map(id=>window.openPencil.getStore().graph.getNode(id)?.type))).toEqual(['RECTANGLE'])
 await page.keyboard.press('Shift+Enter')
 await expect.poll(()=>page.evaluate(()=>[...window.openPencil.getStore().state.selectedIds].map(id=>window.openPencil.getStore().graph.getNode(id)?.type))).toEqual(['FRAME'])
 const beforeMove=await snap();await page.keyboard.press('Shift+ArrowRight');await page.keyboard.press('Escape')
 let moved=await snap();assert.equal(moved[0].children[0].x,beforeMove[0].children[0].x+10);assert.deepEqual(moved[0].children[0].children,beforeMove[0].children[0].children)
 await page.keyboard.press('Control+z');await expect.poll(snap).toEqual(beforeMove)
 await page.keyboard.press('Control+Shift+z');await expect.poll(snap).toEqual(moved)
 if(process.env.OS_CANVAS_OBJECT_MANAGEMENT==='1') {
  const layers=page.locator('[data-test-id="layers-scroll"]')
  await layers.getByText('Rectangle 1',{exact:true}).click()
  await page.locator('[data-test-id="canvas-element"]').focus()
  for(let step=0;step<20;step++)await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Escape')
  assert.ok((await snap())[0].children[0].children[0].x+100>(await snap())[0].children[0].width)
  await layers.getByText('方案画框',{exact:true}).click()
  await page.getByRole('button',{name:'属性面板',exact:true}).click()
  const clipping=page.getByRole('checkbox',{name:'裁剪内容',exact:true})
  await clipping.setChecked(true)
  await expect.poll(async()=>(await snap())[0].children[0].clipsContent).toBe(true)
  await page.screenshot({path:resolve(out,'clipped.png')})
  await clipping.setChecked(false)
  await expect.poll(async()=>(await snap())[0].children[0].clipsContent).toBe(false)
  await page.screenshot({path:resolve(out,'unclipped.png')})
  await page.getByRole('button',{name:'资产面板',exact:true}).click()
  await layers.getByText('Rectangle 1',{exact:true}).click();await page.locator('[data-test-id="canvas-element"]').focus()
  await page.keyboard.press('Control+Shift+l')
  await expect.poll(async()=>(await snap())[0].children[0].children[0].locked).toBe(true)
  await page.keyboard.press('Control+z');await expect.poll(async()=>(await snap())[0].children[0].children[0].locked).toBe(false)
  await page.keyboard.press('Control+Shift+z');await expect.poll(async()=>(await snap())[0].children[0].children[0].locked).toBe(true)
  await layers.getByText('Rectangle 1',{exact:true}).click();await page.locator('[data-test-id="canvas-element"]').focus()
  await page.keyboard.press('Control+Shift+h')
  await expect.poll(async()=>(await snap())[0].children[0].children[0].visible).toBe(false)
  await page.keyboard.press('Control+z');await expect.poll(async()=>(await snap())[0].children[0].children[0].visible).toBe(true)
  await page.keyboard.press('Control+Shift+z');await expect.poll(async()=>(await snap())[0].children[0].children[0].visible).toBe(false)
  await layers.getByText('方案画框',{exact:true}).click()
  await page.getByRole('button',{name:'属性面板',exact:true}).click()
  const clipped=(await snap())[0].children[0].clipsContent
  await page.getByRole('checkbox',{name:'裁剪内容',exact:true}).click()
  await expect.poll(async()=>(await snap())[0].children[0].clipsContent).toBe(!clipped)
  await page.getByRole('button',{name:'资产面板',exact:true}).click()
  await page.locator('[data-test-id="canvas-element"]').focus()
  await page.keyboard.press('Control+z');await expect.poll(async()=>(await snap())[0].children[0].clipsContent).toBe(clipped)
  await page.keyboard.press('Control+Shift+z');await expect.poll(async()=>(await snap())[0].children[0].clipsContent).toBe(!clipped)
  moved=await snap()
  result.checks.push('lock/hide via keyboard and clip via actual checkbox, each undo/redo; persisted hidden locked child')
 }
 await page.locator('[data-test-id="layers-scroll"]').getByText('方案画框',{exact:true}).click()
 await page.locator('[data-test-id="canvas-element"]').focus()
 await page.keyboard.press('Shift+2')
 await expect.poll(()=>page.evaluate(()=>{
  const s=window.openPencil.getStore(),n=s.graph.getNode([...s.state.selectedIds][0]),p=s.graph.getAbsolutePosition(n.id)
  const box=document.querySelector('[data-test-id="canvas-element"]').getBoundingClientRect()
  return Math.max(Math.abs((p.x+n.width/2)*s.state.zoom+s.state.panX-box.width/2),Math.abs((p.y+n.height/2)*s.state.zoom+s.state.panY-box.height/2))
 })).toBeLessThan(1)
 const view=await page.evaluate(()=>{const s=window.openPencil.getStore().state;return {zoom:s.zoom,panX:s.panX,panY:s.panY}});result.view=view
 result.checks.push('real section/frame/rectangle creation, inline Chinese names, nested keyboard navigation and container movement history')
 await page.getByRole('button',{name:'保存到本机',exact:true}).click();await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000});await page.screenshot({path:resolve(out,'saved.png')})
 await browser.close();await open();await page.getByRole('button',{name:'本机画布',exact:true}).click();await page.getByLabel('本机画布列表').getByRole('button',{name:new RegExp(`^${name} ·`)}).click();await expect.poll(snap).toEqual(moved)
 await expect.poll(()=>page.evaluate(()=>{const s=window.openPencil.getStore().state;return {zoom:s.zoom,panX:s.panX,panY:s.panY}})).toEqual(view)
 result.checks.push('Shift+2 fits selected frame and saved viewport restores on reopen')
 await expect(page.locator('[data-slot="title-font-loading"]')).toBeHidden({timeout:30000})
 assert.equal(await page.evaluate(()=>window.openPencil.getStore().hasUnsavedChanges()),false)
 await page.screenshot({path:resolve(out,'restored.png')});result.checks.push('section/frame nesting, names and geometry survive fresh browser reopen');assert.deepEqual(result.errors,[]);result.status='passed'
}catch(e){result.status='failed';result.error=e.stack;await page?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});throw e}finally{await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2));await browser?.close()}
