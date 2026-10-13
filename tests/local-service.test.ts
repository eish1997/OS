import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server/app.js';
import { storageUsage } from '../server/storage.js';

test('storage reports actual categories without secrets; graceful shutdown is authenticated and instance bound', async () => {
  const dir = mkdtempSync(join(tmpdir(), '存储 lifecycle ')); let stopped = 0;
  const app = createApp({ dataDir: dir, password: 'lifecycle-test-password', schedule: false, launchId: 'test-launch', onShutdown: () => { stopped++; } });
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve)); const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  try {
    const p = app.service.createProject('storage'); app.assets.write(p.id, '资料.txt', 'text/plain', '真实原文件');
    mkdirSync(join(dir, 'sessions')); writeFileSync(join(dir, 'sessions', 'test.jsonl'), 'test-session');
    const usage = storageUsage(dir, app.assets.quotaBytes); assert.equal(usage.groups.assets.bytes, Buffer.byteLength('真实原文件')); assert.equal(usage.groups.sessions.bytes, 12); assert(usage.groups.database.bytes > 0); assert(!JSON.stringify(usage).includes(dir));
    assert.equal((await fetch(base + '/api/storage')).status, 401);
    const health = await (await fetch(base + '/api/health')).json(); assert.equal(health.launchId, 'test-launch'); assert.equal(health.pid, process.pid); assert(!JSON.stringify(health).includes(dir));
    const endpoint = base + '/api/service/shutdown'; assert.equal((await fetch(endpoint, { method: 'POST', body: '{}' })).status, 401);
    const login = await fetch(base + '/api/login', { method: 'POST', body: JSON.stringify({password:'lifecycle-test-password'}) }); const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const headers = { Cookie: cookie }; assert.equal((await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({instanceId:'wrong'}) })).status, 409);
    assert.equal((await fetch(endpoint, { method: 'POST', headers: {...headers,Origin:'https://foreign.invalid'}, body:JSON.stringify({instanceId:health.instanceId}) })).status, 403);
    assert.equal(stopped, 0); assert.equal((await fetch(endpoint, { method: 'POST', headers, body:JSON.stringify({instanceId:health.instanceId}) })).status, 202);
    assert.equal((await fetch(endpoint, { method: 'POST', headers, body:JSON.stringify({instanceId:health.instanceId}) })).status, 409);
    await new Promise(r => setTimeout(r, 150)); assert.equal(stopped, 1); assert.equal((await (await fetch(base+'/api/health')).json()).ready, false);
  } finally { await app.close(); }
});

