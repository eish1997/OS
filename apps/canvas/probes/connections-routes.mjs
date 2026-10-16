import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const {chromium,expect}=createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const out=resolve(process.env.OS_CANVAS_EVIDENCE_DIR ?? 'output/dev-evidence/canvas-c06/connections-routes')
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
async function network(){return page.evaluate(()=>{
 const s=window.openPencil.getStore(),n=[...s.graph.nodes.values()].find(n=>n.name==='关系连接')
 if(!n) return null
 const v=n.vectorNetwork
 return {vertices:v.vertices.map(({x,y})=>({x,y})),segments:v.segments,route:JSON.parse(n.pluginData.find(p=>p.key==='os.canvas/connection').value).route??'straight'}
})}
try{
 await open()
 await page.evaluate(name=>{
  const s=window.openPencil.getStore();s.state.autosaveEnabled=false;s.state.documentName=name
  const a=s.createShape('RECTANGLE',400,220,60,40,undefined,'Source')
  const b=s.createShape('RECTANGLE',600,320,60,40,undefined,'Target');s.select([a,b])
 },name)
 await page.getByRole('button',{name:'连接对象',exact:true}).click()
 const straight=await network()
 await page.getByRole('button',{name:'折线',exact:true}).click()
 await expect.poll(async()=>(await network()).vertices).toEqual([{x:0,y:0},{x:70,y:0},{x:70,y:100},{x:140,y:100}])
 await expect(page.getByRole('button',{name:'折线',exact:true})).toHaveAttribute('aria-pressed','true')
 await page.mouse.move(900,700)
 await page.screenshot({path:resolve(out,'elbow.png')})
 const elbow=await network()
 await page.keyboard.press('Control+z');await expect.poll(network).toEqual(straight)
 await page.keyboard.press('Control+Shift+z');await expect.poll(network).toEqual(elbow)
 await page.getByRole('button',{name:'曲线',exact:true}).click()
 await expect.poll(async()=>(await network()).segments[0].tangentStart).toEqual({x:70,y:0})
 await expect.poll(async()=>(await network()).segments[0].tangentEnd).toEqual({x:-70,y:0})
 await page.evaluate(()=>{
  const s=window.openPencil.getStore(),n=[...s.graph.nodes.values()].find(n=>n.name==='Target');s.graph.updateNode(n.id,{x:640})
 })
 await expect.poll(async()=>(await network()).segments[0].tangentStart).toEqual({x:90,y:0})
 await expect(page.getByRole('button',{name:'曲线',exact:true})).toHaveAttribute('aria-pressed','true')
 await page.mouse.move(900,700)
 await page.screenshot({path:resolve(out,'curve.png')})
 const expected=await network()
 await page.keyboard.press('Control+d')
 const copied=await page.evaluate(()=>{
  const s=window.openPencil.getStore(),n=s.graph.getNode([...s.state.selectedIds][0])
  return {route:JSON.parse(n.pluginData.find(p=>p.key==='os.canvas/connection').value).route,segments:n.vectorNetwork.segments}
 })
 assert.equal(copied.route,'curve');assert.deepEqual(copied.segments,expected.segments)
 await page.keyboard.press('Control+z')
 await page.getByRole('button',{name:'保存到本机',exact:true}).click()
 await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000})
 await browser.close();await open()
 await page.getByRole('button',{name:'本机画布',exact:true}).click()
 await page.getByLabel('本机画布列表').getByRole('button',{name:new RegExp(`^${name} ·`)}).click()
 await expect.poll(network,{timeout:30000}).toEqual(expected)
 result.checks.push('UI straight/elbow/curve, elbow geometry, undo/redo, curve tangents follow moved target, disk save and fresh browser reopen')
 result.status='passed';assert.deepEqual(errors,[])
}catch(e){result.status='failed';result.error=e.stack;await page?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});throw e}
finally{result.errors=errors;await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2));await browser?.close()}
