import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const {chromium,expect}=createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const out=resolve(process.env.OS_CANVAS_EVIDENCE_DIR??'output/dev-evidence/canvas-c06/text-styles'),base=process.env.OS_CANVAS_TEST_URL??'http://localhost:24650'
await mkdir(out,{recursive:true})
const name=`C06 text styles ${Date.now()}`,result={name,base,checks:[],errors:[]};let browser,page
async function open(){browser=await chromium.launch({channel:'msedge'});page=await browser.newPage({viewport:{width:1440,height:900}});page.on('console',m=>{if(m.type()==='error')(result.consoleErrors??=[]).push(m.text())});page.on('pageerror',e=>result.errors.push(e.message));page.on('response',async r=>{if(r.request().method()==='POST'&&r.url().includes('/canvases/')){try{(result.saves??=[]).push(await r.json())}catch{}}});await page.goto(`${base}/?test&os-canvas&no-rulers`);await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({timeout:60000});await page.locator('#loader').waitFor({state:'detached'})}
async function snap(){return page.evaluate(()=>{const s=window.openPencil.getStore();const visit=id=>s.graph.getChildren(id).map(n=>({type:n.type,name:n.name,componentName:n.type==='INSTANCE'&&n.componentId?s.graph.getNode(n.componentId)?.name:null,horizontalConstraint:n.horizontalConstraint,verticalConstraint:n.verticalConstraint,visible:n.visible,locked:n.locked,clipsContent:n.clipsContent,layoutMode:n.layoutMode,layoutWrap:n.layoutWrap,gridTemplateColumns:n.gridTemplateColumns,gridTemplateRows:n.gridTemplateRows,gridColumnGap:n.gridColumnGap,gridRowGap:n.gridRowGap,gridPosition:n.gridPosition,itemSpacing:n.itemSpacing,paddingLeft:n.paddingLeft,paddingRight:n.paddingRight,paddingTop:n.paddingTop,paddingBottom:n.paddingBottom,primaryAxisSizing:n.primaryAxisSizing,counterAxisSizing:n.counterAxisSizing,layoutSizingHorizontal:n.layoutSizingHorizontal,x:n.x,y:n.y,width:n.width,height:n.height,children:visit(n.id)}));return visit(s.state.currentPageId)})}
async function draw(key,x,y,w,h){await page.keyboard.press(key);await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+w,y+h,{steps:12});await page.mouse.up();await page.keyboard.press('Escape')}
async function rename(oldName,newName){const layers=page.locator('[data-test-id="layers-scroll"]');await layers.getByText(oldName,{exact:true}).dblclick();const input=layers.locator('input:visible');await input.fill(newName);await input.press('Enter')}

async function selectName(name){await page.evaluate(name=>{const s=window.openPencil.getStore();const n=[...s.graph.nodes.values()].find(n=>n.name===name);if(!n)throw Error(name);s.select([n.id])},name)}
async function size(prop,value){await page.locator('[data-property="'+prop+'"]').focus();await page.locator('input:focus').fill(String(value));await page.keyboard.press('Enter')}


