import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../server/app.js';
import type { PluginSnapshot } from '../shared/plugins.js';

test('plugin HTTP requires authentication, same origin, idempotence and optimistic revisions', {timeout:30000}, async () => {
  const root=mkdtempSync(join(tmpdir(),'plugin http '));const source=join(root,'source');mkdirSync(source);
  writeFileSync(join(source,'package.json'),JSON.stringify({name:'http-probe',pi:{extensions:['tool.mjs']}}));
  writeFileSync(join(source,'tool.mjs'),'export default ()=>{}');
  const app=createApp({dataDir:join(root,'data'),password:'plugin-http-test-password',schedule:false});
  await new Promise<void>(done=>app.server.listen(0,'127.0.0.1',done));const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;
  try {
    assert.equal((await fetch(base+'/api/plugins')).status,401);
    assert.equal((await fetch(base+'/api/plugins/operations',{method:'POST',body:'{}'})).status,401);
    const login=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({password:'plugin-http-test-password'})});
    assert.equal(login.status,200);const headers={Cookie:login.headers.get('set-cookie')!.split(';')[0],'Content-Type':'application/json'};
    const snapshot=async ():Promise<PluginSnapshot> => (await fetch(base+'/api/plugins',{headers})).json();
    const write=(path:string,data:unknown,method='POST',extra={})=>fetch(base+'/api'+path,{method,headers:{...headers,...extra},body:JSON.stringify(data)});
    const original=await snapshot();
    const input={action:'install',source,trusted:true,revision:original.configuration.revision,commandId:'http-install-001'};
    assert.equal((await write('/plugins/operations',input,'POST',{Origin:'https://foreign.invalid'})).status,403);
    assert.equal((await write('/plugins/operations',{...input,trusted:false})).status,400);
    assert.equal((await snapshot()).operations.length,0);
    assert(app.plugins.gate.acquireRead('running-task'));
    const accepted=await write('/plugins/operations',input);assert.equal(accepted.status,202);const op=await accepted.json();
    const replay=await write('/plugins/operations',input);assert.equal(replay.status,202);assert.equal((await replay.json()).id,op.id);
    assert.equal((await snapshot()).operations.length,1);assert.equal((await snapshot()).operations[0].phase,'waiting_for_environment');
    assert.equal((await write('/plugins/operations',{...input,commandId:'http-other-install'})).status,409);
    app.plugins.gate.releaseRead('running-task');app.plugins.tick();
    const deadline=Date.now()+15000;
    while(Date.now()<deadline && (await snapshot()).operations[0].phase!=='completed') await delay(50);
    const clientA=await snapshot();const clientB=await snapshot();assert.equal(clientA.operations[0].phase,'completed');
    const id=clientA.configuration.packages[0].id;
    assert.equal((await write(`/plugins/${id}`,{revision:clientA.configuration.revision,enabled:true},'PATCH')).status,200);
    assert.equal((await write(`/plugins/${id}`,{revision:clientB.configuration.revision,enabled:false},'PATCH')).status,409);
    assert.equal((await snapshot()).configuration.packages[0].enabled,true);
    assert.equal((await write('/plugins/operations',input)).status,202);
    assert.equal((await snapshot()).operations.length,1);
    assert.equal((await write('/plugins/operations',{...input,revision:(await snapshot()).configuration.revision})).status,409);
    assert(app.plugins.gate.acquireRead('npm-input-validation'));
    const npmInput={...input,source:'npm install @mutmutco/pi-plugin',revision:(await snapshot()).configuration.revision,commandId:'http-npm-command'};
    assert.equal((await write('/plugins/operations',{...npmInput,source:'npm install one two'})).status,400);
    const npmAccepted=await write('/plugins/operations',npmInput);assert.equal(npmAccepted.status,202);
    const npmOperation=await npmAccepted.json();assert.equal(npmOperation.source,'npm:@mutmutco/pi-plugin');
    assert.equal((await (await write('/plugins/operations',npmInput)).json()).id,npmOperation.id);
    assert.equal((await snapshot()).operations.find(o=>o.id===npmOperation.id)?.phase,'waiting_for_environment');
    // Deliberately retain the read gate: input validation must not install third-party code.
  } finally {await app.close();rmSync(root,{recursive:true,force:true});}
});
