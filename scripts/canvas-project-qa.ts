import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';

const directory=mkdtempSync(join(tmpdir(),'canvas-project-ui-'));
const evidence=process.env.CANVAS_QA_EVIDENCE??'output/dev-evidence/canvas-embedding/project-ui-087';mkdirSync(evidence,{recursive:true});
const app=createApp({dataDir:join(directory,'host'),staticDir:'output/canvas-workbench-build',canvasPackageDir:process.env.CANVAS_QA_PACKAGE??'.runtime/canvas-workbench-package-086b',password:'isolated-project-password',schedule:false});
await app.canvasService!.start();await new Promise<void>(done=>app.server.listen(0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`,previous=config.origin;config.origin=origin;
const browser=await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(20000);
await page.addInitScript(()=>{if(location.pathname==='/canvas/')history.replaceState(null,'',location.href+'&test');});
const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));const report:Record<string,unknown>={directory,errors};let step='login';
try{
  await page.goto(origin);await page.getByLabel('工作台密码').fill('isolated-project-password');await page.getByRole('button',{name:'进入工作台',exact:true}).click();
  const iframe=page.locator('iframe[title="画板编辑器"]');await iframe.waitFor();let frame=(await(await iframe.elementHandle())!.contentFrame())!;
  await frame.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({timeout:90000});await frame.waitForFunction(()=>!document.body.inert);
  const projects=await page.evaluate(async()=>{
    const rows=[];
    for(const name of ['Canvas A','Canvas B']){const r=await fetch('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});if(!r.ok)throw new Error('project setup failed');rows.push(await r.json());}
    return rows;
  });
  const snapshot=()=>frame.evaluate(()=>{const s=(window as any).openPencil.getStore();return s.graph.getNode(s.state.currentPageId).childIds.map((id:string)=>{const n=s.graph.getNode(id);return {x:n.x,y:n.y,width:n.width,height:n.height,type:n.type};});});
  const select=async(name:string)=>{await page.getByRole('combobox',{name:'当前项目',exact:true}).click();await page.getByRole('option',{name,exact:true}).click();};
  const selected=async(name:string)=>{await page.waitForFunction(name=>document.querySelector('[aria-label="当前项目"]')?.textContent?.includes(name),name);await frame.waitForFunction(()=>!document.body.inert);};
  const list=(projectId:string)=>page.evaluate(async id=>{const response=await fetch('/api/canvas/workspace/canvases',{headers:{'X-Canvas-Project':id}});if(!response.ok)throw new Error('list failed');return response.json();},projectId);
  step='project-a';await select('Canvas A');await selected('Canvas A');assert.deepEqual(await snapshot(),[]);
  await frame.evaluate(()=>{(window as any).__projectEditor=(window as any).openPencil.getStore();});
  const bounds=(await iframe.boundingBox())!;
  const draw=async(x:number)=>{await page.mouse.click(bounds.x+x,bounds.y+260);await page.keyboard.press('r');await page.mouse.move(bounds.x+x,bounds.y+260);await page.mouse.down();await page.mouse.move(bounds.x+x+100,bounds.y+360,{steps:8});await page.mouse.up();};
  await draw(460);await page.waitForFunction(()=>document.querySelector('[aria-label="保存画板"]')?.textContent==='画板已保存');
  const a=await snapshot();assert.equal(a.length,1);const aRows=await list(projects[0].id);assert.equal(aRows.length,1);assert.equal((await list(projects[1].id)).length,0);
  step='project-b';await select('Canvas B');await selected('Canvas B');assert.deepEqual(await snapshot(),[]);
  await draw(650);await page.waitForFunction(()=>document.querySelector('[aria-label="保存画板"]')?.textContent==='画板已保存');
  const b=await snapshot();assert.equal(b.length,1);assert.notDeepEqual(a,b);const bRows=await list(projects[1].id);assert.equal(bRows.length,1);assert.notEqual(aRows[0].canvasId,bRows[0].canvasId);
  step='return-a';await select('Canvas A');await selected('Canvas A');assert.deepEqual(await snapshot(),a);
  assert.equal(await frame.evaluate(()=>(window as any).__projectEditor===(window as any).openPencil.getStore()),true);
  step='failed-target';let failed=false;
  await page.route(`**/api/canvas/workspace/canvases/${bRows[0].canvasId}/scene?*`,async route=>{failed=true;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'isolated-target-failure'})});});
  await select('Canvas B');await page.getByText(/Canvas command failed/).first().waitFor();await frame.waitForFunction(()=>!document.body.inert);
  assert(failed);assert((await page.getByRole('combobox',{name:'当前项目'}).textContent())?.includes('Canvas A'));assert.deepEqual(await snapshot(),a);
  await page.unroute(`**/api/canvas/workspace/canvases/${bRows[0].canvasId}/scene?*`);
  step='retry-b';await select('Canvas B');await selected('Canvas B');assert.deepEqual(await snapshot(),b);
  step='save-failure';await select('Canvas A');await selected('Canvas A');
  let rejectedSaves=0;
  await page.route(`**/api/canvas/workspace/canvases/${aRows[0].canvasId}`,async route=>{
    if(route.request().method()==='POST'){rejectedSaves++;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'isolated-save-failure'})});}
    else await route.continue();
  });
  await page.mouse.click(bounds.x+500,bounds.y+300);await page.keyboard.press('ArrowRight');const editedA=await snapshot();
  assert.notDeepEqual(editedA,a);
  await select('Canvas B');
  await page.waitForFunction(()=>document.querySelector('[aria-label="保存画板"]')?.textContent==='画板连接失败');
  await frame.waitForFunction(()=>!document.body.inert);
  assert(rejectedSaves>0);assert((await page.getByRole('combobox',{name:'当前项目'}).textContent())?.includes('Canvas A'));assert.deepEqual(await snapshot(),editedA);
  await page.unroute(`**/api/canvas/workspace/canvases/${aRows[0].canvasId}`);
  await select('Canvas B');await selected('Canvas B');assert.deepEqual(await snapshot(),b);
  report.failedSavePreservedProjectAndEdits=true;
  await page.waitForFunction(()=>[...document.querySelectorAll('.wb-save')].some(node=>node.textContent==='布局已保存'));
  step='refresh-b';await page.reload();await iframe.waitFor();frame=(await(await iframe.elementHandle())!.contentFrame())!;
  await frame.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({timeout:90000});await selected('Canvas B');
  assert.deepEqual(await snapshot(),b);assert.deepEqual(errors,[]);
  step='archive-b';
  const archiveStatus=await page.evaluate(async project=>{
    const snap=await (await fetch('/api/snapshot')).json();
    const row=snap.projects.find((item:{id:string})=>item.id===project.id);
    const response=await fetch('/api/projects/update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:project.id,revision:row.revision,archived:true})});
    return response.status;
  },projects[1]);
  assert.equal(archiveStatus,200);
  await page.waitForFunction(()=>{const text=document.querySelector('[aria-label="当前项目"]')?.textContent??'';return text.includes('选择项目')&&!text.includes('Canvas B');});
  await frame.waitForFunction(()=>!document.body.inert);
  assert.notDeepEqual(await snapshot(),b);
  report.projectIsolation=true;report.failedLoadPreservedProjectAndGraph=true;report.refreshRestoredProject=true;report.archivedProjectLeftCanvas=true;report.passed=true;
  await page.screenshot({path:join(evidence,'projects.png'),fullPage:true});
}catch(error){report.passed=false;report.step=step;report.failure=String(error);await page.screenshot({path:join(evidence,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
finally{writeFileSync(join(evidence,'report.json'),JSON.stringify(report,null,2));await browser.close();await app.close();config.origin=previous;}
