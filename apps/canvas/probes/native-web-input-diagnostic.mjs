import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { writeFile } from 'node:fs/promises'
const { chromium } = createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const browser = await chromium.connectOverCDP('http://127.0.0.1:19420')
const results = []
for (const page of browser.contexts().flatMap(c => c.pages())) {
  if (process.argv[2] === 'start') await page.evaluate(() => {
    window.__webInputDiagnostic = []
    for (const name of ['keydown', 'beforeinput', 'input', 'focusin', 'focusout']) document.addEventListener(name, e => {
      window.__webInputDiagnostic.push({ type: e.type, key: e.key, data: e.data, trusted: e.isTrusted, target: e.target?.outerHTML?.slice(0,300) })
    }, true)
  })
  results.push({ url: page.url(), state: await page.evaluate(() => ({ focused: document.hasFocus(), active: document.activeElement?.outerHTML?.slice(0,300), events: window.__webInputDiagnostic })) })
}
if (process.argv[2] !== 'start') await writeFile(resolve(process.env.OS_CANVAS_WEB_INPUT_RESULT ?? 'output/dev-evidence/canvas-c01/web/focus/input-events.json'), JSON.stringify(results,null,2))
console.log(JSON.stringify(results))
await browser.close()