test('Windows detached product service survives launcher exit; status/idempotent start and authenticated stop', { skip: process.platform !== 'win32', timeout: 60000 }, async () => {
  const name = 'test-' + randomUUID().replaceAll('-', ''); const dir = mkdtempSync(join(tmpdir(), '后台 服务 '));
  const listener = createServer(); await new Promise<void>(resolve => listener.listen(0, '127.0.0.1', resolve)); const port = (listener.address() as {port:number}).port; await new Promise<void>(resolve => listener.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`;
  const env = {...process.env, WORKBENCH_PASSWORD:'detached-test-password', PI_API_KEY:'', PI_MAX_CALLS:'0', PI_BUDGET_USD:'0'};
  const command = (action:string, shell='powershell.exe') => new Promise<Record<string,unknown>>((resolve, reject) => {
    const child = spawn(shell, ['-NoProfile','-ExecutionPolicy','Bypass','-File',join(process.cwd(),'scripts/local-service.ps1'),'-Action',action,'-Name',name,'-Port',String(port),'-DataDir',dir,'-Origin',base], {env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let out=''; let err=''; child.stdout.on('data',chunk=>out+=chunk); child.stderr.on('data',chunk=>err+=chunk);
    child.on('error',reject); child.on('exit',code=> { if(code!==0) reject(new Error(action+': '+err)); else { try{resolve(JSON.parse(out.trim()));}catch{reject(new Error(action+': '+out));} } });
  });
  try {
    const started = await command('start'); assert.equal(started.state,'ready'); assert(Number(started.pid)>0);
    assert.equal((await command('status')).pid,started.pid); assert.equal((await command('start')).alreadyRunning,true);
    const pwsh=join(process.env.USERPROFILE ?? '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe');
    if(existsSync(pwsh)) assert.equal((await command('status',pwsh)).pid,started.pid);
    const manifest=join(process.cwd(),'.runtime',`local-service-${name}.json`); const original=readFileSync(manifest,'utf8');
    try { const bad=JSON.parse(original.replace(/^\uFEFF/,'')); bad.launchId='foreign'; writeFileSync(manifest,JSON.stringify(bad)); await assert.rejects(command('stop'),/ownership mismatch/); assert.equal((await fetch(base+'/api/health')).status,200); } finally { writeFileSync(manifest,original); }
    const login=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({password:'detached-test-password'})}); assert.equal(login.status,200); const cookie=login.headers.get('set-cookie')!.split(';')[0];
    const project=await (await fetch(base+'/api/projects',{method:'POST',headers:{Cookie:cookie},body:JSON.stringify({name:'Detached fixture'})})).json();
    const submitted=await (await fetch(base+'/api/tasks',{method:'POST',headers:{Cookie:cookie},body:JSON.stringify({projectId:project.id,goal:'运行固定资料计算，保存报告、图表和文章草稿',commandId:randomUUID(),mode:'fixture'})})).json(); assert(submitted.run.id);
    let done=false;
    for(let i=0;i<60;i++){ const snapshot=await(await fetch(base+'/api/snapshot',{headers:{Cookie:cookie}})).json(); const run=snapshot.runs.find((r:{id:string})=>r.id===submitted.run.id); if(run.status==='completed'){assert.equal(run.resultAssetIds.length,2); done=true;break;} await new Promise(r=>setTimeout(r,200)); }
    const final = await (await fetch(base+'/api/snapshot',{headers:{Cookie:cookie}})).json();
    assert(done,'detached worker completed real files: '+JSON.stringify(final.runs.map((r:{status:string;error?:string})=>({status:r.status,error:r.error})))); assert.equal((await command('status')).state,'ready');
    assert.equal((await command('stop')).state,'stopped'); assert.equal((await command('status')).state,'stopped');
    const checked = new DatabaseSync(join(dir,'workbench.sqlite'),{readOnly:true});
    try { assert.equal(checked.prepare('SELECT COUNT(*) AS n FROM sessions').get()!.n,1,'managed stop must not leak its temporary login'); } finally { checked.close(); }
    await assert.rejects(fetch(base+'/api/health'));
  } finally { await command('stop'); }
});

test('managed shutdown retires only its own temporary session after instance validation', async () => {
  const app=createApp({dataDir:mkdtempSync(join(tmpdir(),'temporary stop ')),password:'managed-stop-password',schedule:false,onShutdown:()=>{}});
  await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;
  const login=async()=>{const response=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({password:'managed-stop-password'})});assert.equal(response.status,200);return response.headers.get('set-cookie')!.split(';')[0];};
  try {
    const browser=await login();const manager=await login();
    const shutdown=(instanceId:string)=>fetch(base+'/api/service/shutdown',{method:'POST',headers:{Cookie:manager},body:JSON.stringify({instanceId,ephemeralSession:true})});
    assert.equal((await shutdown('foreign')).status,409);
    assert.equal((await fetch(base+'/api/snapshot',{headers:{Cookie:manager}})).status,200);
    assert.equal((await shutdown(app.scheduler.owner)).status,202);
    assert.equal((await fetch(base+'/api/snapshot',{headers:{Cookie:manager}})).status,401);
    assert.equal((await fetch(base+'/api/snapshot',{headers:{Cookie:browser}})).status,200);
    assert.equal(app.store.db.prepare('SELECT COUNT(*) AS n FROM sessions').get()!.n,1);
    await new Promise(resolve=>setTimeout(resolve,110));
  } finally {await app.close();}
});
