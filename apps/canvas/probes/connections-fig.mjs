import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const {chromium,expect}=createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const out=resolve(process.env.OS_CANVAS_EVIDENCE_DIR ?? 'output/dev-evidence/canvas-c06/connections-fig')
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
 const source=await page.evaluate(async ()=>{
  const s=window.openPencil.getStore();s.state.autosaveEnabled=false
  const a=s.createShape('RECTANGLE',400,220,60,40,undefined,'Source')
  const b=s.createShape('RECTANGLE',600,320,60,40,undefined,'Target')
  s.select([a,b]);return [a,b]
 })
 await page.getByRole('button',{name:'连接对象',exact:true}).click()
 await page.getByRole('textbox',{name:'关系标签',exact:true}).fill('来源说明 Source')
 await page.getByRole('button',{name:'应用标签',exact:true}).click()
 await expect(page.getByRole('button',{name:'应用标签',exact:true})).toBeEnabled({timeout:60000})
 await page.getByRole('button',{name:'曲线',exact:true}).click()
 const fixture=await page.evaluate(async source=>{
  const {buildFigmaClipboardHTML}=await import('/packages/core/src/clipboard.ts')
  const s=window.openPencil.getStore(),line=[...s.graph.nodes.values()].find(n=>n.name==='关系连接')
  const nodes=[...source,line.id].map(id=>s.graph.getNode(id))
  const html=await buildFigmaClipboardHTML(nodes,s.graph)
  return {html,identities:nodes.map(n=>n.pluginData.find(p=>p.key==='os.canvas/nodeId').value)}
 },source)
 assert.ok(fixture.html);assert.equal(fixture.html.includes('openpencil'),false)
 async function pasted(){return page.evaluate(()=>{
  const s=window.openPencil.getStore(),nodes=[...s.state.selectedIds].map(id=>s.graph.getNode(id))
  const line=nodes.find(n=>n.pluginData.some(p=>p.key==='os.canvas/connection'))
  return {labels:line?s.graph.getChildren(line.id).filter(n=>n.name==='连接标签').map(n=>({text:n.text,visible:n.visible})):[],identities:nodes.map(n=>n.pluginData.find(p=>p.key==='os.canvas/nodeId')?.value),link:line && JSON.parse(line.pluginData.find(p=>p.key==='os.canvas/connection').value)}
 })}
 for(const destination of ['same-document','new-document']){
  if(destination==='new-document'){await browser.close();await open()}
  await page.evaluate(async html=>{
   const s=window.openPencil.getStore();s.clearSelection();await s.pasteFromHTML(html)
  },fixture.html)
  const copy=await pasted();result[destination]=copy
  assert.equal(copy.identities.length,3);assert.ok(copy.identities.every(id=>id && !fixture.identities.includes(id)))
  assert.deepEqual(copy.labels,[{text:'来源说明 Source',visible:true}]);assert.equal(copy.link.route,'curve');assert.equal(copy.link.label,'来源说明 Source')
  assert.ok(copy.link);assert.ok(copy.identities.includes(copy.link.source));assert.ok(copy.identities.includes(copy.link.target))
  await page.keyboard.press('Control+z');await page.keyboard.press('Control+Shift+z')
  assert.deepEqual(await pasted(),copy)
 }
 result.checks.push('FIG HTML import gives new identities and remaps both endpoints in same and new documents, including undo/redo')
 const before=await points()
 await page.evaluate(({name,target})=>{
  const s=window.openPencil.getStore();s.state.autosaveEnabled=false;s.state.documentName=name
  const n=[...s.graph.nodes.values()].find(n=>n.pluginData.some(p=>p.key==='os.canvas/nodeId' && p.value===target))
  s.graph.updateNode(n.id,{x:n.x+20})
 },{name,target:result['new-document'].link.target})
 await expect.poll(()=>points()).toEqual(before.map((n,i)=>i===2?n+20:n))
 const expected=await points()
 await page.getByRole('button',{name:'保存到本机',exact:true}).click()
 await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000})
 await browser.close();await open()
 await page.getByRole('button',{name:'本机画布',exact:true}).click()
 await page.getByLabel('本机画布列表').getByRole('button',{name:new RegExp(`^${name} ·`)}).click()
 await expect.poll(()=>points(),{timeout:30000}).toEqual(expected)
 await page.evaluate(()=>{const s=window.openPencil.getStore();s.select(s.graph.getChildren(s.state.currentPageId).map(n=>n.id))})
 assert.deepEqual(await pasted(),result['new-document'])
 await page.screenshot({path:resolve(out,'restored.png')})
 result.checks.push('imported relation follows pasted target; disk save and fresh browser reopen preserve identities and endpoints')

 result.status='passed';assert.deepEqual(errors,[])
}catch(e){result.status='failed';result.error=e.stack;throw e}
finally{result.errors=errors;await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2));await browser?.close()}
