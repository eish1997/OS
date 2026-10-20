import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';

const root=mkdtempSync(join(tmpdir(),'canvas-relocated-'));
cpSync(resolve(process.env.CANVAS_QA_PACKAGE??'.runtime/canvas-workbench-package-086b'),join(root,'package'),{recursive:true,dereference:false});
const evidence=process.env.CANVAS_QA_EVIDENCE??'output/dev-evidence/canvas-embedding/relocation-078';mkdirSync(evidence,{recursive:true});
const scene=readFileSync('apps/canvas/local/fixtures/revision-1.fig'),canvasId=randomUUID();
let archive:Buffer;
const previousOrigin=config.origin;
const report:Record<string,unknown>={root,canvasId};
try {
  for(const label of ['source','restored']) {
    const app=createApp({dataDir:join(root,label,'host'),canvasPackageDir:join(root,'package'),password:'relocation-test-password',schedule:false});
    await app.canvasService!.start();assert.equal(app.canvasService!.state,'ready');
    await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));
    const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;config.origin=base;
    try {
      const login=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({password:'relocation-test-password'})});
      const cookie=login.headers.get('set-cookie')!.split(';')[0];
      const call=(path:string,body?:unknown)=>fetch(base+'/api/canvas/workspace'+path,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
      if(label==='source') {
        const saved=await call(`/canvases/${canvasId}`,{operationId:randomUUID(),expectedRevision:0,metadata:{formatVersion:1,name:'Relocated FIG'},sceneBase64:scene.toString('base64')});
        assert.equal(saved.status,200,await saved.text());
        const exported=await call(`/canvases/${canvasId}/package`,{expectedRevision:1});
        assert.equal(exported.status,200);
        archive=Buffer.from(await exported.arrayBuffer());assert(archive.length>100);
        report.packageBytes=archive.length;
      } else {
        const imported=await fetch(base+`/api/canvas/workspace/package-imports/${randomUUID()}`,{method:'POST',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/octet-stream'},body:new Uint8Array(archive!)});
        const result=await imported.json();assert.equal(imported.status,200,JSON.stringify(result));
        report.imported=result;
        const completed=await call(`/package-imports/${result.operationId}/resume`,{});
        assert.equal(completed.status,200,await completed.text());
        const reopened=await call(`/canvases/${canvasId}/scene`);
        assert.equal(reopened.status,200);
        assert.deepEqual(Buffer.from(await reopened.arrayBuffer()),scene);
      }
      const wasm=await fetch(base+'/canvas/canvaskit.wasm',{headers:{Cookie:cookie}});
      assert.equal(wasm.status,200);assert.equal(wasm.headers.get('content-type'),'application/wasm');
      assert.equal(Buffer.from(await wasm.arrayBuffer()).subarray(0,4).toString('hex'),'0061736d');
    } finally {await app.close();assert.equal(app.canvasService!.state,'stopped');}
  }
  report.passed=true;
} catch(error) {report.passed=false;report.failure=String(error);throw error;}
finally {config.origin=previousOrigin;writeFileSync(join(evidence,'report.json'),JSON.stringify(report,null,2));}
