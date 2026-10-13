// Real stopped mixed workloads, own HTTP instances, no model or primary data.
import assert from 'node:assert/strict';
import { fork,type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync,lstatSync,realpathSync,readFileSync,writeFileSync,unlinkSync,copyFileSync,mkdirSync } from 'node:fs';
import { dirname,join,resolve } from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
const pause=(ms:number)=>new Promise<void>(done=>setTimeout(done,ms));
const safeEnv=()=>Object.fromEntries(['SystemRoot','SystemDrive','WINDIR','ComSpec','PATHEXT','USERPROFILE','TEMP','TMP','PATH','APPDATA','LOCALAPPDATA','HOME','LANG','TZ'].flatMap(k=>process.env[k]===undefined?[]:[[k,process.env[k]!]]));
if(process.argv[2]==='--owned-search'){
  const source=resolve('data');assert(source.includes('output\\dev-evidence\\private\\mixed-'));assert.equal(realpathSync(source),source);assert(!existsSync(resolve('.env')));const credentials=join(source,'credentials.json');assert(!lstatSync(credentials).isSymbolicLink());unlinkSync(credentials);
  const {Store}=await import('../server/store.js');const previous=new Store(join(source,'workbench.sqlite'));try{previous.db.exec('DELETE FROM sessions');}finally{previous.close();}
  const {createApp}=await import('../server/app.js');const {config}=await import('../server/config.js');const password=randomUUID();const app=createApp({dataDir:source,password,schedule:false,storageLimits:process.argv[3]==='full'?{assetsBytes:1024**3,databaseBytes:1024**3}:{}});
  await new Promise<void>(done=>app.server.listen(0,'127.0.0.1',done));const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;config.origin=base;
  let closed=false;process.on('disconnect',()=>{if(!closed)void app.close().then(()=>process.exit(0));});process.on('message',async(value:{action?:string})=>{if(value.action==='close'&&!closed){closed=true;await app.close();process.send?.({kind:'closed'},()=>process.disconnect!());}});
  const samples=[];for(let i=0;i<5;i++){const at=performance.now();const usage=app.store.capacity!.usage();samples.push({ms:performance.now()-at,measuredBytes:usage.measuredBytes,issues:usage.issues.length});}
  const writeProject=app.snapshot().projects.filter(p=>p.name.startsWith('单次遍历写入测量 · ')).at(-1);const previousWrites=writeProject?app.snapshot().assets.filter(a=>a.projectId===writeProject.id).length:0;
  process.send?.({kind:'ready',base,password,assets:app.snapshot().assets.length,storageSamples:samples,writeProject,previousWrites});
}else{
  const original=JSON.parse(readFileSync('output/dev-evidence/mixed-capacity.json','utf8'));const last=JSON.parse(readFileSync('output/dev-evidence/backup-startup.json','utf8'));assert.equal(original.status,'measured');assert.equal(last.status,'passed');
  const file=resolve('output/dev-evidence/search-performance.json');if(existsSync(file)){mkdirSync(resolve('output/dev-evidence/search-history'),{recursive:true});copyFileSync(file,resolve('output/dev-evidence/search-history/'+Date.now()+'.json'));}
  const report:any={status:'running',at:new Date().toISOString(),modelRequests:0,previousGoalTurn:'progress: mixed capacity, native archive and background startup applied',thresholds:{searchMs:2000,snapshotMs:500},profiles:[]};const save=()=>writeFileSync(file,JSON.stringify(report,null,2));save();
  const primary=await (await fetch('http://127.0.0.1:4310/api/health',{headers:{Connection:'close'}})).json();report.primaryBefore=primary;let child:ChildProcess|undefined;let exited:Promise<void>|undefined;
  try{
    for(const p of original.profiles){
      assert(p.ownedChildExited);const id=dirname(p.source).split('mixed-').at(-1)!;assert(/^[-a-f0-9]{36}$/.test(id));assert.equal(p.source,resolve('output/dev-evidence/private/mixed-'+id+'/data'));const prior=last.profiles.find((v:any)=>v.profile===p.profile);assert(prior.ownedChildExited);const stopped=await fetch(prior.base+'/api/health',{signal:AbortSignal.timeout(3000)}).then(()=>false).catch(e=>e.cause?.code==='ECONNREFUSED');assert(stopped,'Original helper must actually be stopped');
      let ready:any;let stderr='';let failure:Error|undefined;let ended=false;const launch=performance.now();child=fork(fileURLToPath(import.meta.url),['--owned-search',p.profile],{cwd:dirname(p.source),env:{...safeEnv(),PI_API_KEY:'',PI_MODEL:'',PI_MAX_CALLS:'0',WORKBENCH_PROXY_MODE:'direct'},execArgv:['--import',pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href],windowsHide:true,stdio:['ignore','ignore','pipe','ipc']});report.activeObservation={profile:p.profile,pid:child.pid,source:p.source};save();
      child.stderr!.on('data',v=>stderr=(stderr+String(v)).slice(-2000));child.on('message',(v:any)=>{if(v.kind==='ready')ready=v;});exited=new Promise<void>((done,reject)=>{child!.once('exit',code=>{ended=true;code===0?done():reject(new Error('Owned search helper exited '+code+': '+stderr));});child!.once('error',reject);});void exited.catch(e=>{failure=e;});
      while(!ready){if(failure)throw failure;assert(!ended);assert(performance.now()-launch<180000,'Live helper observation timeout; no restart');await pause(25);}
      const {password,...visible}=ready;const entry:any={profile:p.profile,source:p.source,projectId:p.projectId,...visible,search:[]};delete entry.kind;report.profiles.push(entry);save();
      const login=await fetch(ready.base+'/api/login',{method:'POST',headers:{Connection:'close','Content-Type':'application/json'},body:JSON.stringify({password})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie')!.split(';')[0];await login.json();const headers={Cookie:cookie,Connection:'close'};
      const get=async(path:string)=>{const response=await fetch(ready.base+'/api'+path,{headers,signal:AbortSignal.timeout(40000)});assert.equal(response.status,200);return response.json();};
      for(const query of ['CAPACITY_SMALL_NEEDLE','CAPACITY_LARGE_NEEDLE','大文件-']){
        const samples=[];
        for(let index=0;index<3;index++){
          const at=performance.now();let finished=false;let result:any;let error:unknown;const work=get(`/projects/${p.projectId}/assets/search?q=${encodeURIComponent(query)}`).then(v=>{finished=true;result=v;},e=>{finished=true;error=e;});const during=[];
          do{const time=performance.now();const snapshot=await get('/snapshot');assert.equal(snapshot.assets.length,ready.assets);during.push(performance.now()-time);if(!finished)await pause(40);}while(!finished);await work;if(error)throw error;
          const elapsed=performance.now()-at;assert.equal(result.issues.length,0);const total=query==='CAPACITY_SMALL_NEEDLE'?(p.profile==='default'?600:128):query==='CAPACITY_LARGE_NEEDLE'?(p.profile==='default'?24:119):(p.profile==='default'?60:127);assert.equal(result.total,total);assert.equal(result.items.length,Math.min(total,50));assert(result.items.every((i:any)=>i.asset.projectId===p.projectId));samples.push({ms:elapsed,requests:during.length,maxSnapshotMs:Math.max(...during),total,items:result.items.length});
        }
        entry.search.push({query,samples});save();console.log(`Search ${p.profile} ${query}: max ${Math.round(Math.max(...samples.map(v=>v.ms)))}ms, max data ${Math.round(Math.max(...samples.map(v=>v.maxSnapshotMs)))}ms`);
      }
      if(p.profile==='default'){
        let project=ready.writeProject;if(!project){const created=await fetch(ready.base+'/api/projects',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({name:'单次遍历写入测量 · '+randomUUID()})});assert.equal(created.status,201);project=await created.json();}const times:number[]=[];entry.writeProgress={projectId:project.id,previousFiles:ready.previousWrites,completed:ready.previousWrites};save();
        for(let index=ready.previousWrites;index<30;index++){const at=performance.now();const begin=await fetch(ready.base+'/api/uploads',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({projectId:project.id,name:'写入-'+index+'.md',mime:'text/markdown'})});assert.equal(begin.status,201);const upload=await begin.json();const result=await fetch(ready.base+'/api/uploads/'+upload.id,{method:'PUT',headers:{...headers,'Content-Type':'application/octet-stream'},body:Buffer.alloc(32*1024,0x77)});assert.equal(result.status,200);await result.json();times.push(performance.now()-at);entry.writeProgress.completed=index+1;save();}
        entry.controlledWrites={projectId:project.id,files:30,previousFiles:ready.previousWrites,measuredNewFiles:times.length,bytesPerFile:32768,ms:times,totalMs:times.reduce((a,b)=>a+b,0),note:'Appended only new synthetic assets in a separate owned project; same default storage boundaries. Prior successful file is preserved; its lost wall time is not invented.'};save();
      }
      const logout=await fetch(ready.base+'/api/logout',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'});assert.equal(logout.status,200);await logout.json();child.send({action:'close'});await exited;child=undefined;exited=undefined;entry.ownedChildExited=true;save();
    }
    const after=await (await fetch('http://127.0.0.1:4310/api/health',{headers:{Connection:'close'}})).json();assert.deepEqual(after,primary);report.primaryIdentityUnchanged=true;report.primaryAfter=after;report.status='measured';report.at=new Date().toISOString();report.remaining=['Results cover local measured queries, not all queries or production OS quotas','Physical quota/WAL, remote phone, offsite restore, Tencent and M1 remain'];save();
  }catch(error){report.status='failed';report.reason=error instanceof Error?error.message:'Search workload failed';save();throw error;}
  finally{if(child?.connected){child.send({action:'close'});await exited?.catch(()=>{});}}
}
