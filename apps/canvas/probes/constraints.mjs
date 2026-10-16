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
 await page.evaluate(name=>{const s=window.openPencil.getStore();s.state.autosaveEnabled=false;s.state.documentName=name;const f=s.graph.createNode('FRAME',s.state.currentPageId,{name:'Constraint frame',x:350,y:250,width:200,height:200});for(const name of ['Pinned','Stretch','Scale','Center','Default'])s.graph.createNode('RECTANGLE',f.id,{name,x:20,y:30,width:40,height:50});s.select([f.id]);s.requestRender()},name)
 await page.getByRole('button',{name:'属性面板',exact:true}).click()
 const section=page.locator('[data-property="constraints"]')
 await expect(section).toBeHidden()
 for(const [target,h,v] of [['Pinned','右侧','底部'],['Stretch','左右','上下'],['Scale','缩放','缩放'],['Center','居中','居中']]){
  await selectName(target);await expect(section).toBeVisible()
  for(const [axis,label] of [['水平约束',h],['垂直约束',v]]){await section.getByRole('combobox',{name:axis,exact:true}).click();await page.getByRole('option',{name:label,exact:true}).click()}
 }
 const original=await snap();result.original=original
 await selectName('Constraint frame')
 await page.locator('[data-property="width"]').focus()
 await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowUp')
 await expect.poll(async()=>(await snap())[0].width).toBe(202)
 await expect.poll(async()=>(await snap())[0].children.find(n=>n.name==='Pinned').x).toBe(22)
 await page.keyboard.press('Escape');await expect.poll(snap).toEqual(original)
 result.checks.push('actual focused width field repeated ArrowUp previews child constraints; Escape restores full scene')
 await size('width',400);await size('height',400)
 await expect.poll(async()=>{const f=(await snap())[0];return [f.width,f.height]}).toEqual([400,400])
 result.afterResize=await snap()
 assert.deepEqual(Object.fromEntries(result.afterResize[0].children.map(n=>[n.name,[n.horizontalConstraint,n.verticalConstraint]])),{Pinned:['MAX','MAX'],Stretch:['STRETCH','STRETCH'],Scale:['SCALE','SCALE'],Center:['CENTER','CENTER'],Default:['MIN','MIN']})
 const expected={Pinned:[220,230,40,50],Stretch:[20,30,240,250],Scale:[40,60,80,100],Center:[120,130,40,50],Default:[20,30,40,50]}
 await expect.poll(async()=>Object.fromEntries((await snap())[0].children.map(n=>[n.name,[n.x,n.y,n.width,n.height]]))).toEqual(expected)
 const resized=await snap()
 result.checks.push('actual constraint selectors and parent width/height fields: MIN/MAX/CENTER/STRETCH/SCALE on both axes')
 await page.locator('[data-test-id="canvas-element"]').focus();await page.keyboard.press('Control+z');await page.keyboard.press('Control+z');await expect.poll(snap).toEqual(original)
 await page.keyboard.press('Control+Shift+z');await page.keyboard.press('Control+Shift+z');await expect.poll(snap).toEqual(resized)
 result.checks.push('parent resize undo/redo restores every child geometry and constraint')
 await page.getByRole('button',{name:'资产面板',exact:true}).click();await page.getByRole('button',{name:'保存到本机',exact:true}).click();await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000})
 await browser.close();await open();await page.getByRole('button',{name:'本机画布',exact:true}).click();await page.getByLabel('本机画布列表').getByRole('button',{name:new RegExp('^'+name+' ·')}).click();await expect.poll(snap).toEqual(resized)
 await selectName('Constraint frame');await page.getByRole('button',{name:'属性面板',exact:true}).click();await size('width',200);await size('height',200);await expect.poll(snap).toEqual(original)
 result.checks.push('fresh browser reload preserves constraints and resizing back applies them to imported nodes')
 await page.screenshot({path:resolve(out,'restored.png')})
 assert.deepEqual(result.errors,[]);result.status='passed'
}catch(e){result.status='failed';result.error=e.stack;await page?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});throw e}finally{await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2));await browser?.close()}
