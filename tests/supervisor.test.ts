import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fork,spawn,type ChildProcess} from 'node:child_process';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createApp} from '../server/app.js';
const pause=(ms:number)=>new Promise<void>(done=>setTimeout(done,ms));
const shell=join(process.env.SystemRoot!,'System32/WindowsPowerShell/v1.0/powershell.exe');
const safeEnv=()=>Object.fromEntries(['SystemRoot','SystemDrive','WINDIR','ComSpec','PATHEXT','USERPROFILE','TEMP','TMP','PATH','APPDATA','LOCALAPPDATA','HOME','LANG','TZ'].flatMap(k=>process.env[k]===undefined?[]:[[k,process.env[k]!]]));
async function port(){const server=createServer();await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const n=(server.address() as {port:number}).port;await new Promise<void>(done=>server.close(()=>done()));return n;}
async function waitUntil(fn:()=>Promise<boolean>,ms=30000){const at=performance.now();while(performance.now()-at<ms){if(await fn())return;await pause(200);}assert.fail('Live owned observation exceeded bound; no implicit restart');}
function command(script:string,args:string[],env:NodeJS.ProcessEnv){return new Promise<any>((done,reject)=>{const child=spawn(shell,['-NoProfile','-ExecutionPolicy','Bypass','-File',resolve(script),...args],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',v=>out+=String(v));child.stderr.on('data',v=>err+=String(v));child.once('error',reject);child.once('exit',code=>{if(code!==0)reject(new Error('Owned management command failed: '+err.slice(-2000)));else{try{done(JSON.parse(out.trim()));}catch{reject(new Error('Management JSON missing: '+out.slice(-1000)));}}});});}
const readJson=(path:string)=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));

test('Windows supervisor replaces an actually exited owned service, preserves files/sessions, respects authenticated stop and rejects foreign identity',{skip:process.platform!=='win32',timeout:90000},async()=>{
  const name='super-'+randomUUID().replaceAll('-',''),root=mkdtempSync(join(tmpdir(),'守护 服务 ')),data=join(root,'data'),n=await port(),base=`http://127.0.0.1:${n}`,password='owned-supervisor-fixture';
  const env={...safeEnv(),PORT:String(n),DATA_DIR:data,PUBLIC_ORIGIN:base,WORKBENCH_PASSWORD:password,PI_API_KEY:'',PI_MODEL:'',PI_MAX_CALLS:'0',PI_BUDGET_USD:'0',WORKBENCH_PROXY_MODE:'direct',BACKUP_DIR:join(root,'backup')};
  const seeded=createApp({dataDir:data,password,schedule:false});await new Promise<void>(done=>seeded.server.listen(0,'127.0.0.1',done));const project=seeded.service.createProject('persistent fixture');const asset=seeded.assets.write(project.id,'原件.md','text/markdown','SUPERVISOR_ORIGINAL_BYTES');const draft=seeded.service.draft(project.id,'persistent draft','original draft',[asset.id]);await seeded.close();
  const args=['-Name',name,'-Port',String(n),'-DataDir',data,'-Origin',base],supervisor=(action:string)=>command('scripts/supervise-service.ps1',['-Action',action,...args,'-IntervalMs','1000'],env),manager=(action:string)=>command('scripts/local-service.ps1',['-Action',action,...args],env);
  const servicePath=resolve('.runtime',`local-service-${name}.json`),profilePath=resolve('.runtime',`supervisor-${name}.json`);
  let owned:ChildProcess|undefined,exited:Promise<void>|undefined;
  try{
    // Hold the actual initial ChildProcess handle so the intentional crash does
    // not target a PID found in a saved manifest.
    const launch=randomUUID();owned=fork(resolve('server/index.ts'),['--service-instance',launch],{env,execArgv:['--import',pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href],windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
    exited=new Promise<void>(done=>owned!.once('exit',()=>done()));const ownedPid=owned.pid!;
    await waitUntil(async()=>{try{return (await(await fetch(base+'/api/health',{signal:AbortSignal.timeout(1000)})).json()).launchId===launch;}catch{return false;}});
    const identity=await new Promise<any>((done,reject)=>{const child=spawn(shell,['-NoProfile','-Command',`Get-CimInstance Win32_Process -Filter 'ProcessId=${ownedPid}' | Select-Object ProcessId,ExecutablePath,@{Name='creationUtc';Expression={$_.CreationDate.ToUniversalTime().ToString('o')}} | ConvertTo-Json -Compress`],{env,windowsHide:true});let out='';child.stdout!.on('data',v=>out+=String(v));child.once('error',reject);child.once('exit',code=>{code===0?done(JSON.parse(out)):reject(new Error('Fixture identity read failed'));});});
    writeFileSync(servicePath,JSON.stringify({pid:ownedPid,creationUtc:identity.creationUtc,executable:identity.ExecutablePath,workspace:process.cwd(),entry:resolve('server/index.ts'),launchId:launch,url:base,port:n,dataDir:data,owner:'local-service.ps1',kind:'local product service'}));
    const login=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({password})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie')!.split(';')[0];
    const started=await supervisor('start');assert.equal(started.state,'ready');assert.equal(started.servicePid,ownedPid);const again=await supervisor('start');assert.equal(again.alreadyRunning,true);assert.equal(again.pid,started.pid);
    owned.kill('SIGKILL');await exited;owned=undefined;
    try { await waitUntil(async()=>{try{const health=await(await fetch(base+'/api/health',{signal:AbortSignal.timeout(1000)})).json();return health.ready&&health.pid!==ownedPid;}catch{return false;}},40000); }
    catch(error){throw new Error('Owned crash recovery failed; supervisor='+JSON.stringify(readJson(profilePath)),{cause:error});}
    await waitUntil(async()=>{const profile=readJson(profilePath);return profile.state==='ready'&&profile.restartCount===1;});
    const snapshot=await(await fetch(base+'/api/snapshot',{headers:{Cookie:cookie}})).json();assert.equal(snapshot.projects[0].id,project.id);assert.equal(snapshot.drafts.find((d:any)=>d.id===draft.id).body,'original draft');assert.equal(snapshot.config.modelConfigured,false);assert(snapshot.runs.every((r:any)=>r.calls===0));
    const downloaded=await fetch(base+'/api/assets/'+asset.id,{headers:{Cookie:cookie}});assert.equal(await downloaded.text(),'SUPERVISOR_ORIGINAL_BYTES');
    const original=readFileSync(servicePath,'utf8');
    try{const unavailable=JSON.parse(original.replace(/^\uFEFF/,''));unavailable.url='http://127.0.0.1:1';writeFileSync(servicePath,JSON.stringify(unavailable));await waitUntil(async()=>readJson(profilePath).state==='waiting-health');assert.equal(readJson(profilePath).restartCount,1);assert.equal((await fetch(base+'/api/health')).status,200);}finally{writeFileSync(servicePath,original);}
    await waitUntil(async()=>readJson(profilePath).state==='ready');
    try{const bad=JSON.parse(original.replace(/^\uFEFF/,''));bad.launchId='foreign-instance';writeFileSync(servicePath,JSON.stringify(bad));await waitUntil(async()=>readJson(profilePath).state==='identity-conflict');assert.equal((await fetch(base+'/api/health')).status,200);}finally{writeFileSync(servicePath,original);}
    await waitUntil(async()=>!(await supervisor('status')).running);
    await supervisor('start');assert.equal((await supervisor('status')).running,true);
    // The same instant may be reserialized by PowerShell 7 with different
    // fractional precision/offset spelling. Wrong instants must still refuse.
    const prior=readJson(profilePath),stopPath=resolve('.runtime',`supervisor-${name}.stop.json`);
    writeFileSync(stopPath,JSON.stringify({instance:prior.instance,pid:prior.pid,creationUtc:new Date(Date.parse(prior.creationUtc)+1000).toISOString()}));
    await waitUntil(async()=>readJson(profilePath).checks>prior.checks);assert.equal((await supervisor('status')).running,true);assert.equal((await fetch(base+'/api/health')).status,200);
    writeFileSync(stopPath,JSON.stringify({instance:prior.instance,pid:prior.pid,creationUtc:prior.creationUtc.replace(/Z$/,'+00:00')}));
    await waitUntil(async()=>!(await supervisor('status')).running,15000);assert.equal(readJson(profilePath).state,'stopped-by-request');assert.equal((await fetch(base+'/api/health')).status,200);
    await supervisor('start');assert.equal((await supervisor('status')).running,true);
    await manager('stop');await waitUntil(async()=>!(await supervisor('status')).running);assert.equal(readJson(profilePath).state,'stopped-by-user');
    assert.equal((await manager('status')).state,'stopped');await pause(1300);await assert.rejects(fetch(base+'/api/health'));
    await assert.rejects(command('scripts/local-service.ps1',['-Action','start',...args,'-UnexpectedExitOnly'],env),/deliberately stopped/);assert.equal((await manager('status')).state,'stopped');
  }finally{
    if(owned){owned.kill('SIGKILL');await exited;}
    if(existsSync(profilePath))await supervisor('stop');if(existsSync(servicePath))await manager('stop');
  }
});

test('supervisor bounds failed starts without taking over a foreign occupied port',{skip:process.platform!=='win32',timeout:30000},async()=>{
  const name='limit-'+randomUUID().replaceAll('-',''),root=mkdtempSync(join(tmpdir(),'守护 上限 ')),listener=createServer();await new Promise<void>(done=>listener.listen(0,'127.0.0.1',done));const n=(listener.address() as {port:number}).port,instance=randomUUID();
  const env={...safeEnv(),WORKBENCH_PASSWORD:'limit-fixture',PI_API_KEY:'',PI_MODEL:'',PI_MAX_CALLS:'0',PI_BUDGET_USD:'0',BACKUP_DIR:join(root,'backup')};
  try{
    // run deliberately has no result stdout; wait for this retained handle.
    const child=spawn(shell,['-NoProfile','-ExecutionPolicy','Bypass','-File',resolve('scripts/supervise-service.ps1'),'-Action','run','-Name',name,'-Port',String(n),'-DataDir',join(root,'data'),'-Origin',`http://127.0.0.1:${n}`,'-IntervalMs','1000','-MaxRestarts','2','-Instance',instance],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let err='';child.stderr.on('data',v=>err+=String(v));await new Promise<void>((done,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?done():reject(new Error(err)));});
    const profile=readJson(resolve('.runtime',`supervisor-${name}.json`));assert.equal(profile.state,'restart-limit');assert.equal(profile.recentRestartAttempts,2);assert.equal(profile.restartCount,0);assert.equal(profile.servicePid,null);assert.equal(profile.instance,instance);assert.equal(listener.listening,true);assert(!existsSync(resolve('.runtime',`local-service-${name}.json`)));
  }finally{await new Promise<void>(done=>listener.close(()=>done()));}
});
