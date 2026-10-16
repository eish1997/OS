import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const {chromium,expect}=createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const out=resolve(process.env.OS_CANVAS_EVIDENCE_DIR ?? 'output/dev-evidence/canvas-c06/connections-labels')
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
async function label(){return page.evaluate(()=>{
 const s=window.openPencil.getStore(),line=[...s.graph.nodes.values()].find(n=>n.name==='关系连接')
 const n=line && s.graph.getChildren(line.id).find(n=>n.name==='连接标签')
 return n ? {text:n.text,visible:n.visible,x:n.x,y:n.y,width:n.width,height:n.height}:null
})}
try{
 await open()
 await page.evaluate(name=>{
  const s=window.openPencil.getStore();s.state.autosaveEnabled=false;s.state.documentName=name
  const a=s.createShape('RECTANGLE',400,220,60,40,undefined,'Source')
  const b=s.createShape('RECTANGLE',700,420,60,40,undefined,'Target');s.select([a,b])
 },name)
 await page.getByRole('button',{name:'连接对象',exact:true}).click()
 if (process.env.OS_CANVAS_FONT_FAILURE === '1') {
  await page.evaluate(async()=>{
   const {fontManager}=await import('/packages/core/src/text/index.ts')
   const original=fontManager.loadFont
   fontManager.loadFont=async function(...args){fontManager.loadFont=original;throw new Error('Controlled label font failure')}
  })
 }
 await page.getByRole('textbox',{name:'关系标签',exact:true}).fill('参考素材 Reference')
 await page.getByRole('button',{name:'应用标签',exact:true}).click()
 await expect(page.getByRole('button',{name:'应用标签',exact:true})).toBeEnabled({timeout:60000})
 if (process.env.OS_CANVAS_FONT_FAILURE === '1') {
  await expect(page.getByRole('alert').filter({hasText:'标签字体加载失败'})).toBeVisible()
  assert.equal((await label()).text,'参考素材 Reference')
  await page.screenshot({path:resolve(out,'font-failed.png')})
  await page.getByRole('button',{name:'重试标签字体',exact:true}).click()
  await expect(page.getByRole('button',{name:'应用标签',exact:true})).toBeEnabled({timeout:60000})
  await expect(page.getByRole('alert').filter({hasText:'标签字体加载失败'})).toHaveCount(0)
  result.checks.push('controlled font loader rejection preserves text, visible error and real UI retry; one undo still removes label')
 }
 await expect.poll(async()=>(await label())?.text).toBe('参考素材 Reference')
 await page.keyboard.press('Control+z');await expect.poll(async()=>(await label())?.visible).toBe(false)
 await page.keyboard.press('Control+Shift+z');await expect.poll(async()=>(await label())?.visible).toBe(true)
 await page.getByRole('button',{name:'曲线',exact:true}).click()
 await page.evaluate(()=>{const s=window.openPencil.getStore(),n=[...s.graph.nodes.values()].find(n=>n.name==='Target');s.graph.updateNode(n.id,{x:760})})
 await expect.poll(async()=>(await label())?.x).toBe(30)
 for (const route of ['直线','折线','曲线']) {
  await page.getByRole('button',{name:route,exact:true}).click()
  await expect.poll(async()=>{const n=await label();return n ? n.y+n.height : Infinity}).toBeLessThanOrEqual(-6)
 }
 result.checks.push('label rectangle remains above all three connection paths with a readable gap')
 await page.keyboard.press('Control+d')
 const copied=await page.evaluate(()=>{
  const s=window.openPencil.getStore(),n=s.graph.getNode([...s.state.selectedIds][0]);return s.graph.getChildren(n.id).map(c=>c.text)
 })
 assert.ok(copied.includes('参考素材 Reference'))
 await page.keyboard.press('Control+z')
 const png=await page.evaluate(async()=>{
  const s=window.openPencil.getStore(),line=[...s.graph.nodes.values()].find(n=>n.name==='关系连接')
  return [...await s.renderExportImage([line.id],2,'PNG')]
 })
 await writeFile(resolve(out,'export.png'),Buffer.from(png))
 await page.screenshot({path:resolve(out,'label.png')})
 await page.evaluate(()=>{const s=window.openPencil.getStore(),n=[...s.graph.nodes.values()].find(n=>n.name==='Target');s.graph.updateNode(n.id,{x:480,y:220})})
 await expect.poll(async()=>(await label())?.x).toBe(-110)
 const shortBytes=await page.evaluate(async()=>{
  const s=window.openPencil.getStore(),line=[...s.graph.nodes.values()].find(n=>n.name==='关系连接')
  return [...await s.renderExportImage([line.id],2,'PNG')]
 })
 const shortPng=Buffer.from(shortBytes);await writeFile(resolve(out,'horizontal.png'),shortPng)
 result.horizontal={width:shortPng.readUInt32BE(16),height:shortPng.readUInt32BE(20)}
 assert.ok(result.horizontal.width>=480);assert.ok(result.horizontal.height>=((await label()).height+6)*2)
 await page.getByRole('textbox',{name:'关系标签',exact:true}).fill('参考素材 Reference '.repeat(12))
 await page.getByRole('button',{name:'应用标签',exact:true}).click()
 await expect(page.getByRole('button',{name:'应用标签',exact:true})).toBeEnabled({timeout:60000})
 await expect.poll(async()=>(await label())?.height).toBeGreaterThan(36)
 const longBytes=await page.evaluate(async()=>{
  const s=window.openPencil.getStore(),line=[...s.graph.nodes.values()].find(n=>n.name==='关系连接')
  return [...await s.renderExportImage([line.id],2,'PNG')]
 })
 await writeFile(resolve(out,'long-label.png'),Buffer.from(longBytes))
 await page.keyboard.press('Control+z');await expect.poll(async()=>(await label())?.text).toBe('参考素材 Reference')
 await page.getByRole('textbox',{name:'关系标签',exact:true}).fill('')
 await page.getByRole('button',{name:'应用标签',exact:true}).click()
 await expect.poll(async()=>(await label())?.visible).toBe(false)
 await page.keyboard.press('Control+z');await expect.poll(async()=>(await label())?.visible).toBe(true)
 await page.locator('[data-test-id="layers-scroll"]').getByText('关系连接',{exact:true}).click();await page.keyboard.press('Delete')
 await expect.poll(label).toBe(null)
 await page.keyboard.press('Control+z');await expect.poll(async()=>(await label())?.text).toBe('参考素材 Reference')
 const expected=await label()
 await page.getByRole('button',{name:'保存到本机',exact:true}).click()
 await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000})
 await browser.close();await open()
 await page.getByRole('button',{name:'本机画布',exact:true}).click()
 await page.getByLabel('本机画布列表').getByRole('button',{name:new RegExp(`^${name} ·`)}).click()
 await expect.poll(label,{timeout:30000}).toEqual(expected)
 result.checks.push('Chinese/Latin label UI, undo/redo, curve and moved endpoint, copy child text, PNG export, disk save and fresh browser reopen')
 result.status='passed';assert.deepEqual(errors,[])
}catch(e){result.status='failed';result.error=e.stack;await page?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});throw e}
finally{result.errors=errors;await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2));await browser?.close()}
