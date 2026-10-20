import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';

const directory=mkdtempSync(join(tmpdir(),'canvas-bridge-recovery-'));
const evidence=process.env.CANVAS_QA_EVIDENCE??'output/dev-evidence/canvas-embedding/bridge-recovery-080';mkdirSync(evidence,{recursive:true});
const app=createApp({dataDir:join(directory,'host'),staticDir:'output/canvas-workbench-build',canvasPackageDir:process.env.CANVAS_QA_PACKAGE??'.runtime/canvas-workbench-package-086b',password:'isolated-bridge-password',schedule:false});
await app.canvasService!.start();await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const previousOrigin=config.origin,base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;config.origin=base;
const browser=await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(20000);
await page.addInitScript(()=>{if(location.pathname==='/canvas/')history.replaceState(null,'',location.href+'&test');});
const errors:string[]=[],failed:{url:string;status:number}[]=[];
page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.status()>=400)failed.push({url:response.url(),status:response.status()});});
const report:Record<string,unknown>={directory,errors,failed};
if(process.env.CANVAS_QA_RELOAD_RECOVERY==='1'){
  const deletions:unknown[]=[];report.recoveryDeletions=deletions;
  await page.exposeFunction('recordRecoveryDeletion',(entry:unknown)=>deletions.push(entry));
  await page.addInitScript(()=>{
    const remove=IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete=function(key){
      if(this.transaction.db.name==='open-pencil-recovery')void (window as any).recordRecoveryDeletion({key,store:this.name,time:Date.now(),stack:new Error().stack});
      return remove.call(this,key);
    };
  });
}
try{
  await page.goto(base);await page.getByLabel('工作台密码').fill('isolated-bridge-password');await page.getByRole('button',{name:'进入工作台',exact:true}).click();
  const iframe=page.locator('iframe[title="画板编辑器"]');await iframe.waitFor();let frame=(await(await iframe.elementHandle())!.contentFrame())!;
  await frame.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({timeout:90000});await frame.locator('#loader').waitFor({state:'detached'});await frame.waitForFunction(()=>!document.body.inert);
  const bounds=(await iframe.boundingBox())!;
  await page.mouse.click(bounds.x+450,bounds.y+240);await page.keyboard.press('r');await page.mouse.move(bounds.x+450,bounds.y+240);await page.mouse.down();await page.mouse.move(bounds.x+600,bounds.y+350,{steps:8});await page.mouse.up();
  const waitSaved=()=>page.waitForFunction(()=>document.querySelector('[aria-label="保存画板"]')?.textContent==='画板已保存');
  await waitSaved();
  const list=()=>page.evaluate(async()=>await(await fetch('/api/canvas/workspace/canvases')).json());
  const original=await list();assert.equal(original.length,1);
  await app.canvasService!.stop();assert.equal(app.canvasService!.state,'stopped');
  const offlineEditAt=Date.now();
  await page.keyboard.press('ArrowRight');await page.getByRole('button',{name:'保存画板',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="保存画板"]')?.textContent==='画板连接失败');
  report.offlineVisible=true;
  const snapshot=()=>frame.evaluate(()=>{const store=(window as any).openPencil.getStore();return store.graph.getNode(store.state.currentPageId).childIds.map((id:string)=>{const node=store.graph.getNode(id);return {type:node.type,x:node.x,y:node.y,width:node.width,height:node.height};});});
  const retained=await snapshot();assert.equal(retained.length,1);assert.equal(retained[0].x,451);
  const snapshotDeadline=Date.now()+12000;
  let snapshotReadable=false;
  while(!snapshotReadable && Date.now()<snapshotDeadline){
    snapshotReadable=await frame.evaluate(async since=>{
    if(!(await indexedDB.databases()).some(database=>database.name==='open-pencil-recovery'))return false;
    return await new Promise<boolean>(resolve=>{
      const open=indexedDB.open('open-pencil-recovery');open.onerror=()=>resolve(false);
      open.onsuccess=()=>{
        const database=open.result,transaction=database.transaction(['meta','fig']);
        transaction.oncomplete=()=>database.close();transaction.onerror=()=>{database.close();resolve(false);};
        const metadata=transaction.objectStore('meta').getAll();
        metadata.onsuccess=()=>{
          const row=metadata.result.find(item=>Date.parse(item.updatedAt)>=since&&item.byteLength>100);
          if(!row){resolve(false);return;}
          const fig=transaction.objectStore('fig').get(row.id);
          fig.onsuccess=()=>{const value=fig.result;resolve(value instanceof Blob?value.size===row.byteLength:value?.byteLength===row.byteLength);};
        };
      };
    });
    },offlineEditAt);
    if(!snapshotReadable)await page.waitForTimeout(200);
  }
  assert.equal(snapshotReadable,true,'Automatic recovery snapshot did not persist');
  report.offlineSnapshotPersistedAutomatically=true;
  report.offlineSnapshotObservedAt=Date.now();
  if(process.env.CANVAS_QA_RELOAD_RECOVERY==='1'){
    report.beforeReloadRecords=await frame.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('open-pencil-recovery');r.onsuccess=()=>{const db=r.result;const read=db.transaction('meta').objectStore('meta').getAll();read.onsuccess=()=>{resolve(read.result);db.close();};};}));
    assert((report.beforeReloadRecords as unknown[]).length>0,'Automatic snapshot must remain readable before reload');
    report.offlineEditAt=offlineEditAt;
    await app.canvasService!.restart();
    page.once('dialog',dialog=>void dialog.accept());
    await page.reload();
    await iframe.waitFor();frame=(await(await iframe.elementHandle())!.contentFrame())!;
    await frame.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({timeout:90000});
    await frame.waitForFunction(()=>!document.body.inert);
    await frame.evaluate(()=>{(window as any).__recoveryEditor=(window as any).openPencil.getStore();});
    report.reloadRecoveryInspection=await frame.evaluate(async()=>{
      const records=await new Promise(resolve=>{const request=indexedDB.open('open-pencil-recovery');request.onsuccess=()=>{const db=request.result;const read=db.transaction('meta').objectStore('meta').getAll();read.onsuccess=()=>{resolve(read.result);db.close();};};});
      return {records,path:location.pathname,route:(document.querySelector('#app') as any)?.__vue_app__?.config.globalProperties.$router?.currentRoute.value.path,dialogs:document.querySelectorAll('[role="alertdialog"]').length};
    });
    await frame.getByRole('button',{name:'恢复',exact:true}).click();
    await frame.locator('[data-test-id="recovery-dialog"]').waitFor({state:'hidden'});
    await waitSaved();
    assert.deepEqual(await snapshot(),retained);
    assert.equal(await frame.evaluate(()=>(window as any).__recoveryEditor===(window as any).openPencil.getStore()),true);
    const recovered=await list();assert.equal(recovered.length,2);
    assert.equal(recovered.find((row:any)=>row.canvasId===original[0].canvasId)?.revision,original[0].revision);
    report.reloadedRecoveryUsedSameEditorAndCreatedCopy=true;
  }else{
  await app.canvasService!.restart();await page.getByRole('button',{name:'保存画板',exact:true}).click();await waitSaved();
  assert.deepEqual(await snapshot(),retained);const restored=await list();assert.equal(restored.length,1);assert.equal(restored[0].canvasId,original[0].canvasId);assert.equal(restored[0].revision,original[0].revision+1);
  let failedRefresh=false;
  await page.route('**/api/canvas/workspace/canvases',async route=>{
    if(route.request().method()==='GET'&&!failedRefresh){failedRefresh=true;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'isolated-refresh-fault'})});}
    else await route.continue();
  });
  await page.mouse.click(bounds.x+500,bounds.y+300);await page.keyboard.press('ArrowRight');
  await page.getByRole('button',{name:'保存画板',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="保存画板"]')?.textContent==='画板保存失败');
  assert(failedRefresh);await page.unroute('**/api/canvas/workspace/canvases');
  const committed=await list();assert.equal(committed[0].revision,restored[0].revision+1);
  await page.getByRole('button',{name:'保存画板',exact:true}).click();await waitSaved();
  assert.equal((await list())[0].revision,committed[0].revision);
  report.readFailureRecoveredWithoutExtraRevision=true;
  assert(failed.length>=1);assert(failed.every(item=>item.status===503&&item.url.startsWith(base+'/api/canvas/workspace/canvases')));assert.deepEqual(errors,[]);
  report.recoveredSameCanvas=true;report.beforeRevision=original[0].revision;report.afterRevision=restored[0].revision;report.passed=true;
  }
  assert.deepEqual(errors,[]);report.passed=true;
  await page.screenshot({path:join(evidence,'recovered.png'),fullPage:true});
}catch(error){report.passed=false;report.failure=String(error);await page.screenshot({path:join(evidence,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
finally{writeFileSync(join(evidence,'report.json'),JSON.stringify(report,null,2));await browser.close();await app.close();config.origin=previousOrigin;}
