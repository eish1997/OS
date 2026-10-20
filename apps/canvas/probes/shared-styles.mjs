import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const {chromium,expect}=createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const out=resolve(process.env.OS_CANVAS_EVIDENCE_DIR??'output/dev-evidence/canvas-c06/shared-styles'),base=process.env.OS_CANVAS_TEST_URL??'http://localhost:24650'
await mkdir(out,{recursive:true})
const name=`C06 shared styles ${Date.now()}`,result={name,base,checks:[],errors:[]};let browser,page
async function open(){browser=await chromium.launch({channel:'msedge'});page=await browser.newPage({viewport:{width:1440,height:900}});page.on('console',m=>{if(m.type()==='error')(result.consoleErrors??=[]).push(m.text())});page.on('pageerror',e=>result.errors.push(e.message));page.on('response',async r=>{if(r.request().method()==='POST'&&r.url().includes('/canvases/')){try{(result.saves??=[]).push(await r.json())}catch{}}});await page.goto(`${base}/?test&os-canvas&no-rulers`);await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({timeout:60000});await page.locator('#loader').waitFor({state:'detached'})}
async function snap(){return page.evaluate(()=>{const s=window.openPencil.getStore();const visit=id=>s.graph.getChildren(id).map(n=>({type:n.type,name:n.name,componentName:n.type==='INSTANCE'&&n.componentId?s.graph.getNode(n.componentId)?.name:null,horizontalConstraint:n.horizontalConstraint,verticalConstraint:n.verticalConstraint,visible:n.visible,locked:n.locked,clipsContent:n.clipsContent,layoutMode:n.layoutMode,layoutWrap:n.layoutWrap,gridTemplateColumns:n.gridTemplateColumns,gridTemplateRows:n.gridTemplateRows,gridColumnGap:n.gridColumnGap,gridRowGap:n.gridRowGap,gridPosition:n.gridPosition,itemSpacing:n.itemSpacing,paddingLeft:n.paddingLeft,paddingRight:n.paddingRight,paddingTop:n.paddingTop,paddingBottom:n.paddingBottom,primaryAxisSizing:n.primaryAxisSizing,counterAxisSizing:n.counterAxisSizing,layoutSizingHorizontal:n.layoutSizingHorizontal,x:n.x,y:n.y,width:n.width,height:n.height,children:visit(n.id)}));return visit(s.state.currentPageId)})}
async function draw(key,x,y,w,h){await page.keyboard.press(key);await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+w,y+h,{steps:12});await page.mouse.up();await page.keyboard.press('Escape')}
async function rename(oldName,newName){const layers=page.locator('[data-test-id="layers-scroll"]');await layers.getByText(oldName,{exact:true}).dblclick();const input=layers.locator('input:visible');await input.fill(newName);await input.press('Enter')}

async function selectName(name){await page.evaluate(name=>{const s=window.openPencil.getStore();const n=[...s.graph.nodes.values()].find(n=>n.name===name);if(!n)throw Error(name);s.select([n.id])},name)}
async function size(prop,value){await page.locator('[data-property="'+prop+'"]').focus();await page.locator('input:focus').fill(String(value));await page.keyboard.press('Enter')}


