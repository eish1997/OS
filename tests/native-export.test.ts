import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createApp} from '../server/app.js';
import {loadPi} from '../server/pi-adapter.js';
import type {Run} from '../shared/contracts.js';

test('native export is byte-exact, scoped, read-only, and opens with pinned Pi',async()=>{
  const root=mkdtempSync(join(tmpdir(),'native-export-'));const app=createApp({dataDir:root,password:'export-password',schedule:false});
  await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;
  try{
    const project=app.service.createProject('Export');const other=app.service.createProject('Other');const dir=join(root,'sessions',project.id);const cwd=join(root,'workspaces',project.id);mkdirSync(dir,{recursive:true});mkdirSync(cwd,{recursive:true});
    const pi=await loadPi();const manager=pi.SessionManager.create(cwd,dir);const first=manager.appendMessage({role:'user',content:'ORIGINAL',timestamp:Date.now()});
    manager.appendContextEdit(first,{content:'EDITED'});manager.appendMessage({role:'user',content:'AFTER_EDIT',timestamp:Date.now()});manager.branch(first);manager.appendMessage({role:'user',content:'SIBLING',timestamp:Date.now()});
    const source=manager.getSessionFile()!;const original=readFileSync(source);const sha=createHash('sha256').update(original).digest('hex');
    const run=app.service.submit(project.id,'owned','owned','pi',{version:5,projectId:project.id,allowModel:false,maxCalls:1,maxCostUsd:0,reservePerCallUsd:0,maxOutputTokens:256,timeoutMs:1000,toolNames:[]}).run;
    app.store.update<Run>('run',run.id,run.revision,{sessionId:manager.getSessionId(),sessionPath:source,status:'completed'});
    const url=base+`/api/runs/${run.id}/native-export?projectId=${project.id}`;
    assert.equal((await fetch(url)).status,401);const login=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({password:'export-password'})});const headers={cookie:login.headers.get('set-cookie')!.split(';')[0]};
    assert.equal((await fetch(url.replace(project.id,other.id),{headers})).status,403);
    const response=await fetch(url,{headers});assert.equal(response.status,200);assert.equal(response.headers.get('x-content-sha256'),sha);assert.equal(response.headers.get('cache-control'),'no-store');assert(response.headers.get('content-disposition')?.includes('.jsonl'));
    const downloaded=Buffer.from(await response.arrayBuffer());assert.deepEqual(downloaded,original);assert.deepEqual(readFileSync(source),original);
    const copy=join(root,'exported.jsonl');writeFileSync(copy,downloaded);const reopened=pi.SessionManager.open(copy);assert.equal(reopened.getSessionId(),manager.getSessionId());assert.deepEqual(reopened.getEntries(),manager.getEntries());assert.deepEqual(reopened.buildSessionContext(),manager.buildSessionContext());
    assert.equal(app.store.list('run').length,1);assert.equal(app.store.list('task').length,1);
    const current=app.store.get<Run>('run',run.id);app.store.update<Run>('run',run.id,current.revision,{status:'running'});assert.equal((await fetch(url,{headers})).status,409);
    const running=app.store.get<Run>('run',run.id);app.store.update<Run>('run',run.id,running.revision,{status:'completed'});appendFileSync(source,'broken json\n');assert.equal((await fetch(url,{headers})).status,422);
  }finally{await app.close();}
});
