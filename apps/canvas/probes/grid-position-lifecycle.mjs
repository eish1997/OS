import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const {chromium,expect}=createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const out=resolve(process.env.OS_CANVAS_EVIDENCE_DIR??'output/dev-evidence/canvas-c06/grid-position-lifecycle'),base=process.env.OS_CANVAS_TEST_URL??'http://localhost:24650'
await mkdir(out,{recursive:true})
const name=`C06 auto layout ${Date.now()}`,result={name,base,checks:[],errors:[]};let browser,page
async function open(){browser=await chromium.launch({channel:'msedge'});page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>result.errors.push(e.message));page.on('response',async r=>{if(r.request().method()==='POST'&&r.url().includes('/canvases/')){try{(result.saves??=[]).push(await r.json())}catch{}}});await page.goto(`${base}/?test&os-canvas&no-rulers`);await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({timeout:60000});await page.locator('#loader').waitFor({state:'detached'})}
async function snap(){return page.evaluate(()=>{const s=window.openPencil.getStore();const visit=id=>s.graph.getChildren(id).map(n=>({type:n.type,name:n.name,visible:n.visible,locked:n.locked,clipsContent:n.clipsContent,layoutMode:n.layoutMode,layoutWrap:n.layoutWrap,gridTemplateColumns:n.gridTemplateColumns,gridTemplateRows:n.gridTemplateRows,gridColumnGap:n.gridColumnGap,gridRowGap:n.gridRowGap,gridPosition:n.gridPosition,itemSpacing:n.itemSpacing,paddingLeft:n.paddingLeft,paddingRight:n.paddingRight,paddingTop:n.paddingTop,paddingBottom:n.paddingBottom,primaryAxisSizing:n.primaryAxisSizing,counterAxisSizing:n.counterAxisSizing,layoutSizingHorizontal:n.layoutSizingHorizontal,x:n.x,y:n.y,width:n.width,height:n.height,children:visit(n.id)}));return visit(s.state.currentPageId)})}
async function draw(key,x,y,w,h){await page.keyboard.press(key);await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+w,y+h,{steps:12});await page.mouse.up();await page.keyboard.press('Escape')}
async function rename(oldName,newName){const layers=page.locator('[data-test-id="layers-scroll"]');await layers.getByText(oldName,{exact:true}).dblclick();const input=layers.locator('input:visible');await input.fill(newName);await input.press('Enter')}
try{
 await open();await page.evaluate(()=>{const s=window.openPencil.getStore();s.state.autosaveEnabled=false;const f=s.createShape('FRAME',350,250,300,300);s.updateNode(f,{layoutMode:'GRID',gridTemplateColumns:[{sizing:'FR',value:1},{sizing:'FR',value:1}],gridTemplateRows:[{sizing:'FR',value:1}]});const a=s.graph.createNode('RECTANGLE',f,{name:'A',width:50,height:50});const b=s.graph.createNode('RECTANGLE',f,{name:'B',width:50,height:50});window.gridIds={f,a:a.id,b:b.id};s.select([a.id]);s.requestRender()})
 await page.getByRole('button',{name:'属性面板',exact:true}).click()
 const panel=page.getByRole('region',{name:'网格子项位置',exact:true})
 await expect(panel).toBeVisible()
 await page.evaluate(()=>{const s=window.openPencil.getStore();s.setLayoutPositioning([window.gridIds.a],'ABSOLUTE')})
 await expect(panel).toBeHidden()
 await page.evaluate(()=>{const s=window.openPencil.getStore();s.setLayoutPositioning([window.gridIds.a],'AUTO')})
 await expect(panel).toBeVisible()
 await page.evaluate(()=>window.openPencil.getStore().setLayoutMode(window.gridIds.f,'HORIZONTAL'))
 await expect(panel).toBeHidden()
 await page.evaluate(()=>window.openPencil.getStore().setLayoutMode(window.gridIds.f,'GRID'))
 await expect(panel).toBeVisible()
 result.checks.push('public editor parent mode and absolute-position changes update visible controls without reselecting child')
 await panel.getByRole('spinbutton',{name:'起始列',exact:true}).click();await page.locator('input:focus').fill('2')
 await page.evaluate(()=>window.openPencil.getStore().select([window.gridIds.b]))
 await expect.poll(()=>page.evaluate(()=>window.openPencil.getStore().graph.getNode(window.gridIds.a).gridPosition)).toBe(null)
 await panel.getByRole('spinbutton',{name:'起始列',exact:true}).click();await page.locator('input:focus').fill('2');await page.keyboard.press('Enter')
 await expect.poll(()=>page.evaluate(()=>window.openPencil.getStore().graph.getNode(window.gridIds.b).gridPosition?.column)).toBe(2)
 result.checks.push('selection change cancels previous target edit and next field edit applies only to newly selected node')
 assert.deepEqual(result.errors,[]);result.status='passed'
}catch(e){result.status='failed';result.error=e.stack;await page?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});throw e}finally{await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2));await browser?.close()}
