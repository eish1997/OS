// Reopen the stopped mixed workloads; no reseeding, model or new backup.
import assert from 'node:assert/strict';
import { fork, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync,lstatSync,realpathSync,readFileSync,writeFileSync,unlinkSync,copyFileSync,mkdirSync } from 'node:fs';
import { dirname,join,resolve } from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
const pause=(ms:number)=>new Promise<void>(done=>setTimeout(done,ms));
const safeEnv=()=>Object.fromEntries(['SystemRoot','SystemDrive','WINDIR','ComSpec','PATHEXT','USERPROFILE','TEMP','TMP','PATH','APPDATA','LOCALAPPDATA','HOME','LANG','TZ'].flatMap(k=>process.env[k]===undefined?[]:[[k,process.env[k]!]]));
if(process.argv[2]==='--owned-startup'){
  const source=resolve('data');assert(source.includes('output\\dev-evidence\\private\\mixed-'));assert.equal(realpathSync(source),source);assert(!existsSync(resolve('.env')));
  const credentials=join(source,'credentials.json');assert(!lstatSync(credentials).isSymbolicLink());unlinkSync(credentials);
  const {Store}=await import('../server/store.js');const previous=new Store(join(source,'workbench.sqlite'));try{previous.db.exec('DELETE FROM sessions');}finally{previous.close();}
  const {createApp}=await import('../server/app.js');const {config}=await import('../server/config.js');const password=randomUUID();
  const start=performance.now();const app=createApp({dataDir:source,password,schedule:true,storageLimits:process.argv[3]==='full'?{assetsBytes:1024**3,databaseBytes:1024**3}:{},backup:{root:process.env.WB_BACKUP_ROOT}});
  await new Promise<void>(done=>app.server.listen(0,'127.0.0.1',done));const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;config.origin=base;
  let closed=false;process.on('disconnect',()=>{if(!closed)void app.close().then(()=>process.exit(0));});
  process.on('message',async(value:{action?:string})=>{if(value.action==='close'&&!closed){closed=true;await app.close();process.send?.({kind:'closed'},()=>process.disconnect!());}});
  process.send?.({kind:'ready',base,password,startupMs:performance.now()-start,backup:app.automaticBackup.status(),assets:app.snapshot().assets.length});
}else{
  const mixed=JSON.parse(readFileSync(resolve('output/dev-evidence/mixed-capacity.json'),'utf8'));assert.equal(mixed.status,'measured');assert(mixed.primaryIdentityUnchanged);
  const file=resolve('output/dev-evidence/backup-startup.json');if(existsSync(file)){mkdirSync(resolve('output/dev-evidence/startup-history'),{recursive:true});copyFileSync(file,resolve('output/dev-evidence/startup-history/'+Date.now()+'.json'));}
  const report:any={status:'running',at:new Date().toISOString(),modelRequests:0,profiles:[],thresholds:{startupMs:15000,snapshotMs:500},sourceEvidence:'mixed-capacity.json',remaining:['Large-text search latency remains above two seconds','Physical quota/WAL, remote phone, offsite restore, Tencent and M1 not proven']};const save=()=>writeFileSync(file,JSON.stringify(report,null,2));save();
  const primary=await (await fetch('http://127.0.0.1:4310/api/health',{headers:{Connection:'close'}})).json();report.primaryBefore=primary;
  let child:ChildProcess|undefined;let exited:Promise<void>|undefined;
  try{
    for(const original of mixed.profiles){
      assert(original.ownedChildExited);const id=dirname(original.source).split('mixed-').at(-1)!;assert(/^[-a-f0-9]{36}$/.test(id));assert.equal(original.source,resolve('output/dev-evidence/private/mixed-'+id+'/data'));assert.equal(original.root,join(process.env.USERPROFILE!,'AI-OS-Backups','mixed-probes',id));
      const old=original.restart.base;const stopped=await fetch(old+'/api/health',{signal:AbortSignal.timeout(3000)}).then(()=>false).catch(error=>error.cause?.code==='ECONNREFUSED');assert(stopped,'Original owned helper must actually be stopped before reopening its data');
      const rootOwner=JSON.parse(readFileSync(join(original.root,'.workbench-owner.json'),'utf8'));assert.equal(rootOwner.sourceRoot,original.source);
      let stderr='';let ready:any;let failure:Error|undefined;let ended=false;
      const launch=performance.now();child=fork(fileURLToPath(import.meta.url),['--owned-startup',original.profile],{cwd:dirname(original.source),env:{...safeEnv(),WB_BACKUP_ROOT:original.root,PI_API_KEY:'',PI_MODEL:'',PI_MAX_CALLS:'0',WORKBENCH_PROXY_MODE:'direct'},execArgv:['--import',pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href],windowsHide:true,stdio:['ignore','ignore','pipe','ipc']});
      report.activeObservation={profile:original.profile,pid:child.pid,source:original.source};save();child.stderr!.on('data',v=>stderr=(stderr+String(v)).slice(-2000));child.on('message',(v:any)=>{if(v.kind==='ready')ready=v;});
      exited=new Promise<void>((done,reject)=>{child!.once('exit',code=>{ended=true;if(code===0)done();else reject(new Error('Owned startup probe exited '+code+': '+stderr));});child!.once('error',reject);});void exited.catch(e=>{failure=e;});
      while(!ready){if(failure)throw failure;assert(!ended);assert(performance.now()-launch<180000,'Live startup observation timeout; no restart');await pause(25);}
      const {password,...visible}=ready;const entry:any={profile:original.profile,...visible,launchWallMs:performance.now()-launch,source:original.source,root:original.root,during:[]};delete entry.kind;report.profiles.push(entry);save();
      const login=await fetch(ready.base+'/api/login',{method:'POST',headers:{Connection:'close','Content-Type':'application/json'},body:JSON.stringify({password})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie')!.split(';')[0];await login.json();const headers={Cookie:cookie,Connection:'close'};
      const checkStart=performance.now();let status=ready.backup;
      do{
        const at=performance.now();const data=await fetch(ready.base+'/api/snapshot',{headers,signal:AbortSignal.timeout(150000)});assert.equal(data.status,200);assert.equal((await data.json()).assets.length,ready.assets);entry.during.push(performance.now()-at);
        const response=await fetch(ready.base+'/api/backup/status',{headers});assert.equal(response.status,200);status=await response.json();assert(performance.now()-checkStart<180000,'Live scanner observation timeout; no restart');if(status.checking)await pause(40);
      }while(status.checking);
      assert(status.enabled&&!status.error);assert.equal(status.retained,original.profile==='default'?7:1);assert.equal(status.lastSuccessAt,original.restart.backup.lastSuccessAt,'Observation must not trigger a new backup');entry.scanWallMs=performance.now()-checkStart;entry.checkedBackup=status;entry.requests=entry.during.length;entry.maxSnapshotMs=Math.max(...entry.during);entry.startupWithinThreshold=entry.startupMs<report.thresholds.startupMs;entry.responsesWithinThreshold=entry.maxSnapshotMs<report.thresholds.snapshotMs;save();
      const logout=await fetch(ready.base+'/api/logout',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'});assert.equal(logout.status,200);await logout.json();child.send({action:'close'});await exited;child=undefined;exited=undefined;entry.ownedChildExited=true;save();console.log(`Startup ${original.profile}: ready ${Math.round(entry.startupMs)}ms, checked ${status.retained} points, ${entry.requests} reads, max ${Math.round(entry.maxSnapshotMs)}ms`);
    }
    const after=await (await fetch('http://127.0.0.1:4310/api/health',{headers:{Connection:'close'}})).json();assert.deepEqual(after,primary);report.primaryIdentityUnchanged=true;report.primaryAfter=after;report.status=report.profiles.every((p:any)=>p.startupWithinThreshold&&p.responsesWithinThreshold)?'passed':'measured';save();
  }catch(error){report.status='failed';report.reason=error instanceof Error?error.message:'Startup probe failed';save();throw error;}
  finally{if(child?.connected){child.send({action:'close'});await exited?.catch(()=>{});}}
}
