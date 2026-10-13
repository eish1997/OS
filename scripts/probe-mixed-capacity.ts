// Actual mixed data, full-size admission and seven historical recovery points.
// Parent imports no app/config; child cwd has no primary .env or credentials.
import assert from 'node:assert/strict';
import { fork, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, lstatSync, statfsSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Asset, Run, SessionBinding, Snapshot } from '../shared/contracts.js';
const MiB=1024**2;const pause=(ms:number)=>new Promise<void>(done=>setTimeout(done,ms));
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const safeEnv=()=>Object.fromEntries(['SystemRoot','SystemDrive','WINDIR','ComSpec','PATHEXT','USERPROFILE','TEMP','TMP','PATH','APPDATA','LOCALAPPDATA','HOME','LANG','TZ'].flatMap(k=>process.env[k]===undefined?[]:[[k,process.env[k]!]]));

if(process.argv[2]==='--owned-child'){
  const profile=process.argv[3];assert(['default','full'].includes(profile));const source=resolve('data');const root=process.env.WB_BACKUP_ROOT!;
  let closeRequested=false;process.on('message',(value:{action?:string})=>{if(value.action==='close')closeRequested=true;});
  const {createApp}=await import('../server/app.js');const {config}=await import('../server/config.js');const {loadPi}=await import('../server/pi-adapter.js');
  const {guardSessionPersistence}=await import('../server/session-capacity.js');
  const {restore}=await import('../server/backup.js');const {Store}=await import('../server/store.js');
  const options=profile==='full'?{assetsBytes:1024*MiB,databaseBytes:1024*MiB}:{};
  const resumed=process.env.WB_RESUME_SOURCE===source;
  if(resumed){assert(source.includes('output\\dev-evidence\\private\\mixed-'));assert.equal(realpathSync(source),source);const credentials=join(source,'credentials.json');assert(!lstatSync(credentials).isSymbolicLink());unlinkSync(credentials);const previous=new Store(join(source,'workbench.sqlite'));try{previous.db.exec('DELETE FROM sessions;');}finally{previous.close();}}
  let clock=Date.now();const password=randomUUID();let app=createApp({dataDir:source,password,schedule:false,storageLimits:options,backup:{root,now:()=>clock}});let closed=false;
  const emit=(value:Record<string,unknown>)=>process.send?.(value);
  const start=performance.now();let project: {id:string};let selected:Asset;let draft:{id:string};let native:Run;let manager:any;let cwd:string;let messages:number;
  const pi=await loadPi();
  if(resumed){
    project=app.snapshot().projects[0];const assets=app.snapshot().assets;selected=assets.find(a=>a.name==='大文件-0.txt')!;assert(selected);draft=app.snapshot().drafts[0];native=app.snapshot().runs.find(r=>r.mode==='pi')!;assert(native&&native.status==='completed');cwd=join(source,'workspaces',project.id);manager=pi.SessionManager.open(native.sessionPath!,undefined,cwd);messages=manager.buildSessionContext().messages.length;assert.equal(messages,16);
  }else{
  project=app.service.createProject('实际混合容量 · '+profile);
  const smallCount=profile==='default'?600:128;const largeCount=profile==='default'?60:127;const textCount=profile==='default'?24:119;
  for(let i=0;i<smallCount;i++){
    const content=Buffer.from(('固定合成研究资料：中文正文、来源、指标。\n').repeat(1200));const bytes=Buffer.alloc(32*1024,0x61);content.copy(bytes,0,0,Math.min(content.length,bytes.length-100));Buffer.from(' CAPACITY_SMALL_NEEDLE '+i).copy(bytes,bytes.length-100);
    const upload=app.assets.begin(project.id,`资料-${i}.md`,'text/markdown');app.assets.commit(upload.id,bytes);
    if(i%50===0)emit({kind:'progress',profile,stage:'small-assets',count:i});
  }
  let firstLarge:Asset|undefined;
  for(let i=0;i<largeCount;i++){
    const bytes=Buffer.alloc(8*MiB,0x61);bytes.writeUInt32LE(i,0);if(i<textCount){bytes.fill(0x61,0,8);Buffer.from(' CAPACITY_LARGE_NEEDLE '+i).copy(bytes,bytes.length-100);}
    const upload=app.assets.begin(project.id,`大文件-${i}.${i<textCount?'txt':'bin'}`,i<textCount?'text/plain':'application/octet-stream');const asset=app.assets.commit(upload.id,bytes);firstLarge??=asset;
    if(i%10===0)emit({kind:'progress',profile,stage:'large-assets',count:i});
  }
  const previous=app.snapshot().assets[0];const versionUpload=app.assets.begin(project.id,'资料-0.md','text/markdown',[previous.id],{parentVersionId:previous.id});const version=app.assets.commit(versionUpload.id,Buffer.from('第二版中文资料 CAPACITY_VERSION_NEEDLE'));assert.equal(version.version,2);
  selected=firstLarge!;draft=app.service.draft(project.id,'混合资料来源稿','这是固定合成工作负载，不能当作真实模型输出。',[version.id,selected.id]);
  cwd=join(source,'workspaces',project.id);mkdirSync(cwd,{recursive:true});
  manager=pi.SessionManager.create(cwd,join(source,'sessions',project.id));const guard=guardSessionPersistence(manager,app.store.capacity!);
  messages=profile==='default'?16:64;for(let i=0;i<messages;i++)manager.appendMessage({role:'user',content:'离线固定会话 '+i+' '+('x'.repeat(512*1024)),timestamp:Date.now()});guard.assertHealthy();
  const policy={version:1,projectId:project.id,toolNames:['write_asset'],allowModel:false,maxCalls:0,maxCostUsd:0,reservePerCallUsd:0,maxOutputTokens:10,timeoutMs:60000};
  native=app.service.submit(project.id,'离线合成会话归档',randomUUID(),'pi',policy).run;app.service.transition(native.id,'running');native=app.store.get<Run>('run',native.id);app.store.update<Run>('run',native.id,native.revision,{sessionId:manager.getSessionId(),sessionPath:manager.getSessionFile()!});app.service.transition(native.id,'completed');
  app.store.create<SessionBinding>('session_binding',{id:'session:'+native.id,projectId:project.id,runId:native.id,taskId:native.taskId,sessionId:manager.getSessionId(),sessionPath:manager.getSessionFile()!,cwd,piVersion:'1.0.3',policyVersion:1,model:'',authKind:'api'});
  for(const [folder,size] of [['workspaces',16*MiB],['logs',MiB],['uploads',4*MiB]] as const){mkdirSync(join(source,folder),{recursive:true});app.store.capacity!.write(folder,size,()=>writeFileSync(join(source,folder,'synthetic-retained.bin'),Buffer.alloc(size,0x71)));}
  app.store.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  if(profile==='full'){
    const usage=app.store.capacity!.usage();const slack=app.store.capacity!.limits.totalBytes-app.store.capacity!.limits.controlReserveBytes-usage.measuredBytes-MiB;
    assert(slack>0&&slack<45*MiB,'Expected practical remaining total capacity');app.store.capacity!.write('workspaces',slack,()=>writeFileSync(join(source,'workspaces','near-total-limit.bin'),Buffer.alloc(slack,0x72)));
  }
  }
  if(closeRequested){await app.close();process.disconnect!();process.exit(0);}
  await app.automaticBackup.start();await app.automaticBackup.stop();assert(app.automaticBackup.status().enabled,'Actual E/C disk and protected root');app.scheduler.start();
  await new Promise<void>(done=>app.server.listen(0,'127.0.0.1',done));let base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;config.origin=base;
  emit({kind:'ready',profile,base,password,source,root,projectId:project.id,selectedAssetId:selected.id,selectedHash:selected.hash,draftId:draft.id,usage:app.store.capacity!.usage(),limits:app.store.capacity!.limits,seedMs:performance.now()-start,resumedOriginalDataset:resumed,assets:app.snapshot().assets.length,syntheticNativeMessages:messages,modelCalls:0});
  let busy=false;
  process.on('message',async(value:{action?:string})=>{
    if(busy){if(value.action==='close'){closeRequested=true;return;}emit({kind:'error',reason:'Owned benchmark command overlap'});return;}busy=true;
    try{
      if(value.action==='backup'){
        if(app.automaticBackup.status().lastSuccessAt)clock+=86400001;
        const at=performance.now();await app.automaticBackup.tick();const status=app.automaticBackup.status();assert(status.lastSuccessAt&&status.restoreCheckedAt&&!status.error);emit({kind:'backup-done',profile,status,ms:performance.now()-at,rssKiB:process.resourceUsage().maxRSS});
      }else if(value.action==='restart'){
        await app.close();const at=performance.now();app=createApp({dataDir:source,password,schedule:true,storageLimits:options,backup:{root,now:()=>clock}});
        await new Promise<void>(done=>app.server.listen(0,'127.0.0.1',done));base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;config.origin=base;
        emit({kind:'restart-done',profile,base,ms:performance.now()-at,backup:app.automaticBackup.status(),assets:app.snapshot().assets.length});
      }else if(value.action==='restore'){
        const points=readdirSync(join(root,'automatic')).filter(n=>n.startsWith('snapshot-'));assert(points.length>0);const target=resolve('clean-restore-'+randomUUID());const at=performance.now();restore(join(root,'automatic',points.sort().at(-1)!),target);const recovered=new Store(join(target,'workbench.sqlite'));
        try{assert.equal(recovered.list<Asset>('asset').length,app.snapshot().assets.length);for(const asset of recovered.list<Asset>('asset'))assert.equal(sha(readFileSync(join(target,'assets',asset.locator))),asset.hash);const binding=recovered.get<SessionBinding>('session_binding','session:'+native.id);assert(binding.sessionPath.startsWith(target));assert(binding.cwd.startsWith(target));const opened=pi.SessionManager.open(binding.sessionPath,undefined,binding.cwd);assert.equal(opened.getSessionId(),manager.getSessionId());assert.equal(opened.buildSessionContext().messages.length,messages);assert.equal(recovered.db.prepare('SELECT COUNT(*) n FROM sessions').get()!.n,0);}finally{recovered.close();}
        emit({kind:'restore-done',profile,ms:performance.now()-at,assets:app.snapshot().assets.length,nativeMessages:messages,target});
      }else if(value.action==='close'){await app.close();closed=true;emit({kind:'closed'});process.disconnect!();}
    }catch(error){emit({kind:'error',profile,reason:error instanceof Error?error.message:'Owned workload failed',backup:app.automaticBackup.status()});}finally{busy=false;if(closeRequested&&!closed){await app.close();closed=true;emit({kind:'closed'});process.disconnect!();}}
  });
  process.on('disconnect',()=>{if(!closed)void app.close().then(()=>process.exit(0));});
}else{
  const file=resolve('output/dev-evidence/mixed-capacity.json');const previous=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):undefined;const resume=process.argv[2]==='--resume-default'?previous?.profiles?.find((p:any)=>p.profile==='default'):undefined;
  if(resume){const id=dirname(resume.source).split('mixed-').at(-1);assert(id);assert(/^[-a-f0-9]{36}$/.test(id));assert.equal(resume.source,resolve('output/dev-evidence/private/mixed-'+id+'/data'));assert.equal(resume.root,join(process.env.USERPROFILE!,'AI-OS-Backups','mixed-probes',id));const offline=await fetch(resume.base+'/api/health',{signal:AbortSignal.timeout(3000)}).then(()=>false).catch(error=>error.cause?.code==='ECONNREFUSED');assert(offline,'Revalidate stopped original helper before resuming its own synthetic data');}
  mkdirSync(resolve('output/dev-evidence'),{recursive:true});if(existsSync(file)){mkdirSync(resolve('output/dev-evidence/mixed-history'),{recursive:true});copyFileSync(file,resolve('output/dev-evidence/mixed-history/'+Date.now()+'.json'));}
  const report:Record<string,any>={status:'running',at:new Date().toISOString(),modelRequests:0,previousGoalTurn:'progress: Windows deployment, node original bytes and production update',scope:'Actual E/C mixed default asset bound plus isolated full 2GiB total profile; no primary data or credentials copied',thresholds:{snapshotMs:500,searchMs:2000,startupMs:15000},profiles:[]};const save=()=>writeFileSync(file,JSON.stringify(report,null,2));save();
  const primary=await (await fetch('http://127.0.0.1:4310/api/health',{headers:{Connection:'close'}})).json();report.primaryBefore=primary;
  const c=statfsSync(process.env.USERPROFILE!);assert(c.bsize*c.bavail>22*1024**3,'Workload needs independent backup disk space with 12GiB reserve');
  let child:ChildProcess|undefined;let exitPromise:Promise<void>|undefined;
  try{
    for(const profile of ['default','full']){
      const reuse=profile==='default'?resume:undefined;const id=reuse?dirname(reuse.source).split('mixed-').at(-1)!:randomUUID();const cwd=resolve('output/dev-evidence/private/mixed-'+id);const root=join(process.env.USERPROFILE!,'AI-OS-Backups','mixed-probes',id);mkdirSync(cwd,{recursive:true});cpSync(resolve('dist'),join(cwd,'dist'),{recursive:true});assert(!existsSync(join(cwd,'.env')));report.activeObservation={profile,cwd,root,stage:'prepare',resumed:Boolean(reuse)};save();
      const messages=new Map<string,any[]>();const waiters=new Map<string,{resolve:(v:any)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();let exited=false;
      const launch=performance.now();child=fork(fileURLToPath(import.meta.url),['--owned-child',profile],{cwd,env:{...safeEnv(),WB_BACKUP_ROOT:root,...(reuse?{WB_RESUME_SOURCE:reuse.source}:{}),PI_API_KEY:'',PI_MODEL:'',PI_MAX_CALLS:'0',WORKBENCH_PROXY_MODE:'direct'},execArgv:['--import',pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href],windowsHide:true,stdio:['ignore','ignore','pipe','ipc']});report.activeObservation.pid=child.pid;save();
      let stderr='';child.stderr!.on('data',v=>stderr=(stderr+String(v)).slice(-3000));
      exitPromise=new Promise<void>((done,reject)=>{child!.once('exit',code=>{exited=true;for(const waiter of waiters.values()){clearTimeout(waiter.timer);waiter.reject(new Error('Owned benchmark exited '+code));}waiters.clear();code===0?done():reject(new Error('Owned benchmark exited '+code+': '+stderr));});child!.once('error',reject);});void exitPromise.catch(()=>{});
      child.on('message',(value:any)=>{
        if(value.kind==='progress'){report.activeObservation.stage=value.stage;report.activeObservation.count=value.count;save();console.log(`Mixed ${profile}: ${value.stage} ${value.count}`);return;}
        if(value.kind==='error'){for(const waiter of waiters.values()){clearTimeout(waiter.timer);waiter.reject(new Error(value.reason));}waiters.clear();messages.set('error',[value]);return;}
        const waiting=waiters.get(value.kind);if(waiting){clearTimeout(waiting.timer);waiters.delete(value.kind);waiting.resolve(value);}else messages.set(value.kind,[...(messages.get(value.kind)||[]),value]);
      });
      const wait=(kind:string,ms=180000):Promise<any>=>{const error=messages.get('error')?.[0];if(error)return Promise.reject(new Error(error.reason));const queued=messages.get(kind);if(queued?.length)return Promise.resolve(queued.shift());if(exited)return Promise.reject(new Error('Owned benchmark already exited'));return new Promise((done,reject)=>{const timer=setTimeout(()=>{waiters.delete(kind);reject(new Error('Observation timeout for live owned benchmark '+kind+'; no restart'));},ms);waiters.set(kind,{resolve:done,reject,timer});});};
      const {password,...ready}=await wait('ready',900000);const entry:any={...ready,launchWallMs:performance.now()-launch,maintenance:[],...(reuse?{originalSeedMs:reuse.seedMs}: {})};delete entry.kind;report.profiles.push(entry);report.activeObservation.stage='measurement';save();console.log(`Mixed ${profile}: ready ${Math.round(ready.usage.measuredBytes/MiB)}MiB`);
      let base=ready.base;const login=await fetch(base+'/api/login',{method:'POST',headers:{Connection:'close','Content-Type':'application/json'},body:JSON.stringify({password})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie')!.split(';')[0];await login.json();
      const headers={Cookie:cookie,Connection:'close'};
      const timed=async(path:string)=>{const at=performance.now();const response=await fetch(base+'/api'+path,{headers,signal:AbortSignal.timeout(150000)});assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());return {ms:performance.now()-at,bytes};};
      entry.snapshot=[];entry.search=[];for(let i=0;i<5;i++){entry.snapshot.push((await timed('/snapshot')).ms);const sample=await timed(`/projects/${ready.projectId}/assets/search?q=CAPACITY_SMALL_NEEDLE`);const result=JSON.parse(sample.bytes.toString());assert.equal(result.items.length,50);assert.equal(result.total,profile==='default'?600:128);assert.equal(result.issues.length,0);entry.search.push(sample.ms);}save();
      const begin=await fetch(base+'/api/uploads',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({projectId:ready.projectId,name:'capacity-blocked.bin',mime:'application/octet-stream'})});assert.equal(begin.status,201);const upload=await begin.json();
      const blocked=await fetch(base+'/api/uploads/'+upload.id,{method:'PUT',headers:{...headers,'Content-Type':'application/octet-stream'},body:Buffer.alloc(profile==='default'?8*MiB:MiB,0x52)});assert.equal(blocked.status,507,'Actual physical-size admission must reject over-limit upload');entry.capacityRejection=await blocked.json();if(profile==='default')assert(String(entry.capacityRejection.error).includes('资产'));entry.limitUnderTest=profile==='default'?'Default 500MiB asset limit':'Default 2GiB total limit with explicitly enlarged isolated asset/database sublimits';const retained=await timed('/assets/'+ready.selectedAssetId);assert.equal(sha(retained.bytes),ready.selectedHash);entry.rejectedUploadPreservedExistingBytes=true;save();
      for(let index=0;index<(profile==='default'?7:1);index++){
        let done=false;let result:any;let failure:unknown;const completion=wait('backup-done').then(v=>{done=true;result=v;},error=>{done=true;failure=error;});child.send({action:'backup'});const during:number[]=[];
        do{during.push((await timed('/snapshot')).ms);if(!done)await pause(40);}while(!done);await completion;if(failure)throw failure;entry.maintenance.push({step:index+1,ms:result.ms,requests:during.length,maxSnapshotMs:Math.max(...during),rssKiB:result.rssKiB,status:result.status});save();console.log(`Mixed ${profile}: backup ${index+1}, ${Math.round(result.ms)}ms, max HTTP ${Math.round(Math.max(...during))}ms`);
      }
      const restart=wait('restart-done');const at=performance.now();child.send({action:'restart'});const restarted=await restart;base=restarted.base;entry.restart={...restarted,wallMs:performance.now()-at};delete entry.restart.kind;assert.equal(restarted.assets,ready.assets);
      let checked=restarted.backup;const scanAt=performance.now();const duringScan:number[]=[];
      while(checked.checking){duringScan.push((await timed('/snapshot')).ms);checked=JSON.parse((await timed('/backup/status')).bytes.toString());assert(performance.now()-scanAt<180000,'Live recovery scanner observation timeout; no restart');if(checked.checking)await pause(40);}
      assert.equal(checked.retained,profile==='default'?7:1);assert(checked.enabled&&!checked.error);entry.restart.checkedBackup=checked;entry.restart.scanMs=performance.now()-scanAt;entry.restart.maxSnapshotMs=duringScan.length?Math.max(...duringScan):0;assert.equal((JSON.parse((await timed('/snapshot')).bytes.toString()) as Snapshot).assets.length,ready.assets);save();console.log(`Mixed ${profile}: restart ${Math.round(restarted.ms)}ms`);
      const restoring=wait('restore-done');child.send({action:'restore'});const restored=await restoring;entry.restore={...restored};delete entry.restore.kind;save();
      const logout=await fetch(base+'/api/logout',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'});assert.equal(logout.status,200);await logout.json();const closing=wait('closed');child.send({action:'close'});await closing;await exitPromise;child=undefined;exitPromise=undefined;entry.ownedChildExited=true;
      entry.httpStallObserved=Math.max(...entry.snapshot,...entry.maintenance.map((m:any)=>m.maxSnapshotMs))>report.thresholds.snapshotMs;entry.searchSlow=Math.max(...entry.search)>report.thresholds.searchMs;entry.startupSlow=entry.restart.ms>report.thresholds.startupMs;save();
    }
    const after=await (await fetch('http://127.0.0.1:4310/api/health',{headers:{Connection:'close'}})).json();assert.deepEqual(after,primary);report.primaryAfter=after;report.primaryIdentityUnchanged=true;report.status='measured';report.at=new Date().toISOString();report.remaining=['Results are local measurements, not production filesystem quota/WAL or machine crash acceptance','Full profile only raises isolated asset/database sublimits to 1GiB; total stays default 2GiB, other limits unchanged','7 due times use a controlled clock; not 7 real days','Actual phone/remote deployment/Tencent comparison/user feedback/M1 remain'];save();console.log(JSON.stringify({status:report.status,profiles:report.profiles.map((p:any)=>({profile:p.profile,measuredBytes:p.usage.measuredBytes,httpStallObserved:p.httpStallObserved,searchSlow:p.searchSlow,startupSlow:p.startupSlow,restartMs:p.restart.ms,ownedChildExited:p.ownedChildExited}))}));
  }catch(error){report.status='failed';report.reason=error instanceof Error?error.message:'Mixed workload failed';save();throw error;}
  finally{if(child&&child.connected){child.send({action:'close'});await exitPromise?.catch(()=>{});}}
}
