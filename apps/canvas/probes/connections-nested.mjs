import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const {chromium,expect}=createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const out=resolve(process.env.OS_CANVAS_EVIDENCE_DIR ?? 'output/dev-evidence/canvas-c06/connections-nested')
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
 const ids=await page.evaluate(name=>{
   const s=window.openPencil.getStore();s.state.autosaveEnabled=false;s.state.documentName=name
   const frame=s.createShape('FRAME',400,214,200,150,undefined,'Nested frame')
   const a=s.createShape('RECTANGLE',20,30,60,40,frame,'Source')
   const b=s.createShape('RECTANGLE',120,80,60,40,frame,'Target')
   s.select([a,b]);return {frame,a,b}
 },name)
 await page.getByRole('button',{name:'连接对象',exact:true}).click()
 await expect.poll(()=>points()).toEqual([480,264,520,314])
 await page.evaluate(id=>window.openPencil.getStore().select([id]),ids.frame)
 await page.mouse.click(1000,700);await page.evaluate(id=>window.openPencil.getStore().select([id]),ids.frame)
 await page.keyboard.press('Shift+ArrowRight')
 await expect.poll(()=>points()).toEqual([490,264,530,314])
 await page.evaluate(id=>window.openPencil.getStore().graph.updateNode(id,{rotation:90}),ids.frame)
 await expect.poll(()=>points()).toEqual([535,269,485,309])
 await page.evaluate(id=>window.openPencil.getStore().graph.updateNode(id,{flipX:true}),ids.frame)
 await expect.poll(()=>points()).toEqual([485,269,535,309])
 await page.evaluate(id=>{
  const s=window.openPencil.getStore();s.graph.updateNode(id,{rotation:0,flipX:false})
  const line=[...s.graph.nodes.values()].find(n=>n.name==='关系连接');s.graph.reparentNode(line.id,id)
 },ids.frame)
 await expect.poll(()=>points()).toEqual([490,264,530,314])
 await page.evaluate(id=>window.openPencil.getStore().graph.updateNode(id,{rotation:90}),ids.frame)
 await expect.poll(()=>points()).toEqual([535,269,485,309])
 result.checks.push('nested endpoints follow parent translation, 90-degree rotation and reflection; reparented relation remains attached')
 // Bound geometry belongs to endpoint anchors even when generic vector transforms are applied.
 for (const transform of [{flipX:true},{flipY:true},{rotation:45},{width:170,height:110}]) {
  await page.evaluate(transform=>{
   const s=window.openPencil.getStore(),line=[...s.graph.nodes.values()].find(n=>n.name==='关系连接')
   s.graph.updateNode(line.id,transform)
  },transform)
  await expect.poll(()=>points()).toEqual([535,269,485,309])
 }
 result.checks.push('generic connector flips, rotation and resize keep bound endpoints attached')
 const lineId=await page.evaluate(({b})=>{
  const s=window.openPencil.getStore(),line=[...s.graph.nodes.values()].find(n=>n.name==='关系连接')
  const other=s.graph.addPage('Other endpoint page');s.graph.reparentNode(b,other.id)
  return line.id
 },ids)
 await expect.poll(()=>page.evaluate(id=>window.openPencil.getStore().graph.isViewHidden(id),lineId)).toBe(true)
 await expect(page.getByText('1 条连接缺少端点',{exact:true})).toHaveCount(0)
 await page.evaluate(({b,frame})=>window.openPencil.getStore().graph.reparentNode(b,frame),ids)
 await expect.poll(()=>page.evaluate(id=>window.openPencil.getStore().graph.isViewHidden(id),lineId)).toBe(false)
 await expect.poll(()=>points()).toEqual([535,269,485,309])
 result.checks.push('endpoint moved to another page hides nested relation without marking it missing; returning restores it')


 await page.evaluate(id=>window.openPencil.getStore().select([id]),ids.frame)
 await page.keyboard.press('Control+d')
 result.clone=await page.evaluate(()=>{
   const s=window.openPencil.getStore(),root=s.graph.getNode([...s.state.selectedIds][0]),nodes=s.graph.getChildren(root.id)
   const line=nodes.find(n=>n.name==='关系连接');s.graph.updateNode(line.id,{name:'Copied relation'})
   const link=JSON.parse(line.pluginData.find(p=>p.key==='os.canvas/connection').value)
   return {frame:root.id,identities:nodes.map(n=>n.pluginData.find(p=>p.key==='os.canvas/nodeId').value),link}
 })
 assert.ok(result.clone.identities.includes(result.clone.link.source));assert.ok(result.clone.identities.includes(result.clone.link.target))
 const before=await points('Copied relation');await page.keyboard.press('Shift+ArrowDown')
 await expect.poll(()=>points('Copied relation')).toEqual(before.map((n,i)=>i%2 ? n+10 : n))
 await expect.poll(()=>points()).toEqual([535,269,485,309])
 result.checks.push('duplicate whole rotated container remaps descendants and moving clone leaves original unchanged')
 result.expected={original:await points(),clone:await points('Copied relation')}
 await page.evaluate(()=>{
  const s=window.openPencil.getStore();window.saveTrace=[]
  s.onEditorEvent('history:changed',()=>window.saveTrace.push({event:'history:changed',stack:new Error().stack}))
  s.onEditorEvent('node:updated',(id,changes)=>window.saveTrace.push({id,changes:JSON.parse(JSON.stringify(changes)),stack:new Error().stack}))
 })
 await page.getByRole('button',{name:'保存到本机',exact:true}).click()
 await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000})
 result.saveTrace=await page.evaluate(()=>window.saveTrace)
 result.checks.push('immediate save after arrow nudge settles history without a false dirty state')
 let release,arrived
 const held=new Promise(resolve=>{release=resolve}),started=new Promise(resolve=>{arrived=resolve})
 await page.route('**/os-workspace/canvases/*',async route=>{
  if(route.request().method()!=='POST') return route.continue()
  arrived();await held;await route.continue()
 })
 await page.getByRole('button',{name:'保存到本机',exact:true}).click();await started
 await page.evaluate(id=>{
  const s=window.openPencil.getStore(),n=s.graph.getNode(id);s.graph.updateNode(id,{y:n.y+10})
 },result.clone.frame)
 result.expected.clone=result.expected.clone.map((n,i)=>i%2 ? n+10 : n)
 await expect.poll(()=>points('Copied relation')).toEqual(result.expected.clone)
 release()
 await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('旧快照已保存，仍有新改动',{timeout:30000})
 await page.unroute('**/os-workspace/canvases/*')
 await page.getByRole('button',{name:'保存到本机',exact:true}).click()
 await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000})
 result.checks.push('actual edit during held save remains dirty and a subsequent save persists it')
 await browser.close();await open()
 await page.getByRole('button',{name:'本机画布',exact:true}).click()
 await page.getByLabel('本机画布列表').getByRole('button',{name:new RegExp(`^${name} ·`)}).click()
 await expect.poll(()=>points(),{timeout:30000}).toEqual(result.expected.original)
 await expect.poll(()=>points('Copied relation')).toEqual(result.expected.clone)
 await page.screenshot({path:resolve(out,'restored.png')})
 result.checks.push('both nested transformed connections survive fresh browser reopen')
 assert.deepEqual(errors,[]);result.status='passed'
}catch(e){result.status='failed';result.error=e.stack;await page?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});throw e}
finally{result.saveTrace??=await page?.evaluate(()=>window.saveTrace).catch(()=>null);result.errors=errors;await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2));await browser?.close()}