async function tokens(){return page.evaluate(()=>{const s=window.openPencil.getStore();return [...s.graph.variableCollections.values()].map(c=>({name:c.name,modes:c.modes.map(m=>m.name),variables:c.variableIds.map(id=>s.graph.variables.get(id)).filter(Boolean).map(v=>({name:v.name,type:v.type,values:c.modes.map(m=>v.valuesByMode[m.modeId])}))}))})}
async function styles(){return page.evaluate(()=>{const s=window.openPencil.getStore(),all=[...s.graph.nodes.values()];const fields=n=>({name:n.name,text:n.text,fontFamily:n.fontFamily,fontSize:n.fontSize,fontWeight:n.fontWeight,lineHeight:n.lineHeight,letterSpacing:n.letterSpacing,fontFeatures:n.fontFeatures,style:all.find(d=>d.sharedStyleType&&d.source.id===n.textStyleId)?.name??n.textStyleId});return {definitions:all.filter(n=>n.sharedStyleType==='TEXT').map(fields),objects:s.graph.getChildren(s.state.currentPageId).filter(n=>!n.internalOnly).map(fields)}})}
async function choose(label){await page.getByRole('combobox',{name:'文本样式',exact:true}).click();await page.getByRole('option',{name:label,exact:true}).click()}
async function configure(size){const panel=page.locator('[data-test-id="shared-styles-editor"]');await panel.getByRole('textbox',{name:'样式名称',exact:true}).fill('Type/Heading');for(const [label,value] of [['字号',size],['字重',700],['行高（空白为自动）',48],['字间距',2]])await panel.getByRole('spinbutton',{name:'样式'+label,exact:true}).fill(String(value));await panel.getByRole('button',{name:'保存样式修改',exact:true}).click()}
try{
 await open();await page.evaluate(name=>{const s=window.openPencil.getStore();s.state.documentName=name;s.state.autosaveEnabled=false;for(const [i,text] of ['Shared heading','Linked heading'].entries())s.graph.createNode('TEXT',s.state.currentPageId,{name:'Text '+i,text,x:350,y:250+i*130,width:400,height:70,fontFamily:'Inter',fontSize:24,fontWeight:400,fontFeatures:[{tag:'LIGA',enabled:i===1},{tag:'CALT',enabled:true}],fills:[{type:'SOLID',color:{r:1,g:1,b:1,a:1},opacity:1,visible:true}]});s.select([s.graph.getChildren(s.state.currentPageId)[0].id]);s.requestRender()},name)
 await page.getByRole('button',{name:'属性面板',exact:true}).click();await choose('从当前对象创建样式')
 await expect.poll(async()=>(await styles()).definitions.length).toBe(1)
 const title=(await styles()).definitions[0].name
 await selectName('Text 1');await choose(title)
 await page.evaluate(()=>window.openPencil.getStore().select([]))
 const before=await styles();await configure(36)
 await expect.poll(async()=>(await styles()).objects.map(n=>[n.fontSize,n.fontWeight,n.lineHeight,n.letterSpacing,n.style])).toEqual([[36,700,48,2,'Type/Heading'],[36,700,48,2,'Type/Heading']])
 const edited=await styles()
 assert.deepEqual(edited.objects.map(n=>n.fontFeatures),[[{tag:'LIGA',enabled:false},{tag:'CALT',enabled:true}],[{tag:'LIGA',enabled:false},{tag:'CALT',enabled:true}]])
 await page.locator('[data-test-id="canvas-element"]').focus();await page.keyboard.press('Control+z');await expect.poll(styles).toEqual(before)
 await page.keyboard.press('Control+Shift+z');await expect.poll(styles).toEqual(edited)
 await configure(0);await expect(page.locator('[data-test-id="shared-styles-editor"] [role="alert"]')).toContainText('正数字号');assert.deepEqual(await styles(),edited)
 await configure(36)
 result.checks.push('API text fixtures; actual UI creates/applies style, edits typography on both references, undo/redo and invalid zero font-size rejection')
 await page.getByRole('button',{name:'资产面板',exact:true}).click();await page.getByRole('button',{name:'保存到本机',exact:true}).click();await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000})
 await browser.close();await open();await page.getByRole('button',{name:'本机画布',exact:true}).click();await page.getByLabel('本机画布列表').getByRole('button',{name:new RegExp('^'+name+' ·')}).click();await expect.poll(styles).toEqual(edited)
 await page.getByRole('button',{name:'属性面板',exact:true}).click();await page.evaluate(()=>window.openPencil.getStore().select([]));await configure(40)
 await expect.poll(async()=>(await styles()).objects.map(n=>n.fontSize)).toEqual([40,40])
 result.checks.push('fresh browser restores text style and references; further size edit propagates')
 const panel=page.locator('[data-test-id="shared-styles-editor"]')
 await panel.getByRole('spinbutton',{name:'样式行高（空白为自动）',exact:true}).fill('')
 await panel.getByRole('spinbutton',{name:'样式字间距',exact:true}).fill('-1')
 await panel.getByRole('button',{name:'保存样式修改',exact:true}).click()
 await expect.poll(async()=>(await styles()).objects.map(n=>[n.lineHeight,n.letterSpacing])).toEqual([[null,-1],[null,-1]])
 result.checks.push('automatic line height and negative letter spacing propagate without losing features')
 await page.screenshot({path:resolve(out,'restored.png')})
 assert.deepEqual(result.errors,[]);assert.deepEqual(result.consoleErrors??[],[]);result.status='passed'
}catch(e){result.status='failed';result.error=e.stack;await page?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});throw e}finally{await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2));await browser?.close()}
