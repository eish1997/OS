import { chromium } from 'playwright-core';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
const root=(process.env.WORKBENCH_QA_ROOT||'output/dev-evidence/workbench-ui-066')+'/layers';mkdirSync(root,{recursive:true});
const app=createApp({dataDir:mkdtempSync(join(tmpdir(),'wb-layers-')),staticDir:'output/workbench-build',password:'layers-test',schedule:false});
await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;config.origin=base;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await context.request.post(base+'/api/login',{data:{password:'layers-test'}});await page.goto(base);
  await page.getByRole('button',{name:'直接编辑布局',exact:true}).click();
  // Only the test injects canvas content. Production keeps the future canvas mount empty.
  await page.locator('.wb-canvas-layer').evaluate(el=>{
    const probe=document.createElement('div');probe.id='canvas-probe';probe.style.cssText='position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 39px,#4565 40px),repeating-linear-gradient(90deg,#152029,#152029 39px,#4565 40px)';el.append(probe);
    for(const type of ['pointerdown','pointermove','wheel'])probe.addEventListener(type,()=>{probe.dataset[type]=String(Number(probe.dataset[type]||0)+1);});
  });
  const probe=page.locator('#canvas-probe');
  const point=await page.locator('.wb-region').first().boundingBox();assert.ok(point);
  await page.mouse.move(point.x+30,point.y+60);await page.mouse.down();await page.mouse.move(point.x+80,point.y+90);await page.mouse.up();await page.mouse.wheel(0,120);
  await page.waitForFunction(()=>Number(document.querySelector<HTMLElement>('#canvas-probe')?.dataset.wheel)>0);
  assert.ok(Number(await probe.getAttribute('data-pointerdown'))>0);assert.ok(Number(await probe.getAttribute('data-pointermove'))>0);
  await page.getByRole('button',{name:'添加窗口',exact:true}).first().click();await page.getByRole('button',{name:/布局演示/}).click();
  async function assertGap(){
    const r=await page.locator('.wb-demo').boundingBox();assert.ok(r);
    assert.equal(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.id,{x:r.x+5,y:r.y+5}),'canvas-probe');
    const before=Number(await probe.getAttribute('data-pointerdown'));await page.mouse.click(r.x+5,r.y+5);assert.equal(Number(await probe.getAttribute('data-pointerdown')),before+1);
  }
  await assertGap();
  const editor=page.getByLabel('演示窗口 1内容');let before=await probe.getAttribute('data-pointerdown');await editor.click();await editor.fill('透明留白不影响编辑');assert.equal(await probe.getAttribute('data-pointerdown'),before);
  async function assertOpaque(){
    const floating=page.locator('.wb-floating');
    assert.equal(await floating.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(25, 25, 25)');
    const r=await page.locator('.wb-demo').boundingBox();assert.ok(r);
    const before=await probe.getAttribute('data-pointerdown');
    await page.mouse.click(r.x+5,r.y+5);assert.equal(await probe.getAttribute('data-pointerdown'),before);
    const wheelBefore=await probe.getAttribute('data-wheel');await page.mouse.wheel(0,100);await page.waitForTimeout(100);assert.equal(await probe.getAttribute('data-wheel'),wheelBefore);
  }
  await page.locator('.wb-panel').getByLabel('悬浮',{exact:true}).click();await assertOpaque();
  await page.locator('.wb-floating').getByLabel('置顶',{exact:true}).click();await assertOpaque();assert.equal(await editor.inputValue(),'透明留白不影响编辑');
  before=await probe.getAttribute('data-pointerdown');const title=await page.locator('.wb-floating .wb-window-title').boundingBox();assert.ok(title);await page.mouse.click(title.x+65,title.y+15);assert.equal(await probe.getAttribute('data-pointerdown'),before);
  await page.screenshot({path:root+'/opaque-floating.png'});
  await page.getByRole('button',{name:'＋ 窗口',exact:true}).click();before=await probe.getAttribute('data-pointerdown');await page.mouse.click(point.x+10,point.y+10);assert.equal(await probe.getAttribute('data-pointerdown'),before);
  assert.deepEqual(errors,[]);writeFileSync(root+'/report.json',JSON.stringify({status:'passed',checks:['empty layout forwards native click/drag/wheel to canvas','docked window interior padding forwards clicks','floating and pinned windows are opaque and block canvas clicks/wheel','editor and title retain input','modal backdrop blocks canvas'],errors},null,2));console.log('Layers browser validation passed');
}catch(error){await page.screenshot({path:root+'/failure.png'});throw error;}
finally{await browser.close();await app.close();}
