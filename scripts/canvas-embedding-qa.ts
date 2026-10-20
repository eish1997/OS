import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';

const output = process.env.CANVAS_QA_EVIDENCE ?? 'output/dev-evidence/canvas-embedding/embedded-ui';
mkdirSync(output, { recursive: true });
const directory = mkdtempSync(join(tmpdir(), 'canvas-embedding-ui-'));
const app = createApp({ dataDir: join(directory, 'host'), staticDir: 'output/canvas-workbench-build',
  canvasPackageDir: process.env.CANVAS_QA_PACKAGE ?? '.runtime/canvas-workbench-package-086b',
  password: 'canvas-isolated-ui-password', schedule: false });
await app.canvasService!.start();
await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${(app.server.address() as {port:number}).port}`;
const previousOrigin = config.origin; config.origin = base;
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => {
  if (location.pathname === '/canvas/') history.replaceState(null, '', location.href + '&test');
  // Exercise the supported native file-input fallback in headless Chrome.
  Object.defineProperty(window,'showOpenFilePicker',{value:undefined,configurable:true});
});
page.setDefaultTimeout(20000);
const errors:string[] = [], consoleErrors:string[] = [], failedRequests:{url:string;status:number}[] = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
page.on('response', response => { if (response.status() >= 400) failedRequests.push({url:response.url(),status:response.status()}); });
const report:Record<string,unknown> = { directory, errors, consoleErrors, failedRequests };
let step = 'login';
try {
  await page.goto(base);
  await page.getByLabel('工作台密码').fill('canvas-isolated-ui-password');
  await page.getByRole('button', {name:'进入工作台',exact:true}).click();
  step = 'frame-load';
  const iframe = page.locator('iframe[title="画板编辑器"]');
  await iframe.waitFor();
  // The init script enables automation only in this isolated browser, without a second load.
  let frame = (await (await iframe.elementHandle())!.contentFrame())!;
  assert(frame);
  await frame.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({timeout:90000});
  await frame.locator('#loader').waitFor({state:'detached'});
  report.initialRenderMs=await frame.evaluate(()=>performance.now());
  assert.equal(await page.locator('.wb-welcome').count(),0);
  assert.equal(await page.locator('iframe[title="画板编辑器"]').count(),1);
  await frame.waitForFunction(()=>!document.body.inert);
  assert.deepEqual(await page.evaluate(async()=>await(await fetch('/api/canvas/workspace/canvases')).json()),[]);
  assert.equal(await page.getByRole('button',{name:'保存画板',exact:true}).textContent(),'画板空白草稿');
  report.emptyDraftStayedUnsaved=true;
  step = 'draw-save';
  const bounds = (await iframe.boundingBox())!;
  await page.mouse.click(bounds.x+450,bounds.y+240);
  await page.keyboard.press('r');
  await page.mouse.move(bounds.x+450,bounds.y+240);await page.mouse.down();
  await page.mouse.move(bounds.x+630,bounds.y+360,{steps:10});await page.mouse.up();
  const snapshot=()=>frame.evaluate(()=>{
    const s=(window as any).openPencil.getStore();
    return s.graph.getNode(s.state.currentPageId).childIds.map((id:string)=>{
      const n=s.graph.getNode(id);return {type:n.type,x:n.x,y:n.y,width:n.width,height:n.height,text:n.text};
    });
  });
  await frame.waitForFunction(()=>(window as any).openPencil.getStore().graph.getNode((window as any).openPencil.getStore().state.currentPageId).childIds.length===1);
  await frame.waitForFunction(()=>document.querySelector('[data-slot="local-save-status"]')?.textContent?.trim()==='已保存到本机');
  report.saved=await snapshot();
  const list = await page.evaluate(async()=>await(await fetch('/api/canvas/workspace/canvases')).json());
  assert.equal(list.length,1);assert(list[0].revision>=1);
  report.canvasId=list[0].canvasId;
  step='chinese-edit';
  await page.keyboard.press('t');
  await page.mouse.click(bounds.x+500,bounds.y+520);
  await page.keyboard.insertText('画板中文输入验证');
  await page.keyboard.press('Escape');
  await frame.waitForFunction(() => {
    const s=(window as any).openPencil.getStore();
    return [...s.graph.nodes.values()].some((n:any)=>n.text==='画板中文输入验证');
  });
  await frame.waitForFunction(()=>document.querySelector('[data-slot="local-save-status"]')?.textContent?.trim()==='已保存到本机');
  report.withChinese=await snapshot();
  step='bridge-save-confirmation';
  let releaseSave!:()=>void,observedSave!:()=>void,finishRoute!:()=>void,held=false,routeFailure:unknown;
  const saveGate=new Promise<void>(resolve=>{releaseSave=resolve;});
  const routeFinished=new Promise<void>(resolve=>{finishRoute=resolve;});
  let saveTimer:ReturnType<typeof setTimeout>;
  const saveObserved=new Promise<void>((resolve,reject)=>{saveTimer=setTimeout(()=>reject(new Error('Save request was not issued')),10000);observedSave=()=>{clearTimeout(saveTimer);resolve();};});
  const saveRoute='**/api/canvas/workspace/canvases/*';
  await page.route(saveRoute,async route=>{
    const hold=route.request().method()==='POST'&&!held;
    try {
      if(hold){held=true;observedSave();await saveGate;}
      await route.continue();
    }catch(error){routeFailure=error;}finally{if(hold)finishRoute();}
  });
  try {
    await page.keyboard.press('ArrowRight');
    await page.getByRole('button',{name:'保存画板',exact:true}).click();
    await saveObserved;
    await page.waitForFunction(()=>document.querySelector('[aria-label="保存画板"]')?.textContent==='画板保存中');
    assert.equal(await page.getByRole('button',{name:'保存画板',exact:true}).isDisabled(),true);
    await page.getByRole('button',{name:'＋ 窗口',exact:true}).click();
    await frame.waitForFunction(()=>document.body.inert,undefined,{timeout:2000});
    await page.keyboard.press('Escape');
    await frame.waitForFunction(()=>!document.body.inert,undefined,{timeout:2000});
    assert.equal(await page.getByRole('button',{name:'保存画板',exact:true}).textContent(),'画板保存中');
    report.modalControlledDuringPendingSave=true;
    report.saveAckWaitedForPersistence=true;
  } finally {releaseSave();if(held)await routeFinished;await page.unroute(saveRoute);}
  assert.equal(routeFailure,undefined);
  await page.waitForFunction(()=>document.querySelector('[aria-label="保存画板"]')?.textContent==='画板已保存');
  report.afterConfirmedSave=await snapshot();
  step='bridge-theme';
  const colorsBefore=await frame.evaluate(()=>JSON.stringify([...(window as any).openPencil.getStore().graph.nodes.values()].map((node:any)=>[node.id,node.fills,node.strokes])));
  await page.getByRole('button',{name:'设置',exact:true}).click();
  await page.getByRole('radio',{name:/浅色/}).check();
  await page.locator('#wb-line-width').fill('1.5');
  await frame.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--color-panel').trim()==='#ffffff'&&getComputedStyle(document.documentElement).getPropertyValue('--wb-line-width').trim()==='1.5px');
  assert.equal(await frame.evaluate(()=>JSON.stringify([...(window as any).openPencil.getStore().graph.nodes.values()].map((node:any)=>[node.id,node.fills,node.strokes]))),colorsBefore);
  await page.getByRole('radio',{name:/墨黑/}).check();await page.locator('#wb-line-width').fill('1');
  await page.getByRole('button',{name:'完成',exact:true}).click();
  await frame.waitForFunction(()=>!document.body.inert&&getComputedStyle(document.documentElement).getPropertyValue('--color-panel').trim()==='#191919');
  report.themeAndLineWidthPreservedArtwork=true;
  step='menu-dismiss';
  await page.locator('.wb-toolbar summary').click();
  await page.mouse.click(bounds.x+750,bounds.y+480);
  assert.equal(await page.locator('.wb-toolbar details').getAttribute('open'),null);
  step='modal-isolation';
  await page.getByRole('button',{name:'＋ 窗口',exact:true}).click();
  await frame.waitForFunction(()=>document.body.inert,undefined,{timeout:2000});
  assert.equal(await frame.locator('body').evaluate(body=>(body as HTMLElement).inert),true);
  await page.keyboard.press('Escape');
  await frame.waitForFunction(()=>!document.body.inert,undefined,{timeout:2000});
  assert.equal(await frame.locator('body').evaluate(body=>(body as HTMLElement).inert),false);
  step='host-drag-over-canvas';
  await page.getByRole('button',{name:'＋ 窗口',exact:true}).click();
  await page.getByRole('button',{name:/布局演示/}).click();
  await page.locator('.wb-panel').getByRole('button',{name:'悬浮',exact:true}).click();
  const floating=page.locator('.wb-floating');
  await floating.waitFor();
  await floating.locator('textarea').fill('宿主输入保留');
  const beforeFloat=(await floating.boundingBox())!;
  const title=(await floating.locator('.wb-window-title').boundingBox())!;
  await page.mouse.move(title.x+65,title.y+18);await page.mouse.down();
  await page.mouse.move(bounds.x+820,bounds.y+250,{steps:12});await page.mouse.up();
  const afterFloat=(await floating.boundingBox())!;
  assert(Math.abs(afterFloat.x-beforeFloat.x)>100);
  assert.equal(await floating.locator('textarea').inputValue(),'宿主输入保留');
  assert.deepEqual(await snapshot(),report.afterConfirmedSave);
  step='canvas-drag-under-float';
  await page.mouse.click(bounds.x+700,bounds.y+620);
  await page.keyboard.press('v');
  await page.mouse.move(bounds.x+540,bounds.y+300);await page.mouse.down();
  await page.mouse.move(afterFloat.x+100,afterFloat.y+110,{steps:16});await page.mouse.up();
  const moved=await snapshot();
  assert.notDeepEqual(moved,report.afterConfirmedSave,'canvas gesture must continue over opaque host float');
  assert.deepEqual(await floating.boundingBox(),afterFloat);
  await floating.locator('textarea').fill('输入不改变画板');
  assert.deepEqual(await snapshot(),moved);
  step='separator-drag';
  const separator=page.getByRole('separator').first();
  const separatorBefore=(await separator.boundingBox())!;
  await page.mouse.move(separatorBefore.x+separatorBefore.width/2,separatorBefore.y+200);await page.mouse.down();
  await page.mouse.move(separatorBefore.x+130,separatorBefore.y+200,{steps:10});await page.mouse.up();
  assert(Math.abs((await separator.boundingBox())!.x-separatorBefore.x)>80);
  await frame.waitForFunction(()=>document.querySelector('[data-slot="local-save-status"]')?.textContent?.trim()==='已保存到本机');
  report.beforeReopen=await snapshot();
  await floating.getByRole('button',{name:'关闭窗口',exact:true}).click();
  // The demo has an unsaved draft; confirm its explicit close before reload.
  if(await page.locator('dialog[open]').count()) await page.locator('dialog[open] button[type=submit]').click();
  step='reopen';
  const latest=await page.evaluate(async()=>await(await fetch('/api/canvas/workspace/canvases')).json());
  await page.reload();await iframe.waitFor();
  frame=(await(await iframe.elementHandle())!.contentFrame())!;
  await frame.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({timeout:90000});
  await frame.locator('#loader').waitFor({state:'detached'});
  await frame.getByRole('button',{name:'本机画布',exact:true}).click();
  await frame.getByRole('button',{name:`${latest[0].metadata.name} · ${latest[0].revision}`,exact:true}).click();
  await frame.waitForFunction(()=>{
    const s=(window as any).openPencil.getStore();return s.graph.getNode(s.state.currentPageId).childIds.length===2;
  });
  assert.deepEqual(await snapshot(),report.beforeReopen);
  if(process.env.CANVAS_QA_SWITCH_FAULT==='1'){
    step='late-context-load';
    const sourceBefore=await snapshot();
    const originalName=await frame.evaluate(()=>(window as any).openPencil.getStore().state.documentName);
    const sceneBase64=readFileSync('apps/canvas/local/fixtures/revision-2.fig').toString('base64');
    const invalidId=await page.evaluate(async scene=>{
      const canvasId=crypto.randomUUID();const response=await fetch(`/api/canvas/workspace/canvases/${canvasId}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operationId:crypto.randomUUID(),expectedRevision:0,sceneBase64:scene,metadata:{formatVersion:1,name:'Invalid page identity',pages:[{id:crypto.randomUUID(),name:'Missing page'}]}})});
      if(!response.ok)throw new Error('Cannot create isolated invalid target');return canvasId;
    },sceneBase64);
    const targetId=await page.evaluate(async scene=>{
      const canvasId=crypto.randomUUID();const response=await fetch(`/api/canvas/workspace/canvases/${canvasId}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operationId:crypto.randomUUID(),expectedRevision:0,sceneBase64:scene,metadata:{formatVersion:1,name:'Deferred target'}})});
      if(!response.ok)throw new Error('Cannot create isolated target');return canvasId;
    },sceneBase64);
    const delayedRoute=`**/api/canvas/workspace/canvases/${targetId}/scene?*`;
    await page.route(delayedRoute,async route=>{await new Promise(resolve=>setTimeout(resolve,26000));await route.continue();});
    await frame.getByRole('button',{name:'本机画布',exact:true}).click();
    await frame.getByRole('button',{name:'Deferred target · 1',exact:true}).click();
    await frame.waitForFunction(()=>document.body.inert);
    assert.deepEqual(await snapshot(),sourceBefore);
    await frame.waitForFunction(()=>!document.body.inert,undefined,{timeout:40000});
    await page.unroute(delayedRoute);
    assert.deepEqual(await snapshot(),sourceBefore);
    assert.equal(await frame.evaluate(()=>(window as any).openPencil.getStore().state.documentName),originalName);
    await frame.getByRole('button',{name:'Deferred target · 1',exact:true}).click();
    await frame.waitForFunction(()=>(window as any).openPencil.getStore().state.documentName==='Deferred target');
    await frame.waitForFunction(()=>!document.body.inert);
    assert.notDeepEqual(await snapshot(),sourceBefore);
    report.lateLoadPreservedOldDocumentAndRetryOpenedTarget=true;
    step='invalid-page-identity';
    const beforeInvalid=await snapshot();
    await frame.getByRole('button',{name:'Invalid page identity · 1',exact:true}).click();
    await frame.getByText('页面身份清单与保存快照不匹配',{exact:false}).first().waitFor();
    await frame.waitForFunction(()=>!document.body.inert);
    assert.deepEqual(await snapshot(),beforeInvalid);
    assert.equal(await frame.evaluate(()=>(window as any).openPencil.getStore().state.documentName),'Deferred target');
    assert.equal(await page.getByText('画板连接失败',{exact:true}).count(),0);
    assert.equal(await page.getByRole('button',{name:'重试连接',exact:true}).count(),0);
    report.invalidIdentityPreservedLiveGraph=true;
    report.invalidCanvasId=invalidId;
  }
  if(process.env.CANVAS_QA_IMPORT==='1'){
    step='embedded-file-import';
    await frame.evaluate(()=>{(window as any).__originalEditor=(window as any).openPencil.getStore();});
    const beforeCount=await page.evaluate(async()=> (await (await fetch('/api/canvas/workspace/canvases')).json()).length);
    const retryImport=process.env.CANVAS_QA_IMPORT_RETRY==='1';
    let dropped=false;
    if(retryImport)await page.route('**/api/canvas/workspace/canvases/*',async route=>{
      if(!dropped&&route.request().method()==='POST'&&route.request().postDataJSON()?.metadata?.name==='revision-2'){
        const response=await route.fetch();assert.equal(response.status(),200);dropped=true;
        await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'isolated-lost-import-confirmation'})});
      }else await route.continue();
    });
    await frame.getByRole('menuitem',{name:'文件',exact:true}).click();
    const chooser=page.waitForEvent('filechooser');
    await frame.getByRole('menuitem',{name:/打开/}).first().click();
    await (await chooser).setFiles('apps/canvas/local/fixtures/revision-2.fig');
    if(retryImport){
      await frame.getByText(/无法打开.*revision-2/).first().waitFor();
      assert(dropped);
      assert.deepEqual(await snapshot(),report.beforeReopen);
      assert.equal(await page.evaluate(async()=> (await (await fetch('/api/canvas/workspace/canvases')).json()).length),beforeCount+1);
      await page.unroute('**/api/canvas/workspace/canvases/*');
      await page.reload();await iframe.waitFor();frame=(await(await iframe.elementHandle())!.contentFrame())!;
      await frame.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({timeout:90000});
      await frame.waitForFunction(()=>!document.body.inert);
      await frame.evaluate(()=>{(window as any).__originalEditor=(window as any).openPencil.getStore();});
      await frame.getByRole('menuitem',{name:'文件',exact:true}).click();
      const retryChooser=page.waitForEvent('filechooser');
      await frame.getByRole('menuitem',{name:/打开/}).first().click();
      await (await retryChooser).setFiles('apps/canvas/local/fixtures/revision-2.fig');
      report.uncertainImportRetriedAfterReload=true;
    }
    await frame.waitForFunction(()=>(window as any).openPencil.getStore().state.documentName==='revision-2');
    await frame.waitForFunction(()=>!document.body.inert);
    assert.equal(await frame.evaluate(()=>(window as any).__originalEditor===(window as any).openPencil.getStore()),true);
    assert.equal(await page.evaluate(async()=> (await (await fetch('/api/canvas/workspace/canvases')).json()).length),beforeCount+1);
    report.importReusedEditorAndCreatedManagedCopy=true;
    step='embedded-new-document';
    await frame.getByRole('menuitem',{name:'文件',exact:true}).click();
    await frame.getByRole('menuitem',{name:/新建/}).first().click();
    await frame.waitForFunction(()=>(window as any).openPencil.getStore().state.documentName==='Untitled');
    await frame.waitForFunction(()=>!document.body.inert);
    assert.equal(await frame.evaluate(()=>(window as any).__originalEditor===(window as any).openPencil.getStore()),true);
    assert.equal((await snapshot()).length,0);
    await page.getByRole('button',{name:'保存画板',exact:true}).click();
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(async()=> (await (await fetch('/api/canvas/workspace/canvases')).json()).length),beforeCount+1);
    report.explicitNewReusedEditorAndStayedDraft=true;
    await frame.locator('[data-test-id="canvas-element"]').click({position:{x:700,y:350}});
    await page.keyboard.press('Control+n');
    await page.waitForTimeout(250);
    await frame.waitForFunction(()=>!document.body.inert);
    assert.equal(await frame.evaluate(()=>(window as any).__originalEditor===(window as any).openPencil.getStore()),true);
    await frame.getByRole('menuitem',{name:'文件',exact:true}).click();
    await frame.getByRole('menuitem',{name:/^关闭/}).first().click();
    await page.waitForTimeout(250);
    await frame.waitForFunction(()=>!document.body.inert);
    assert.equal(await frame.evaluate(()=>(window as any).__originalEditor===(window as any).openPencil.getStore()),true);
    report.keyboardNewAndMenuCloseKeptEditor=true;
  }
  assert.equal(await frame.locator('img').evaluateAll(images=>images.filter(img=>!(img as HTMLImageElement).complete||!(img as HTMLImageElement).naturalWidth).length),0);
  step='screenshot';
  await page.screenshot({path:join(output,'embedded.png'),fullPage:true});
  assert.equal(errors.length,0,JSON.stringify(errors));
  if(process.env.CANVAS_QA_IMPORT_RETRY==='1'){
    assert.equal(failedRequests.length,1,JSON.stringify(failedRequests));assert.equal(failedRequests[0].status,503);
    assert.equal(consoleErrors.length,2,JSON.stringify(consoleErrors));
    assert(consoleErrors.some(message=>/Failed to load resource.*503/.test(message)),JSON.stringify(consoleErrors));
    assert(consoleErrors.some(message=>message.startsWith('Failed to open revision-2.fig: WorkspaceRequestError:')),JSON.stringify(consoleErrors));
  }else{
    assert.equal(failedRequests.length,0,JSON.stringify(failedRequests));
    assert.equal(consoleErrors.length,0,JSON.stringify(consoleErrors));
  }
  report.passed=true;
} catch(error) {
  report.passed=false;report.step=step;report.failure=String(error);
  await page.screenshot({path:join(output,'failure.png'),fullPage:true}).catch(()=>{});
  throw error;
} finally {
  writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2));
  await browser.close();await app.close();config.origin=previousOrigin;
}
