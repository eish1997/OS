import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const {chromium,expect}=createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const out=resolve(process.env.OS_CANVAS_EVIDENCE_DIR??'output/dev-evidence/canvas-c06/frame-navigation'),base=process.env.OS_CANVAS_TEST_URL??'http://localhost:24650'
await mkdir(out,{recursive:true})
const name=`C06 navigation ${Date.now()}`,result={name,base,checks:[],errors:[]};let browser,page
async function open(){browser=await chromium.launch({channel:'msedge'});page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>result.errors.push(e.message));await page.goto(`${base}/?test&os-canvas&no-rulers`);await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({timeout:60000});await page.locator('#loader').waitFor({state:'detached'})}
async function snap(){return page.evaluate(()=>{const s=window.openPencil.getStore();const visit=id=>s.graph.getChildren(id).map(n=>({type:n.type,name:n.name,visible:n.visible,locked:n.locked,clipsContent:n.clipsContent,x:n.x,y:n.y,width:n.width,height:n.height,children:visit(n.id)}));return visit(s.state.currentPageId)})}
async function draw(key,x,y,w,h){await page.keyboard.press(key);await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+w,y+h,{steps:12});await page.mouse.up();await page.keyboard.press('Escape')}
async function rename(oldName,newName){const layers=page.locator('[data-test-id="layers-scroll"]');await layers.getByText(oldName,{exact:true}).dblclick();const input=layers.locator('input:visible');await input.fill(newName);await input.press('Enter')}
async function selected(){return page.evaluate(()=>{const s=window.openPencil.getStore();return [...s.state.selectedIds].map(id=>s.graph.getNode(id)?.name)})}
try{
 await open();await page.evaluate(name=>{const s=window.openPencil.getStore();s.state.autosaveEnabled=false;s.state.documentName=name},name)
 await draw('f',350,250,260,300);await rename((await snap())[0].name,'第一画框')
 await draw('f',750,250,260,300);await rename((await snap())[1].name,'第二画框')
 const scene=await snap()
 await page.locator('[data-test-id="canvas-element"]').focus();await page.keyboard.press('Escape')
 await page.keyboard.press('n');await expect.poll(selected).toEqual(['第一画框'])
 await page.keyboard.press('n');await expect.poll(selected).toEqual(['第二画框'])
 await page.keyboard.press('n');await expect.poll(selected).toEqual(['第一画框'])
 await page.keyboard.press('Shift+n');await expect.poll(selected).toEqual(['第二画框'])
 result.checks.push('N visits frames in spatial order, wraps, and Shift+N reverses')
 await page.getByRole('textbox',{name:'本地目录路径',exact:true}).fill('preview-panel-draft')
 await page.getByRole('button',{name:'预览交互',exact:true}).click()
 await expect.poll(()=>page.evaluate(()=>window.openPencil.getStore().state.play!==null)).toBe(true)
 await expect(page.locator('[data-slot="os-layers-overlay"]')).toBeHidden()
 await expect(page.getByRole('textbox',{name:'本地目录路径',exact:true})).toBeHidden()
 await expect(page.getByRole('button',{name:'返回编辑',exact:true})).toBeVisible()
 await page.screenshot({path:resolve(out,'playing.png')})
 await page.getByRole('button',{name:'返回编辑',exact:true}).click()
 await expect.poll(()=>page.evaluate(()=>window.openPencil.getStore().state.play===null)).toBe(true)
 await expect.poll(snap).toEqual(scene)
 await expect(page.locator('[data-slot="os-layers-overlay"]')).toBeVisible()
 await expect(page.getByRole('textbox',{name:'本地目录路径',exact:true})).toHaveValue('preview-panel-draft')
 await expect(page.locator('[data-slot="title-font-loading"]')).toBeHidden({timeout:30000})
 await page.screenshot({path:resolve(out,'returned.png')})
 result.checks.push('play entry and return preserve scene and restore layers panel; interactive links are not covered')
 assert.deepEqual(result.errors,[]);result.status='passed'
}catch(e){result.status='failed';result.error=e.stack;await page?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});throw e}finally{await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2));await browser?.close()}