async function tokens(){return page.evaluate(()=>{const s=window.openPencil.getStore();return [...s.graph.variableCollections.values()].map(c=>({name:c.name,modes:c.modes.map(m=>m.name),variables:c.variableIds.map(id=>s.graph.variables.get(id)).filter(Boolean).map(v=>({name:v.name,type:v.type,values:c.modes.map(m=>v.valuesByMode[m.modeId])}))}))})}
async function styles(){return page.evaluate(()=>{const s=window.openPencil.getStore(),all=[...s.graph.nodes.values()];const fills=n=>n.fills.map(f=>({...f,blendMode:f.blendMode??'NORMAL',color:Object.fromEntries(Object.entries(f.color).map(([k,v])=>[k,Math.fround(v)]))}));return {definitions:all.filter(n=>n.sharedStyleType).map(n=>({name:n.name,type:n.sharedStyleType,fills:fills(n)})),objects:s.graph.getChildren(s.state.currentPageId).filter(n=>!n.internalOnly).map(n=>({name:n.name,fills:fills(n),style:all.find(d=>d.sharedStyleType&&d.source.id===n.fillStyleId)?.name??n.fillStyleId}))}})}
async function choose(label){await page.getByRole('combobox',{name:'填充样式',exact:true}).click();await page.getByRole('option',{name:label,exact:true}).click()}
try{
 await open();await page.evaluate(name=>{const s=window.openPencil.getStore();s.state.documentName=name;s.state.autosaveEnabled=false},name)
 await page.locator('[data-test-id="canvas-element"]').focus();await draw('r',400,300,120,80);await draw('r',650,300,120,80)
 await page.mouse.click(450,340);await page.getByRole('button',{name:'属性面板',exact:true}).click()
 await page.locator('[data-property="color-hex"]').fill('FF0000');await page.locator('[data-property="color-hex"]').press('Tab')
 await expect.poll(async()=>(await styles()).objects[0].fills[0].color).toEqual({r:1,g:0,b:0,a:1})
 const before=await styles()
 await choose('从当前对象创建样式')
 await expect.poll(async()=>(await styles()).definitions.length).toBe(1)
 const created=await styles();assert.equal(created.objects[0].style,created.definitions[0].name)
 await page.locator('[data-test-id="canvas-element"]').focus();await page.keyboard.press('Control+z');await expect.poll(styles).toEqual(before)
 await page.keyboard.press('Control+Shift+z');await expect.poll(styles).toEqual(created)
 await page.mouse.click(700,340);await choose(created.definitions[0].name)
 await expect.poll(async()=>(await styles()).objects.map(n=>n.style)).toEqual([created.definitions[0].name,created.definitions[0].name])
 await expect.poll(async()=>(await styles()).objects.map(n=>n.fills[0].color)).toEqual([{r:1,g:0,b:0,a:1},{r:1,g:0,b:0,a:1}])
 let linked=await styles()
 if(process.env.OS_CANVAS_MULTI_FILL==='1'){
  await page.evaluate(()=>window.openPencil.getStore().select([]))
  await page.getByRole('button',{name:'添加样式填充',exact:true}).click()
  await page.getByRole('textbox',{name:'填充 2 颜色',exact:true}).fill('0000FF')
  await page.getByRole('spinbutton',{name:'填充 2 透明度',exact:true}).fill('50')
  await page.getByRole('button',{name:'保存样式修改',exact:true}).click()
  await expect.poll(async()=>(await styles()).objects.map(n=>n.fills.map(f=>[f.color.r,f.color.g,f.color.b,f.opacity]))).toEqual([[[1,0,0,1],[0,0,1,0.5]],[[1,0,0,1],[0,0,1,0.5]]])
  await page.getByRole('button',{name:'上移填充 2',exact:true}).click();await page.getByRole('button',{name:'保存样式修改',exact:true}).click()
  await expect.poll(async()=>(await styles()).objects.map(n=>n.fills[0].color.b)).toEqual([1,1])
  const reordered=await styles()
  await page.getByRole('checkbox',{name:'填充 1 可见',exact:true}).uncheck();await page.getByRole('button',{name:'保存样式修改',exact:true}).click()
  await expect.poll(async()=>(await styles()).objects.map(n=>n.fills[0].visible)).toEqual([false,false])
  await page.locator('[data-test-id="canvas-element"]').focus();await page.keyboard.press('Control+z');await expect.poll(styles).toEqual(reordered)
  await page.getByRole('button',{name:'删除填充 2',exact:true}).click();await page.getByRole('button',{name:'保存样式修改',exact:true}).click()
  await expect.poll(async()=>(await styles()).objects.map(n=>n.fills.length)).toEqual([1,1])
  await page.locator('[data-test-id="canvas-element"]').focus();await page.keyboard.press('Control+z');await expect.poll(styles).toEqual(reordered)
  await page.getByRole('spinbutton',{name:'填充 1 透明度',exact:true}).fill('101');await page.getByRole('button',{name:'保存样式修改',exact:true}).click()
  await expect(page.locator('[data-test-id="shared-styles-editor"] [role="alert"]')).toContainText('0–100');assert.deepEqual(await styles(),reordered)
  await page.getByRole('spinbutton',{name:'填充 1 透明度',exact:true}).fill('50');await page.getByRole('button',{name:'保存样式修改',exact:true}).click()
  result.beforeMultiSave=await styles();await expect.poll(styles).toEqual(reordered)
  linked=reordered
  result.checks.push('multi-fill actual add, color/opacity, reorder, visibility, delete, undo and invalid opacity rejection propagate to both shapes')
 }
 if(process.env.OS_CANVAS_STYLE_EDIT==='1'){
  await page.evaluate(()=>window.openPencil.getStore().select([]))
  const panel=page.locator('[data-test-id="shared-styles-editor"]')
  await panel.getByRole('textbox',{name:'样式名称',exact:true}).fill('Brand/Primary')
  await panel.getByRole('textbox',{name:'样式颜色',exact:true}).fill('0000FF')
  await panel.getByRole('button',{name:'保存样式修改',exact:true}).click()
  await expect.poll(async()=>(await styles()).objects.map(n=>({style:n.style,color:n.fills[0].color}))).toEqual([{style:'Brand/Primary',color:{r:0,g:0,b:1,a:1}},{style:'Brand/Primary',color:{r:0,g:0,b:1,a:1}}])
  const changed=await styles()
  await page.locator('[data-test-id="canvas-element"]').focus();await page.keyboard.press('Control+z');await expect.poll(styles).toEqual(linked)
  await page.keyboard.press('Control+Shift+z');await expect.poll(styles).toEqual(changed)
  await panel.getByRole('textbox',{name:'样式颜色',exact:true}).fill('BAD')
  await panel.getByRole('button',{name:'保存样式修改',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('六位');assert.deepEqual(await styles(),changed)
  await panel.getByRole('textbox',{name:'样式颜色',exact:true}).fill('0000FF');await panel.getByRole('button',{name:'保存样式修改',exact:true}).click();await expect(panel.getByRole('alert')).toHaveCount(0)
  if(process.env.OS_CANVAS_STYLE_FAULT==='1'){
   await panel.getByRole('textbox',{name:'样式颜色',exact:true}).fill('00FF00')
   await page.evaluate(()=>{const s=window.openPencil.getStore();window.__styleLayout=s.runLayoutForNode;s.runLayoutForNode=()=>{throw Error('style-layout-fault')}})
   await panel.getByRole('button',{name:'保存样式修改',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('style-layout-fault');await expect.poll(styles).toEqual(changed)
   await page.evaluate(()=>{window.openPencil.getStore().runLayoutForNode=window.__styleLayout;delete window.__styleLayout})
   await panel.getByRole('textbox',{name:'样式颜色',exact:true}).fill('0000FF');await panel.getByRole('button',{name:'保存样式修改',exact:true}).click();await expect(panel.getByRole('alert')).toHaveCount(0)
   result.checks.push('injected layout failure restores style and both references, exposes error, allows retry')
  }
  linked=changed
  result.checks.push('actual shared-style editor renames and changes color on both references; one undo/redo restores definition and users; invalid color rejected without mutation')
 }
 result.checks.push('real UI creates style from rectangle, undo removes definition/reference, redo restores; second rectangle applies same style')
 await page.getByRole('button',{name:'资产面板',exact:true}).click();await page.getByRole('button',{name:'保存到本机',exact:true}).click();await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000})
 await browser.close();await open();await page.getByRole('button',{name:'本机画布',exact:true}).click();await page.getByLabel('本机画布列表').getByRole('button',{name:new RegExp('^'+name+' ·')}).click();await expect.poll(styles).toEqual(linked)
 await page.getByRole('button',{name:'属性面板',exact:true}).click()
 if(process.env.OS_CANVAS_STYLE_EDIT==='1'){
  await page.evaluate(()=>window.openPencil.getStore().select([]))
  const panel=page.locator('[data-test-id="shared-styles-editor"]')
  await panel.getByRole('textbox',{name:'样式颜色',exact:true}).fill('00FF00');await panel.getByRole('button',{name:'保存样式修改',exact:true}).click()
  await expect.poll(async()=>(await styles()).objects.map(n=>n.fills[0].color)).toEqual([{r:0,g:1,b:0,a:1},{r:0,g:1,b:0,a:1}])
  result.checks.push('editing the restored definition still updates both linked shapes')
  await page.screenshot({path:resolve(out,'style-editor.png')})
 }
 await page.mouse.click(700,340)
 await page.screenshot({path:resolve(out,'restored.png')})
 if(process.env.OS_CANVAS_MULTI_FILL==='1'){await page.evaluate(()=>window.openPencil.getStore().select([]));await page.locator('[data-test-id="shared-styles-editor"]').waitFor();await page.screenshot({path:resolve(out,'multi-fill-editor.png')})}
 result.checks.push('new local style definition and two references survive real disk save and fresh browser restore')
 assert.deepEqual(result.errors,[]);assert.deepEqual(result.consoleErrors??[],[]);result.status='passed'
}catch(e){result.status='failed';result.error=e.stack;await page?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});throw e}finally{await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2));await browser?.close()}
