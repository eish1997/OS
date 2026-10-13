import {fork,spawnSync,type ChildProcess} from 'node:child_process';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';

type Message={kind:string;pid?:number;port?:number;checkpoint?:string;instanceId?:string};
type Exit={code:number|null;signal:NodeJS.Signals|null};
const read=(file:string)=>JSON.parse(readFileSync(file,'utf8'));
const sha=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const loader=pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href,helper=resolve('tests/helpers/chatgpt-transfer-process.ts');
export async function probeChatGPTTransferCrash(root=mkdtempSync(join(tmpdir(),'订阅进程 崩溃 '))){
 const runId=randomUUID(),hosts:OwnedHost[]=[],events:unknown[]=[],checks:unknown[]=[];
 const sourceDir=join(root,'source'),targetDir=join(root,'target');
 for(const path of [sourceDir,targetDir]){mkdirSync(path);writeFileSync(join(path,'.transfer-process-fixture.json'),JSON.stringify({runId}),{flag:'wx',mode:0o600});}
 class OwnedHost{
  child:ChildProcess;exit:Promise<Exit>;ended=false;ready?:Message;base='';cookie='';messages:Message[]=[];stderr='';private pending=new Map<string,{resolve:(value:any)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  constructor(readonly directory:string){
   const env=Object.fromEntries(['SystemRoot','USERPROFILE','PATH','TEMP','TMP'].filter(key=>process.env[key]).map(key=>[key,process.env[key]!]));
   this.child=fork(helper,[directory,runId],{execPath:process.execPath,execArgv:['--import',loader],cwd:dirname(directory),env:{...env,DATA_DIR:directory,PI_API_KEY:'',PI_MODEL:'',PI_MAX_CALLS:'0',PI_BUDGET_USD:'0',WORKBENCH_PROXY_MODE:'direct'},windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});events.push({kind:'spawned',pid:this.child.pid,host:directory===sourceDir?'source':'target',at:new Date().toISOString()});
   let buffered='';this.child.stdout!.on('data',b=>{buffered+=String(b);let i;while((i=buffered.indexOf('\n'))>=0){const line=buffered.slice(0,i);buffered=buffered.slice(i+1);let m:Message;try{m=JSON.parse(line);}catch{continue;}this.messages.push(m);if(m.kind==='ready'){this.ready=m;this.base='http://127.0.0.1:'+m.port;}}});
   this.child.stderr!.on('data',b=>{this.stderr=(this.stderr+String(b)).slice(-2000);});
   this.child.on('message',(m:any)=>{if(m.kind==='response'){const p=this.pending.get(m.id);if(p){clearTimeout(p.timer);this.pending.delete(m.id);m.error?p.reject(new Error(m.error)):p.resolve(m.value);}}});
   this.exit=new Promise<Exit>((done,reject)=>{this.child.once('error',reject);this.child.once('close',(code,signal)=>{this.ended=true;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('Owned fixture exited'));}this.pending.clear();const outcome={code,signal};events.push({pid:this.child.pid,exit:outcome,closedAt:new Date().toISOString()});done(outcome);});});
   void this.exit.catch(()=>{this.ended=true;});hosts.push(this);
  }
  async until(check:()=>boolean,label:string){const end=Date.now()+30000;while(!check()){if(this.ended)throw new Error(label+': owned process exited');if(Date.now()>=end)throw new Error(label+': live observation timeout');await new Promise(r=>setTimeout(r,20));}}
  async start(){await this.until(()=>Boolean(this.ready),'startup');assert.equal(this.ready!.pid,this.child.pid);const health=await (await fetch(this.base+'/api/health',{signal:AbortSignal.timeout(5000)})).json();assert.equal(health.pid,this.child.pid);assert.equal(health.instanceId,this.ready!.instanceId);await this.login();return this;}
  async login(){const result=await fetch(this.base+'/api/login',{method:'POST',body:JSON.stringify({password:'process-fixture-password'}),signal:AbortSignal.timeout(5000)});assert.equal(result.status,200);this.cookie=result.headers.get('set-cookie')!.split(';')[0];}
  async call(path:string,data?:unknown){const response=await fetch(this.base+'/api'+path,{headers:{Cookie:this.cookie,Connection:'close'},...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)}),signal:AbortSignal.timeout(10000)});return {status:response.status,value:await response.json()};}
  command(kind:string,value:Record<string,unknown>={}){const id=randomUUID();return new Promise<any>((ok,no)=>{const timer=setTimeout(()=>{this.pending.delete(id);no(new Error('Owned IPC response timeout'));},10000);this.pending.set(id,{resolve:ok,reject:no,timer});this.child.send({kind,id,...value},e=>{if(e){clearTimeout(timer);this.pending.delete(id);no(e);}});});}
  async crash(checkpoint:string,path:string,body:unknown){
   await this.command('arm',{checkpoint});const response=this.call(path,body).then(value=>({returned:true,value}),()=>({returned:false}));
   await this.until(()=>this.messages.some(m=>m.kind==='checkpoint'&&m.checkpoint===checkpoint),'durable checkpoint');
   const event=this.messages.find(m=>m.kind==='checkpoint'&&m.checkpoint===checkpoint)!;assert.equal(event.pid,this.child.pid);assert(!this.ended);assert(this.child.kill('SIGKILL'),'Kill only this owned ChildProcess handle');
   const exit=await this.exit;assert.notEqual(exit.code,0);assert.equal((await response).returned,false,'No false successful HTTP response at interrupted commit');
   events.push({checkpoint,pid:this.child.pid,ownedHandleKilled:true,exit});
  }
  async stop(){if(this.ended)return;this.child.send({kind:'stop'});const timeout=setTimeout(()=>{if(!this.ended)this.child.kill('SIGKILL');},10000);const exit=await this.exit;clearTimeout(timeout);assert.equal(exit.code,0,'Owned graceful cleanup');}
 }
 let source:OwnedHost|undefined,target:OwnedHost|undefined;
 try{
  source=await new OwnedHost(sourceDir).start();target=await new OwnedHost(targetDir).start();
  const auth=await source.call('/chatgpt/start',{});assert.equal(auth.status,200);const url=new URL(auth.value.url);await source.command('nonce',{nonce:url.searchParams.get('nonce')});
  const callback=new URL(url.searchParams.get('redirect_uri')!);callback.search=new URLSearchParams({state:url.searchParams.get('state')!,code:'process-code-fixture',client_id:'oaiapp-process-fixture'}).toString();const connected=await fetch(callback);assert.equal(connected.status,200);await connected.text();
  const status=(await source.call('/chatgpt/status')).value;assert.equal(status.enabled,true);const connectionId=status.connectionId;
  const recipient=(await target.call('/chatgpt/transfer/recipient',{})).value;
  await source.crash('source-frozen','/chatgpt/transfer/begin',{recipient,connectionId});
  assert.equal(read(join(sourceDir,'private-model/transfer-outgoing.json')).phase,'frozen');
  const saved=read(join(sourceDir,'private-model/transfer-offer.json')),hash=sha(saved);
  source=await new OwnedHost(sourceDir).start();assert.equal((await source.call('/chatgpt/status')).value.enabled,false);assert.equal((await source.command('refresh',{connectionId})).allowed,false);
  const offer=await source.call('/chatgpt/transfer/begin',{recipient,connectionId});assert.equal(offer.status,200,`Frozen offer replay HTTP ${offer.status}; ${typeof offer.value?.error==='string'?offer.value.error:'no diagnostic error'}`);assert.equal(sha(offer.value),hash);checks.push({stage:'source-freeze',sameOfferRecovered:true,sourceBlocked:true});
  const packet={bundle:offer.value,sourceHostId:offer.value.header.sourceHostId};
  await target.crash('target-active','/chatgpt/transfer/accept',packet);
  assert.equal(read(join(targetDir,'private-model/transfer-incoming.json')).phase,'installing');assert(existsSync(join(targetDir,'private-model/chatgpt.json')));
  target=await new OwnedHost(targetDir).start();assert.equal((await target.call('/chatgpt/status')).value.enabled,false);assert.equal((await target.command('refresh',{connectionId})).allowed,false);assert.equal((await source.command('refresh',{connectionId})).allowed,false);
  const accepted=await target.call('/chatgpt/transfer/accept',packet);assert.equal(accepted.status,200);const receipt=accepted.value;
  assert.deepEqual((await target.call('/chatgpt/transfer/accept',packet)).value,receipt);const inspect=await target.command('inspect');assert.equal(inspect.ready,true);assert.equal(inspect.hostId,recipient.hostId);assert.equal(inspect.connectionId,connectionId);checks.push({stage:'target-commit',bothBlockedBeforeCommit:true,receiptReplayStable:true,recipientHostPreserved:true});
  await source.crash('source-retired','/chatgpt/transfer/finalize',{receipt});
  assert.equal(read(join(sourceDir,'private-model/transfer-outgoing.json')).phase,'retiring');assert(!existsSync(join(sourceDir,'private-model/chatgpt.json')));
  source=await new OwnedHost(sourceDir).start();assert.equal((await source.call('/chatgpt/status')).value.enabled,false);assert.equal((await source.call('/chatgpt/transfer/finalize',{receipt})).status,200);assert.equal((await source.call('/chatgpt/transfer/finalize',{receipt})).status,200);
  assert.equal(read(join(sourceDir,'private-model/transfer-outgoing.json')).phase,'retired');assert(!existsSync(join(sourceDir,'private-model/transfer-offer.json')));
  const blocked=await source.command('refresh',{connectionId}),refreshed=await target.command('refresh',{connectionId});assert.equal(blocked.allowed,false);assert.equal(blocked.apiFallback,undefined);assert.equal(blocked.refreshes,0);assert.equal(refreshed.allowed,true);assert.equal(refreshed.syntheticValueVerified,true);assert.equal(refreshed.refreshes,1);
  const sourceState=await source.command('inspect');assert.equal(sourceState.apiFallback,false);assert.equal(sourceState.revocations,0);checks.push({stage:'source-retirement',sourceSecretRemoved:true,retirementReplayStable:true,targetOnlyRefresh:true,noApiFallback:true,noRemoteRevocation:true});
  await source.stop();await target.stop();
  for(const host of hosts){assert(host.ended);const exit=await host.exit;assert(exit.code===0||exit.signal==='SIGKILL');}
  return {at:new Date().toISOString(),status:'passed',host:process.platform,ownedProcesses:hosts.length,allOwnedProcessesTerminal:true,actualForcedExits:events.filter((e:any)=>e.ownedHandleKilled).length,checks,events,syntheticProviderOnly:true,modelRequests:0,crossMachine:false,powerFailure:false};
 }catch(error){
  // Diagnose only this probe's synthetic locks; never read credential contents,
  // remove a lock or signal a PID obtained from a saved record.
  const locks=[];for(const [host,directory]of [['source',sourceDir],['target',targetDir]])for(const relative of ['private-model/auth.lock','.storage-write.lock']){
   const path=join(directory,relative);if(!existsSync(path))continue;
   let owner:any;try{owner=read(path);}catch{locks.push({host,path:relative,malformed:true});continue;}
   let signalStatus='invalid';if(Number.isSafeInteger(owner.pid)&&owner.pid>0)try{process.kill(owner.pid,0);signalStatus='exists';}catch(e){signalStatus=e instanceof Error&&'code'in e?String(e.code):'unknown';}
   let osIdentity:unknown;if(process.platform==='win32'&&signalStatus==='exists'){
    const script="$ErrorActionPreference='Stop';$p=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$env:WB_FIXTURE_PID);if($p){@{pid=$p.ProcessId;name=$p.Name;creationUtc=$p.CreationDate.ToUniversalTime().ToString('o')}|ConvertTo-Json -Compress}";
    const result=spawnSync(join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:5000,encoding:'utf8',env:{SystemRoot:process.env.SystemRoot,WB_FIXTURE_PID:String(owner.pid)}});
    if(result.status===0&&result.stdout.trim())try{osIdentity=JSON.parse(result.stdout);}catch{}
   }
   locks.push({host,path:relative,ownerPid:owner.pid,signalStatus,liveOwnedHost:hosts.some(h=>!h.ended&&h.child.pid===owner.pid),osIdentity});
  }
  if(error instanceof Error)Object.assign(error,{diagnostic:{at:new Date().toISOString(),events,locks,syntheticProviderOnly:true,modelRequests:0}});throw error;
 }finally{
  // Never act on a saved PID: only handles created by this probe.
  for(const host of hosts)if(!host.ended){host.child.kill('SIGKILL');await host.exit;}
 }
}
if(resolve(process.argv[1]||'')===fileURLToPath(import.meta.url)){
 const out=resolve('output/dev-evidence/chatgpt-transfer-crash.json'),privateRoot=resolve('output/dev-evidence/private');mkdirSync(privateRoot,{recursive:true});const root=mkdtempSync(join(privateRoot,'transfer-crash-'));
 const result=await probeChatGPTTransferCrash(root);writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
