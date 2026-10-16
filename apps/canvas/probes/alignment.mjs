import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const {chromium,expect}=createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const out=resolve(process.env.OS_CANVAS_EVIDENCE_DIR??'output/dev-evidence/canvas-c06/constraints'),base=process.env.OS_CANVAS_TEST_URL??'http://localhost:24650'
await mkdir(out,{recursive:true})
const name=`C06 alignment ${Date.now()}`,result={name,base,checks:[],errors:[]};let browser,page
async function open(){browser=await chromium.launch({channel:'msedge'});page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>result.errors.push(e.message));page.on('response',async r=>{if(r.request().method()==='POST'&&r.url().includes('/canvases/')){try{(result.saves??=[]).push(await r.json())}catch{}}});await page.goto(`${base}/?test&os-canvas&no-rulers`);await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({timeout:60000});await page.locator('#loader').waitFor({state:'detached'})}
async function snap(){return page.evaluate(()=>{const s=window.openPencil.getStore();const visit=id=>s.graph.getChildren(id).map(n=>({type:n.type,name:n.name,horizontalConstraint:n.horizontalConstraint,verticalConstraint:n.verticalConstraint,visible:n.visible,locked:n.locked,clipsContent:n.clipsContent,layoutMode:n.layoutMode,layoutWrap:n.layoutWrap,gridTemplateColumns:n.gridTemplateColumns,gridTemplateRows:n.gridTemplateRows,gridColumnGap:n.gridColumnGap,gridRowGap:n.gridRowGap,gridPosition:n.gridPosition,itemSpacing:n.itemSpacing,paddingLeft:n.paddingLeft,paddingRight:n.paddingRight,paddingTop:n.paddingTop,paddingBottom:n.paddingBottom,primaryAxisSizing:n.primaryAxisSizing,counterAxisSizing:n.counterAxisSizing,layoutSizingHorizontal:n.layoutSizingHorizontal,x:n.x,y:n.y,width:n.width,height:n.height,children:visit(n.id)}));return visit(s.state.currentPageId)})}
async function draw(key,x,y,w,h){await page.keyboard.press(key);await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+w,y+h,{steps:12});await page.mouse.up();await page.keyboard.press('Escape')}
async function rename(oldName,newName){const layers=page.locator('[data-test-id="layers-scroll"]');await layers.getByText(oldName,{exact:true}).dblclick();const input=layers.locator('input:visible');await input.fill(newName);await input.press('Enter')}

async function selectName(name){await page.evaluate(name=>{const s=window.openPencil.getStore();const n=[...s.graph.nodes.values()].find(n=>n.name===name);if(!n)throw Error(name);s.select([n.id])},name)}
async function size(prop,value){await page.locator('[data-property="'+prop+'"]').focus();await page.locator('input:focus').fill(String(value));await page.keyboard.press('Enter')}

try{
 await open()
 await page.evaluate(name=>{const s=window.openPencil.getStore();s.state.autosaveEnabled=false;s.state.documentName=name;const nodes=[[350,250,40,50],[450,350,60,70],[650,500,80,90]].map(([x,y,width,height],i)=>s.graph.createNode('RECTANGLE',s.state.currentPageId,{name:'Align '+i,x,y,width,height,fills:[{type:'SOLID',color:{r:0.8,g:0.4,b:0.2,a:1},opacity:1,visible:true}]}));s.select(nodes.map(n=>n.id));s.requestRender()},name)
 await page.getByRole('button',{name:'属性面板',exact:true}).click()
 const original=await snap(),canvas=page.locator('[data-test-id="canvas-element"]')
 const cases=[['左对齐','x',[350,350,350]],['水平居中','x',[520,510,500]],['右对齐','x',[690,670,650]],['顶部对齐','y',[250,250,250]],['垂直居中','y',[395,385,375]],['底部对齐','y',[540,520,500]]]
 for(const [label,axis,values] of cases){
  await page.getByRole('button',{name:label,exact:true}).click()
  await expect.poll(async()=>(await snap()).map(n=>n[axis])).toEqual(values)
  const aligned=await snap()
  await canvas.focus();await page.keyboard.press('Control+z');await expect.poll(snap).toEqual(original)
  await page.keyboard.press('Control+Shift+z');await expect.poll(snap).toEqual(aligned)
  await page.keyboard.press('Control+z');await expect.poll(snap).toEqual(original)
  result.checks.push(label+' actual UI, exact mixed-size geometry, one-step undo and redo')
 }

 for(const [label,axis,values] of [['水平等距分布','x',[350,490,650]],['垂直等距分布','y',[250,365,500]]]){
  await page.getByRole('menuitem',{name:'排列',exact:true}).click()
  await page.getByRole('menuitem',{name:label,exact:true}).click()
  await expect.poll(async()=>(await snap()).map(n=>n[axis])).toEqual(values)
  const distributed=await snap()
  await canvas.focus();await page.keyboard.press('Control+z');await expect.poll(snap).toEqual(original)
  await page.keyboard.press('Control+Shift+z');await expect.poll(snap).toEqual(distributed)
  await page.keyboard.press('Control+z');await expect.poll(snap).toEqual(original)
  result.checks.push(label+' real menu uses equal edge gaps for unequal sizes, with undo/redo')
 }
 await page.getByRole('button',{name:'顶部对齐',exact:true}).click()
 await page.getByRole('menuitem',{name:'排列',exact:true}).click();await page.getByRole('menuitem',{name:'水平等距分布',exact:true}).click()
 await expect.poll(async()=>(await snap()).map(n=>[n.x,n.y])).toEqual([[350,250],[490,250],[650,250]])
 const scene=await snap()
 await page.getByRole('button',{name:'资产面板',exact:true}).click();await page.getByRole('button',{name:'保存到本机',exact:true}).click();await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000})
 await browser.close();await open();await page.getByRole('button',{name:'本机画布',exact:true}).click();await page.getByLabel('本机画布列表').getByRole('button',{name:new RegExp('^'+name+' ·')}).click();await expect.poll(snap).toEqual(scene)
 await page.screenshot({path:resolve(out,'restored.png')})
 result.checks.push('aligned and distributed objects persist across actual save and fresh browser reopen')
 assert.deepEqual(result.errors,[]);result.status='passed'
}catch(e){result.status='failed';result.error=e.stack;await page?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});throw e}finally{await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2));await browser?.close()}
