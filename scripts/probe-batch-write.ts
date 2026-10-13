// Full deterministic workload; own new data/credentials, no primary model config.
import assert from 'node:assert/strict';
import {fork,type ChildProcess} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,realpathSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import type {Asset,Run,SessionBinding} from '../shared/contracts.js';
const MiB=1024**2,sha=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
const safeEnv=()=>Object.fromEntries(['SystemRoot','SystemDrive','WINDIR','ComSpec','PATHEXT','USERPROFILE','TEMP','TMP','PATH','APPDATA','LOCALAPPDATA','HOME','LANG','TZ'].flatMap(k=>process.env[k]===undefined?[]:[[k,process.env[k]!]]));
if(process.argv[2]==='--owned-batch'){
 const root=resolve('.'),source=resolve('data');assert(root.includes('output\\dev-evidence\\private\\batch-'));assert.equal(realpathSync(root),root);assert(!existsSync(resolve('.env')));assert(!existsSync(source));
 const {createApp}=await import('../server/app.js');const {loadPi}=await import('../server/pi-adapter.js');const {guardSessionPersistence}=await import('../server/session-capacity.js');
 const app=createApp({dataDir:source,password:randomUUID(),schedule:false});const start=performance.now(),expected=new Map<string,string>(),times:number[]=[];
 const emit=(value:Record<string,unknown>)=>process.send?.(value);emit({kind:'started',pid:process.pid,source});
 try{
 const pi=await loadPi(),p=app.service.createProject('完整建档容量测量'),assetStart=performance.now();
 const commit=(name:string,mime:string,bytes:Buffer,extra={})=>{const at=performance.now();const upload=app.assets.begin(p.id,name,mime,[],extra);const a=app.assets.commit(upload.id,bytes);times.push(performance.now()-at);expected.set(a.id,sha(bytes));return a;};
 for(let i=0;i<600;i++){
   const content=Buffer.from(('固定合成研究资料：中文正文、来源、指标。\n').repeat(1200));const bytes=Buffer.alloc(32*1024,0x61);content.copy(bytes,0,0,Math.min(content.length,bytes.length-100));Buffer.from(' CAPACITY_SMALL_NEEDLE '+i).copy(bytes,bytes.length-100);commit(`资料-${i}.md`,'text/markdown',bytes);
   if((i+1)%50===0)emit({kind:'progress',stage:'small-assets',count:i+1,elapsedMs:performance.now()-start});
 }
 let selected:Asset|undefined;
 for(let i=0;i<60;i++){
   const bytes=Buffer.alloc(8*MiB,0x61);bytes.writeUInt32LE(i,0);if(i<24){bytes.fill(0x61,0,8);Buffer.from(' CAPACITY_LARGE_NEEDLE '+i).copy(bytes,bytes.length-100);}const a=commit(`大文件-${i}.${i<24?'txt':'bin'}`,i<24?'text/plain':'application/octet-stream',bytes);selected??=a;
   if((i+1)%10===0)emit({kind:'progress',stage:'large-assets',count:i+1,elapsedMs:performance.now()-start});
 }
 const previous=app.snapshot().assets[0],version=commit('资料-0.md','text/markdown',Buffer.from('第二版中文资料 CAPACITY_VERSION_NEEDLE'),{parentVersionId:previous.id});assert.equal(version.version,2);const assetsMs=performance.now()-assetStart;
 app.service.draft(p.id,'混合资料来源稿','这是固定合成工作负载，不能当作真实模型输出。',[version.id,selected!.id]);
 const cwd=join(source,'workspaces',p.id);mkdirSync(cwd,{recursive:true});const manager=pi.SessionManager.create(cwd,join(source,'sessions',p.id));const guard=guardSessionPersistence(manager,app.store.capacity!);for(let i=0;i<16;i++)manager.appendMessage({role:'user',content:'离线固定会话 '+i+' '+('x'.repeat(512*1024)),timestamp:Date.now()});guard.assertHealthy();
 const policy={version:1,projectId:p.id,toolNames:['write_asset'],allowModel:false,maxCalls:0,maxCostUsd:0,reservePerCallUsd:0,maxOutputTokens:10,timeoutMs:60000};let native=app.service.submit(p.id,'离线合成会话归档',randomUUID(),'pi',policy).run;app.service.transition(native.id,'running');native=app.store.get<Run>('run',native.id);app.store.update<Run>('run',native.id,native.revision,{sessionId:manager.getSessionId(),sessionPath:manager.getSessionFile()!});app.service.transition(native.id,'completed');app.store.create<SessionBinding>('session_binding',{id:'session:'+native.id,projectId:p.id,runId:native.id,taskId:native.taskId,sessionId:manager.getSessionId(),sessionPath:manager.getSessionFile()!,cwd,piVersion:'1.0.3',policyVersion:1,model:'',authKind:'api'});
 for(const [folder,size] of [['workspaces',16*MiB],['logs',MiB],['uploads',4*MiB]] as const){mkdirSync(join(source,folder),{recursive:true});app.store.capacity!.write(folder,size,()=>writeFileSync(join(source,folder,'synthetic-retained.bin'),Buffer.alloc(size,0x71)));}
 app.store.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');const seedMs=performance.now()-start,usage=app.store.capacity!.usage();
 const assets=app.snapshot().assets;assert.equal(assets.length,661);assert.equal(usage.issues.length,0);for(const a of assets)assert.equal(sha(app.assets.read(a)),expected.get(a.id));assert.equal(pi.SessionManager.open(manager.getSessionFile()!,undefined,cwd).buildSessionContext().messages.length,16);
 const before=readFileSync(join(app.assets.dir,selected!.locator)),upload=app.assets.begin(p.id,'quota-denied.bin','application/octet-stream');assert.throws(()=>app.assets.commit(upload.id,Buffer.alloc(2*MiB)),(e:unknown)=>e instanceof Error&&'status'in e&&e.status===507);assert.equal(app.snapshot().assets.length,661);assert(before.equals(app.assets.read(selected!)));
 emit({kind:'result',source,projectId:p.id,assets:661,verifiedHashes:expected.size,assetManifestSha256:sha(JSON.stringify(assets.map(a=>({name:a.name,mime:a.mime,size:a.size,hash:a.hash,version:a.version})))),assetsMs,seedMs,writeSamples:times,totalAssetBytes:assets.reduce((n,a)=>n+a.size,0),usage,nativeMessages:16,deniedBeforeAssetWrite:true,selectedPreserved:true,modelRequests:0,maxRssKiB:process.resourceUsage().maxRSS});
 }finally{await app.close();process.disconnect!();}
}else{
 const tag=process.argv[2]||'after';assert(['before','after'].includes(tag));const owner=randomUUID(),root=resolve('output/dev-evidence/private/batch-'+owner);mkdirSync(root,{recursive:true});assert.equal(realpathSync(root),root);writeFileSync(join(root,'probe-owner.json'),JSON.stringify({owner,kind:'owned batch probe',workspace:process.cwd()}));
 const file=resolve('output/dev-evidence/batch-write-'+tag+'.json');assert(!existsSync(file),'Do not overwrite an existing batch measurement');const primary=await(await fetch('http://127.0.0.1:4310/api/health',{signal:AbortSignal.timeout(3000)})).json();const sourceHashes=Object.fromEntries(['server/storage.ts','server/assets.ts','scripts/probe-batch-write.ts','package-lock.json'].map(p=>[p,sha(readFileSync(p))]));const report:any={status:'running',at:new Date().toISOString(),modelRequests:0,previousGoalTurn:'progress: read-only mapping and byte validation applied',primaryBefore:primary,root,progress:[],sourceBaseline:tag,sourceHashes};const save=()=>writeFileSync(file,JSON.stringify(report,null,2));save();
 let child:ChildProcess|undefined;let failed:Error|undefined;let ended=false,result:any,stderr='';const measurements:number[]=[];
 try{
 child=fork(fileURLToPath(import.meta.url),['--owned-batch'],{cwd:root,env:{...safeEnv(),PI_API_KEY:'',PI_MODEL:'',PI_MAX_CALLS:'0',WORKBENCH_PROXY_MODE:'direct'},execArgv:['--import',pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href],windowsHide:true,stdio:['ignore','ignore','pipe','ipc']});report.ownedPid=child.pid;save();child.stderr!.on('data',v=>stderr=(stderr+String(v)).slice(-2000));child.on('message',(v:any)=>{if(v.kind==='result')result=v;else{report.progress.push(v);save();if(v.kind==='progress')console.log(`${tag} ${v.stage}: ${v.count}, ${Math.round(v.elapsedMs)}ms`);}});
 const exited=new Promise<void>((done,reject)=>{child!.once('exit',code=>{ended=true;code===0?done():reject(new Error('Owned batch probe exited '+code+': '+stderr));});child!.once('error',e=>{ended=true;reject(e);});});void exited.catch(e=>{failed=e;});
 while(!ended){if(failed)throw failed;const at=performance.now();const health=await(await fetch('http://127.0.0.1:4310/api/health',{signal:AbortSignal.timeout(3000)})).json();assert.deepEqual(health,primary);measurements.push(performance.now()-at);await new Promise<void>(done=>setTimeout(done,250));}
 await exited;if(failed)throw failed;assert(result);delete result.kind;report.result=result;report.primaryIdentityUnchanged=true;report.primaryHealthSamples=measurements.length;report.maxPrimaryHealthMs=Math.max(...measurements);report.ownedChildExited=true;report.status='measured';report.at=new Date().toISOString();save();console.log(JSON.stringify({tag,status:report.status,assets:result.assets,assetsMs:result.assetsMs,seedMs:result.seedMs,verifiedHashes:result.verifiedHashes,modelRequests:0,ownedChildExited:true}));
 }catch(e){report.status='failed';report.reason=e instanceof Error?e.message:'Batch probe failed';save();throw e;}
 // Synchronous seeding does not service IPC cancellation. On error stop only this
 // retained ChildProcess and wait for its terminal state; never use a saved PID.
 finally{if(child?.pid&&!ended&&child.exitCode===null&&child.signalCode===null){await new Promise<void>(done=>{child!.once('exit',()=>done());child!.kill();});}}
}
