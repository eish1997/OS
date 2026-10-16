import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const {chromium,expect}=createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const out=resolve(process.env.OS_CANVAS_EVIDENCE_DIR??'output/dev-evidence/canvas-c06/auto-layout'),base=process.env.OS_CANVAS_TEST_URL??'http://localhost:24650'
await mkdir(out,{recursive:true})
const name=`C06 auto layout ${Date.now()}`,result={name,base,checks:[],errors:[]};let browser,page
async function open(){browser=await chromium.launch({channel:'msedge'});page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>result.errors.push(e.message));page.on('response',async r=>{if(r.request().method()==='POST'&&r.url().includes('/canvases/')){try{(result.saves??=[]).push(await r.json())}catch{}}});await page.goto(`${base}/?test&os-canvas&no-rulers`);await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({timeout:60000});await page.locator('#loader').waitFor({state:'detached'})}
async function snap(){return page.evaluate(()=>{const s=window.openPencil.getStore();const visit=id=>s.graph.getChildren(id).map(n=>({type:n.type,name:n.name,visible:n.visible,locked:n.locked,clipsContent:n.clipsContent,layoutMode:n.layoutMode,layoutWrap:n.layoutWrap,gridTemplateColumns:n.gridTemplateColumns,gridTemplateRows:n.gridTemplateRows,gridColumnGap:n.gridColumnGap,gridRowGap:n.gridRowGap,gridPosition:n.gridPosition,itemSpacing:n.itemSpacing,paddingLeft:n.paddingLeft,paddingRight:n.paddingRight,paddingTop:n.paddingTop,paddingBottom:n.paddingBottom,primaryAxisSizing:n.primaryAxisSizing,counterAxisSizing:n.counterAxisSizing,layoutSizingHorizontal:n.layoutSizingHorizontal,x:n.x,y:n.y,width:n.width,height:n.height,children:visit(n.id)}));return visit(s.state.currentPageId)})}
async function draw(key,x,y,w,h){await page.keyboard.press(key);await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+w,y+h,{steps:12});await page.mouse.up();await page.keyboard.press('Escape')}
async function rename(oldName,newName){const layers=page.locator('[data-test-id="layers-scroll"]');await layers.getByText(oldName,{exact:true}).dblclick();const input=layers.locator('input:visible');await input.fill(newName);await input.press('Enter')}
try{
 await open();await page.evaluate(name=>{const s=window.openPencil.getStore();s.state.autosaveEnabled=false;s.state.documentName=name},name)
 await draw('r',350,300,100,80);await draw('r',550,300,100,80)
 const canvas=page.locator('[data-test-id="canvas-element"]');await canvas.focus();await page.keyboard.press('Control+a');await page.keyboard.press('Shift+a')
 await expect.poll(async()=>(await snap())[0].layoutMode).toBe('HORIZONTAL')
 let scene=await snap();assert.equal(scene.length,1);assert.equal(scene[0].children.length,2)
 await page.getByRole('button',{name:'属性面板',exact:true}).click()
 await page.getByRole('button',{name:'垂直布局',exact:true}).click()
 await expect.poll(async()=>(await snap())[0].layoutMode).toBe('VERTICAL')
 scene=await snap();assert.equal(scene[0].children[0].x,scene[0].children[1].x);assert.ok(scene[0].children[1].y>scene[0].children[0].y)
 await canvas.focus();await page.keyboard.press('Control+z');await expect.poll(async()=>(await snap())[0].layoutMode).toBe('HORIZONTAL')
 await page.keyboard.press('Control+Shift+z');await expect.poll(async()=>(await snap())[0].layoutMode).toBe('VERTICAL')
 const gap=page.locator('[data-test-id="layout-gap-input"]')
 await gap.click();await page.locator('input:focus').fill('32');await page.keyboard.press('Enter')
 await expect.poll(async()=>(await snap())[0].itemSpacing).toBe(32)
 scene=await snap();assert.equal(scene[0].children[1].y-scene[0].children[0].y-scene[0].children[0].height,32)
 result.checks.push('real Shift+A wraps two drawn shapes; vertical layout and undo/redo update child geometry; gap field sets 32px')
 if(process.env.OS_CANVAS_LAYOUT_SIZING==='1') {
  for(const [testId,value] of [['layout-horizontal-padding-input',24],['layout-vertical-padding-input',16]]) {
   await page.locator(`[data-test-id="${testId}"]`).click();await page.locator('input:focus').fill(String(value));await page.keyboard.press('Enter')
  }
  scene=await snap();assert.equal(scene[0].paddingLeft,24);assert.equal(scene[0].paddingRight,24);assert.equal(scene[0].paddingTop,16);assert.equal(scene[0].paddingBottom,16)
  assert.equal(scene[0].width,148);assert.equal(scene[0].height,224)
  const width=page.locator('[data-property="width"]')
  await width.focus();await page.locator('input:focus').fill('300');await page.keyboard.press('Enter')
  await expect.poll(async()=>(await snap())[0].width).toBe(300)
  await canvas.focus();await page.keyboard.press('Enter')
  await page.locator('[data-test-id="layers-scroll"]').getByText('Rectangle 1',{exact:true}).click()
  await width.getByRole('combobox').click();await page.getByRole('option',{name:'填充',exact:true}).click()
  await expect.poll(async()=>(await snap())[0].children[0].width).toBe(252)
  await canvas.focus();await page.keyboard.press('Shift+Enter')
  await width.focus();await page.locator('input:focus').fill('360');await page.keyboard.press('Enter')
  await expect.poll(async()=>(await snap())[0].children[0].width).toBe(312)
  await canvas.focus();await page.keyboard.press('Control+z');await expect.poll(async()=>(await snap())[0].children[0].width).toBe(252)
  await page.keyboard.press('Control+Shift+z');await expect.poll(async()=>(await snap())[0].children[0].width).toBe(312)
  scene=await snap();result.checks.push('paired padding controls resize hug frame; child Fill follows fixed parent width 300 to 360, including undo/redo')
  await page.locator('[data-test-id="layers-scroll"]').getByText('Rectangle 2',{exact:true}).click()
  await canvas.focus();await page.keyboard.press('Shift+a')
  await expect.poll(async()=>(await snap())[0].children[1].type).toBe('FRAME')
  await page.keyboard.press('Enter')
  const height=page.locator('[data-property="height"]');await height.focus();await page.locator('input:focus').fill('120');await page.keyboard.press('Enter')
  await expect.poll(async()=>(await snap())[0].children[1].height).toBe(120)
  await expect.poll(async()=>(await snap())[0].height).toBe(264)
  await canvas.focus();await page.keyboard.press('Control+z');await expect.poll(async()=>(await snap())[0].height).toBe(224)
  await page.keyboard.press('Control+Shift+z');await expect.poll(async()=>(await snap())[0].height).toBe(264)
  scene=await snap();result.checks.push('nested Shift+A frame hugs resized child and propagates height to outer frame; undo/redo restores both levels')

 }
 if(process.env.OS_CANVAS_LAYOUT_DRAG==='1') {
  await canvas.focus();await page.keyboard.press('Shift+Enter')
  const before=await snap(),order=before[0].children.map(n=>n.name)
  const positions=await page.evaluate(()=>{
   const s=window.openPencil.getStore(),parent=s.graph.getChildren(s.state.currentPageId)[0],children=s.graph.getChildren(parent.id)
   const box=document.querySelector('[data-test-id="canvas-element"]').getBoundingClientRect()
   return children.map(n=>{const p=s.graph.getAbsolutePosition(n.id);return {x:box.x+(p.x+Math.min(n.width/2,50))*s.state.zoom+s.state.panX,y:box.y+(p.y+n.height/2)*s.state.zoom+s.state.panY}})
  })
  await canvas.focus();await page.mouse.move(positions[1].x,positions[1].y);await page.mouse.down();await page.mouse.move(positions[0].x,positions[0].y,{steps:16});await page.mouse.up()
  await expect.poll(async()=>(await snap())[0].children.map(n=>n.name)).toEqual([...order].reverse())
  scene=await snap();assert.equal(scene[0].height,before[0].height)
  await page.keyboard.press('Control+z');await expect.poll(snap).toEqual(before)
  await page.keyboard.press('Control+Shift+z');await expect.poll(snap).toEqual(scene)
  result.checks.push('real pointer drag of selected nested frame reverses parent item order; undo/redo restores exact geometry')
 }
 if(process.env.OS_CANVAS_LAYOUT_FLOW) {
  await page.getByRole('button',{name:'水平布局',exact:true}).click()
  const width=page.locator('[data-property="width"]');await width.focus();await page.locator('input:focus').fill('150');await page.keyboard.press('Enter')
  const before=await snap()
  if(process.env.OS_CANVAS_LAYOUT_FLOW==='wrap') {
   await page.getByRole('button',{name:'自动换行',exact:true}).click()
   await expect.poll(async()=>(await snap())[0].layoutWrap).toBe('WRAP')
   scene=await snap();assert.equal(scene[0].children[0].x,scene[0].children[1].x);assert.ok(scene[0].children[1].y>=scene[0].children[0].y+80)
  } else {
   await page.getByRole('button',{name:'网格布局',exact:true}).click()
   await expect.poll(async()=>(await snap())[0].layoutMode).toBe('GRID')
   scene=await snap();const [a,b]=scene[0].children;assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y)
  }
  await canvas.focus();await page.keyboard.press('Control+z');await expect.poll(snap).toEqual(before)
  await page.keyboard.press('Control+Shift+z');await expect.poll(snap).toEqual(scene)
  result.checks.push(`actual ${process.env.OS_CANVAS_LAYOUT_FLOW} control reflows two items without overlap; undo/redo restores exact layout`)
 }
 if(process.env.OS_CANVAS_GRID_POSITION==='1') {
  await page.locator('[data-property="height"]').focus();await page.locator('input:focus').fill('400');await page.keyboard.press('Enter')
  await page.getByRole('button',{name:'添加行',exact:true}).click()
  await canvas.focus();await page.keyboard.press('Enter')
  await page.locator('[data-test-id="layers-scroll"]').getByText('Rectangle 1',{exact:true}).click()
  const position=page.getByRole('region',{name:'网格子项位置',exact:true})
  async function setPosition(label,value){await position.getByRole('spinbutton',{name:label,exact:true}).click();await page.locator('input:focus').fill(String(value));await page.keyboard.press('Enter')}
  await setPosition('起始列',2)
  await expect.poll(async()=>(await snap())[0].children[0].x).toBe(100)
  await setPosition('起始行',2);await expect.poll(async()=>(await snap())[0].children[0].y).toBe(200)
  await setPosition('起始行',1);await setPosition('起始列',1);await setPosition('跨列数',2);await setPosition('跨行数',2)
  await page.locator('[data-property="width"]').getByRole('combobox').click();await page.getByRole('option',{name:'填充',exact:true}).click()
  await expect.poll(async()=>(await snap())[0].children[0].width).toBe(200)
  await page.locator('[data-property="height"]').getByRole('combobox').click();await page.getByRole('option',{name:'填充',exact:true}).click()
  await expect.poll(async()=>{const frame=(await snap())[0];return frame.children[0].height+frame.children[1].height}).toBe(400)
  const spanning=await snap();assert.equal(spanning[0].children[1].y,spanning[0].children[0].height);assert.ok(spanning[0].children[0].height>80)
  const placed=await snap()
  await position.getByRole('spinbutton',{name:'跨列数',exact:true}).click();await page.locator('input:focus').fill('1');await page.keyboard.press('Escape');await expect.poll(snap).toEqual(placed)
  await position.getByRole('button',{name:'恢复自动排列',exact:true}).click()
  await expect.poll(async()=>(await snap())[0].children[0].gridPosition).toBe(null)
  await canvas.focus();await page.keyboard.press('Control+z');await expect.poll(snap).toEqual(placed)
  scene=await snap();assert.deepEqual(scene[0].children[0].gridPosition,{column:1,row:1,columnSpan:2,rowSpan:2})
  await page.screenshot({path:resolve(out,'position-controls.png')})
  result.checks.push('actual one-based cell positioning moves child; two-column fill spans parent; reset automatic and undo preserve full position')
 }
 await page.getByRole('button',{name:'资产面板',exact:true}).click()
 await page.getByRole('button',{name:'保存到本机',exact:true}).click();await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000})
 await browser.close();await open();await page.getByRole('button',{name:'本机画布',exact:true}).click();await page.getByLabel('本机画布列表').getByRole('button',{name:new RegExp(`^${name} ·`)}).click();await expect.poll(snap).toEqual(scene)
 assert.equal(await page.evaluate(()=>window.openPencil.getStore().hasUnsavedChanges()),false)
 await page.screenshot({path:resolve(out,'restored.png')});result.checks.push('auto layout mode, gap and child geometry survive fresh browser reopen without dirty state')
 if(process.env.OS_CANVAS_LAYOUT_FLOW==='grid') {
  await page.locator('[data-test-id="layers-scroll"]').getByText('Frame',{exact:true}).click()
  await page.getByRole('button',{name:'属性面板',exact:true}).click()
  if(process.env.OS_CANVAS_GRID_TRACKS==='1') {
   await page.getByRole('button',{name:'添加列',exact:true}).click()
   await expect.poll(async()=>(await snap())[0].gridTemplateColumns.length).toBe(3)
   await page.getByRole('button',{name:'添加行',exact:true}).click()
   await expect.poll(async()=>(await snap())[0].gridTemplateRows.length).toBe(2)
   await page.getByRole('button',{name:'移除列',exact:true}).last().click()
   await expect.poll(async()=>(await snap())[0].gridTemplateColumns.length).toBe(2)
   await page.locator('[data-test-id="canvas-element"]').focus();await page.keyboard.press('Control+z')
   await expect.poll(async()=>(await snap())[0].gridTemplateColumns.length).toBe(3)
   await page.keyboard.press('Control+Shift+z');await expect.poll(async()=>(await snap())[0].gridTemplateColumns.length).toBe(2)
   await page.getByRole('combobox',{name:'列 1 调整大小',exact:true}).click()
   await page.getByRole('option',{name:'固定 (px)',exact:true}).click()
   await page.getByRole('spinbutton',{name:'C1',exact:true}).click();await page.locator('input:focus').fill('80');await page.keyboard.press('Enter')
   await expect.poll(async()=>(await snap())[0].gridTemplateColumns[0]).toEqual({sizing:'FIXED',value:80})
   await page.getByRole('spinbutton',{name:'C2',exact:true}).click();await page.locator('input:focus').fill('2');await page.keyboard.press('Enter')
   await expect.poll(async()=>(await snap())[0].gridTemplateColumns[1]).toEqual({sizing:'FR',value:2})
   await page.getByRole('combobox',{name:'行 1 调整大小',exact:true}).click();await page.getByRole('option',{name:'自动',exact:true}).click()
   await expect.poll(async()=>(await snap())[0].gridTemplateRows[0].sizing).toBe('AUTO')
   result.checks.push('real grid track add/remove/undo/redo and fixed 80px, proportional 2fr, auto track controls')
   const editedGrid=await snap()
   await page.getByRole('button',{name:'资产面板',exact:true}).click()
   await page.getByRole('button',{name:'保存到本机',exact:true}).click();await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000})
   await browser.close();await open();await page.getByRole('button',{name:'本机画布',exact:true}).click();await page.getByLabel('本机画布列表').getByRole('button',{name:new RegExp(`^${name} ·`)}).click();await expect.poll(snap).toEqual(editedGrid)
   await page.screenshot({path:resolve(out,'edited-grid-restored.png')})
   await page.locator('[data-test-id="layers-scroll"]').getByText('Frame',{exact:true}).click();await page.getByRole('button',{name:'属性面板',exact:true}).click()
   result.checks.push('edited mixed tracks persist while grid remains active in fresh browser, before final exit from grid')

  }
  if(process.env.OS_CANVAS_GRID_GAPS==='1') {
   for(const [label,value] of [['列 间距',18],['行 间距',22]]) {
    await page.getByRole('spinbutton',{name:label,exact:true}).click();await page.locator('input:focus').fill(String(value));await page.keyboard.press('Enter')
   }
   await expect.poll(async()=>(await snap())[0].gridColumnGap).toBe(18)
   await expect.poll(async()=>(await snap())[0].gridRowGap).toBe(22)
   await page.locator('[data-test-id="canvas-element"]').focus();await page.keyboard.press('Control+z');await expect.poll(async()=>(await snap())[0].gridRowGap).toBe(0)
   await page.keyboard.press('Control+Shift+z');await expect.poll(async()=>(await snap())[0].gridRowGap).toBe(22)
   result.checks.push('named grid gap controls edit column/row gaps after reopen, with row gap undo/redo')
  }
  await page.getByRole('button',{name:'水平布局',exact:true}).click()
  await expect.poll(async()=>(await snap())[0].layoutMode).toBe('HORIZONTAL')
  scene=await snap()
  if(process.env.OS_CANVAS_GRID_TRACE==='1')result.gridTrace=await page.evaluate(async()=>{
   const s=window.openPencil.getStore(),node=s.graph.getChildren(s.state.currentPageId)[0]
   const {sceneNodeToKiwi}=await import('/packages/fig/src/node-change/serialize.ts')
   const nc=sceneNodeToKiwi(node,{sessionID:1,localID:1},0,{value:2},s.graph,[])[0]
   const {archiveBaseline}=await import('/packages/core/src/kiwi/fig/session/archive-changes.ts')
   const baseline=archiveBaseline(s.graph),prior=baseline?.before.get(node.id)
   return {baseline:prior?{mode:prior.layoutMode,pluginData:prior.pluginData}:null,mode:node.layoutMode,source:node.source,pluginData:node.pluginData,exported:{stackMode:nc.stackMode,pluginData:nc.pluginData}}
  })
  await page.getByRole('button',{name:'资产面板',exact:true}).click()
  await page.getByRole('button',{name:'保存到本机',exact:true}).click();await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000})
  await browser.close();await open();await page.getByRole('button',{name:'本机画布',exact:true}).click();await page.getByLabel('本机画布列表').getByRole('button',{name:new RegExp(`^${name} ·`)}).click();await expect.poll(snap).toEqual(scene)
  result.checks.push('leaving grid after reopen and saving again does not resurrect stale grid mode or settings')
 }
 assert.deepEqual(result.errors,[]);result.status='passed'
}catch(e){result.status='failed';result.error=e.stack;await page?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});throw e}finally{await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2));await browser?.close()}
