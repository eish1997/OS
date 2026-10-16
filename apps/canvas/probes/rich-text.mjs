import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const {chromium,expect}=createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const out=resolve(process.env.OS_CANVAS_EVIDENCE_DIR??'output/dev-evidence/canvas-c06/rich-text')
await mkdir(out,{recursive:true})
const base=process.env.OS_CANVAS_TEST_URL??'http://localhost:24650',name=`C06 rich ${Date.now()}`
const result={name,base,checks:[],errors:[]};let browser,page
async function open(){
 browser=await chromium.launch({channel:'msedge'})
 page=await browser.newPage({viewport:{width:1440,height:900}})
 page.on('pageerror',e=>result.errors.push(e.message))
 await page.goto(`${base}/?test&os-canvas&no-rulers`)
 await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({timeout:60000})
 await page.locator('#loader').waitFor({state:'detached'})
}
async function snap(){return page.evaluate(()=>{
 const n=[...window.openPencil.getStore().graph.nodes.values()].find(n=>n.type==='TEXT')
 return n?{text:n.text,fontSize:n.fontSize,lineHeight:n.lineHeight,letterSpacing:n.letterSpacing,textAlignHorizontal:n.textAlignHorizontal,fills:n.fills.map(f=>({type:f.type,color:f.color?Object.fromEntries(Object.entries(f.color).map(([k,v])=>[k,Math.round(v*1e6)/1e6])):null})),fontFamily:n.fontFamily,fontWeight:n.fontWeight,italic:n.italic,textDecoration:n.textDecoration,styleRuns:n.styleRuns.map(r=>({...r,style:{fontFamily:n.fontFamily,...r.style}})),textParagraphs:n.textParagraphs}:null
})}
try{
 await open()
 await page.evaluate(name=>{const s=window.openPencil.getStore();s.state.autosaveEnabled=false;s.state.documentName=name},name)
 await page.getByRole('button',{name:'新建便签',exact:true}).click()
 await expect.poll(()=>page.evaluate(()=>!!window.openPencil.getStore().state.editingTextId)).toBe(true)
 await page.keyboard.insertText('Normal Bold')
 await expect.poll(()=>page.evaluate(()=>!!window.openPencil.getStore().textEditor?.state?.paragraph)).toBe(true)
 await page.keyboard.press('End');for(let i=0;i<4;i++)await page.keyboard.press('Shift+ArrowLeft')
 result.selection=await page.evaluate(()=>window.openPencil.getStore().textEditor?.getSelectionRange())
 assert.deepEqual(result.selection,[7,11])
 await page.keyboard.press('Control+b')
 result.bold=await snap()
 assert.ok(result.bold.styleRuns.some(r=>r.style?.fontWeight===700))
 await page.keyboard.press('Control+i');await page.keyboard.press('Control+u')
 result.formatted=await snap()
 await page.keyboard.press('Escape')
 let expected=await snap();result.expected=expected
 assert.equal(expected.text,'Normal Bold')
 assert.equal(expected.fontWeight,400)
 assert.ok(expected.styleRuns.some(r=>r.start===7&&r.length===4&&r.style?.italic===true&&r.style?.textDecoration==='UNDERLINE'))
 await page.screenshot({path:resolve(out,'formatted.png')})
 await page.keyboard.press('Control+z')
 result.undone=await snap();assert.notDeepEqual(result.undone,expected)
 await page.keyboard.press('Control+Shift+z');await expect.poll(snap).toEqual(expected)
 result.checks.push('keyboard partial bold italic underline, history and unchanged plain prefix')
 if(process.env.OS_CANVAS_TEXT_PROPERTIES==='1') {
  await page.getByRole('button',{name:'属性面板',exact:true}).click()
  const panel=page.locator('[data-slot="os-properties-overlay"]')
  result.propertyInputs=await panel.locator('input').evaluateAll(ns=>ns.map(n=>({role:n.getAttribute('role'),label:n.getAttribute('aria-label'),value:n.value})))
  const size=panel.getByRole('spinbutton',{name:'字号',exact:true})
  await size.click();const sizeInput=panel.locator('input:focus');await sizeInput.fill('24');await sizeInput.press('Enter')
  await expect.poll(async()=>(await snap()).fontSize).toBe(24)
  await panel.getByRole('group',{name:'文本对齐',exact:true}).getByRole('button',{name:'水平居中',exact:true}).click()
  await expect.poll(async()=>(await snap()).textAlignHorizontal).toBe('CENTER')
  const color=panel.locator('input[data-property="color-hex"]').first()
  await color.fill('884422');await color.press('Tab')
  await expect.poll(async()=>(await snap()).fills[0].color.r).toBe(0.533333)
  const styled=await snap();result.propertyStyled=styled
  await page.getByRole('button',{name:'资产面板',exact:true}).click()
  await page.keyboard.press('Control+z');await expect.poll(async()=>(await snap()).fills).toEqual(expected.fills)
  await page.keyboard.press('Control+Shift+z');await expect.poll(snap).toEqual(styled)
  expected=styled;result.expected=expected
  await page.screenshot({path:resolve(out,'properties-styled.png')})
  result.checks.push('real panel font size, text alignment, text color and color history')
 }
 await page.getByRole('button',{name:'保存到本机',exact:true}).click()
 await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000})
 await browser.close();await open()
 await page.getByRole('button',{name:'本机画布',exact:true}).click()
 await page.getByLabel('本机画布列表').getByRole('button',{name:new RegExp(`^${name} ·`)}).click()
 await expect.poll(snap).toEqual(expected)
 await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机')
 assert.equal(await page.evaluate(()=>window.openPencil.getStore().hasUnsavedChanges()),false)
 if(process.env.OS_CANVAS_TITLE_DIAGNOSTIC==='1') {
  await expect.poll(()=>page.evaluate(async()=>{const {fontManager}=await import('/packages/core/src/text/index.ts');return fontManager.getCJKFallbackFamilies().length}),{timeout:30000}).toBeGreaterThan(0)
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
 }
 await page.screenshot({path:resolve(out,'restored.png')})
 result.checks.push('partial formatting survives production-format save and fresh browser reopen')
 const position=await page.evaluate(()=>{
  const s=window.openPencil.getStore(),n=[...s.graph.nodes.values()].find(n=>n.type==='TEXT'),p=s.graph.getNode(n.parentId)
  const box=document.querySelector('[data-test-id="canvas-element"]').getBoundingClientRect()
  return {x:box.left+s.state.panX+(p.x+n.x+8)*s.state.zoom,y:box.top+s.state.panY+(p.y+n.y+8)*s.state.zoom}
 })
 await page.mouse.dblclick(position.x,position.y)
 await expect.poll(()=>page.evaluate(()=>!!window.openPencil.getStore().state.editingTextId)).toBe(true)
 // Supply clipboard data at the browser API boundary without modifying the user's clipboard.
 await page.evaluate(()=>{Object.defineProperty(navigator.clipboard,'readText',{configurable:true,value:async()=>'第一行 Paste\n第二行 End'})})
 await page.keyboard.press('Control+a');await page.keyboard.press('Control+v')
 await expect.poll(async()=>(await snap())?.text).toBe('第一行 Paste\n第二行 End')
 await page.keyboard.press('Escape')
 const pasted=await snap();result.pasted=pasted
 await page.keyboard.press('Control+z');await expect.poll(snap).toEqual(expected)
 await page.keyboard.press('Control+Shift+z');await expect.poll(snap).toEqual(pasted)
 await page.getByRole('button',{name:'保存到本机',exact:true}).click()
 await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机',{timeout:30000})
 await browser.close();await open()
 await page.getByRole('button',{name:'本机画布',exact:true}).click()
 await page.getByLabel('本机画布列表').getByRole('button',{name:new RegExp(`^${name} ·`)}).click()
 await expect.poll(snap).toEqual(pasted)
 await page.screenshot({path:resolve(out,'paste-restored.png')})
 result.checks.push('Ctrl+V with controlled clipboard readText preserves multiline text, undo/redo and fresh reopen; OS clipboard permission not covered')
 assert.deepEqual(result.errors,[]);result.status='passed' 
}catch(e){result.status='failed';result.error=e.stack;await page?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});throw e}
finally{await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2));await browser?.close()}
