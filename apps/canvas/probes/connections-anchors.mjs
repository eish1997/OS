import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const {chromium,expect}=createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const out=resolve(process.env.OS_CANVAS_EVIDENCE_DIR ?? 'output/dev-evidence/canvas-c06/connections-anchors')
await mkdir(out,{recursive:true})
const base=process.env.OS_CANVAS_TEST_URL ?? 'http://localhost:24650'
const name=`C06 nested ${Date.now()}`
let browser,page;const errors=[];const result={name,base,checks:[]}
async function open(){
 browser=await chromium.launch({channel:'msedge'})
 page=await browser.newPage({viewport:{width:1440,height:900}})
 page.on('pageerror',e=>errors.push(e.message))
 await page.goto(`${base}/?test&os-canvas&no-rulers`)
 await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({timeout:60000})
 await page.locator('#loader').waitFor({state:'detached'})
}
async function snap(){return page.evaluate(()=>{
 const s=window.openPencil.getStore()
 const visit=id=>s.graph.getChildren(id).map(n=>({type:n.type,name:n.name,text:n.text,x:n.x,y:n.y,width:n.width,height:n.height,fills:n.fills.map(f=>({type:f.type,color:f.color ? Object.fromEntries(Object.entries(f.color).map(([k,v])=>[k,Math.round(v*1000000)/1000000])) : null})),children:visit(n.id)}))
 return visit(s.state.currentPageId)
})}
async function draw(key,x,y,w,h){
 await page.keyboard.press(key);await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+w,y+h,{steps:10});await page.mouse.up();await page.keyboard.press('Escape')
}
async function points(name='关系连接'){
 return page.evaluate(async name=>{
  const {getWorldMatrix}=await import('/packages/scene-graph/src/coordinate.ts')
  const {default:Matrix}=await import('/packages/scene-graph/src/matrix.ts')
  const s=window.openPencil.getStore(),line=[...s.graph.nodes.values()].find(n=>n.name===name)
  return line?.vectorNetwork ? Matrix.mapPoints(getWorldMatrix(line,s.graph),line.vectorNetwork.vertices.flatMap(v=>[v.x,v.y])).map(n=>Math.round(n*10000)/10000) : null
 },name)
}
try{
 await open()
 await page.evaluate(name=>{
  const s=window.openPencil.getStore();s.state.autosaveEnabled=false;s.state.documentName=name
  const a=s.createShape('RECTANGLE',400,220,60,40,undefined,'Source')
  const b=s.createShape('RECTANGLE',600,320,60,40,undefined,'Target')
  s.select([a,b])
 },name)
 await page.getByRole('button',{name:'连接对象',exact:true}).click()
 await expect.poll(()=>points()).toEqual([460,240,600,340])
 await page.getByRole('button',{name:'起点连接下侧',exact:true}).click()
 await expect.poll(()=>points()).toEqual([430,260,600,340])
 await expect(page.getByRole('button',{name:'起点连接下侧',exact:true})).toHaveAttribute('aria-pressed','true')
 await page.getByRole('button',{name:'终点连接上侧',exact:true}).click()
 await expect.poll(()=>points()).toEqual([430,260,630,320])
 await page.keyboard.press('Control+z')
 await expect.poll(()=>points()).toEqual([430,260,600,340])
 await page.keyboard.press('Control+Shift+z')
 await expect.poll(()=>points()).toEqual([430,260,630,320])
 await expect(page.getByRole('button',{name:'终点连接上侧',exact:true})).toHaveAttribute('aria-pressed','true')
 await page.mouse.move(900,700)
 await page.screenshot({path:resolve(out,'anchors.png')})
 await page.evaluate(()=>{
  const s=window.openPencil.getStore(),target=[...s.graph.nodes.values()].find(n=>n.name==='Target')
  s.graph.updateNode(target.id,{rotation:90})
 })
 await expect.poll(()=>points()).toEqual([430,260,650,340])
 await page.getByRole('button',{name:'保存到本机',exact:true}).click()
 await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000})
 await browser.close();await open()
 await page.getByRole('button',{name:'本机画布',exact:true}).click()
 await page.getByLabel('本机画布列表').getByRole('button',{name:new RegExp(`^${name} ·`)}).click()
 await expect.poll(()=>points(),{timeout:30000}).toEqual([430,260,650,340])
 await page.evaluate(()=>{
  const s=window.openPencil.getStore(),line=[...s.graph.nodes.values()].find(n=>n.name==='关系连接');s.select([line.id])
 })
 await expect(page.getByRole('button',{name:'终点连接上侧',exact:true})).toHaveAttribute('aria-pressed','true')
 result.checks.push('UI anchor changes, undo/redo, rotated target, disk save and fresh browser restore')
 result.status='passed';assert.deepEqual(errors,[])
}catch(e){result.status='failed';result.error=e.stack;await page?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});throw e}
finally{result.errors=errors;await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2));await browser?.close()}
