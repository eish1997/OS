import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { writeFile } from 'node:fs/promises'
const {chromium}=createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const browser=await chromium.connectOverCDP('http://127.0.0.1:19420')
const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('http://tauri.localhost'))
const data=await page.evaluate(()=>({
 transparent:window.openPencil.getStore().renderer.desktopTransparent,
 canvases:[...document.querySelectorAll('canvas')].map(c=>({html:c.outerHTML.slice(0,500),rect:c.getBoundingClientRect().toJSON(),background:getComputedStyle(c).background,alpha:(c.getContext('webgl2')??c.getContext('webgl'))?.getContextAttributes()})),
 layers:document.elementsFromPoint(900,600).map(e=>({tag:e.tagName,cls:e.className,background:getComputedStyle(e).background,opacity:getComputedStyle(e).opacity}))
}))
await writeFile('output/dev-evidence/canvas-c01/desktop/transparent/composite-diagnostic.json',JSON.stringify(data,null,2))
console.log(JSON.stringify(data,null,2));await browser.close()
