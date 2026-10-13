import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { connect as connectH2, type ClientHttp2Session, type ClientHttp2Stream } from 'node:http2';
import { request as requestHttps, type RequestOptions } from 'node:https';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { connect as connectTls, type TLSSocket } from 'node:tls';
import type { Asset, Draft, Project, Run, Snapshot } from '../shared/contracts.js';

// No config import: fixture must never read the primary .env or credentials.
const workspace = resolve('.');
const output = resolve('output/dev-evidence/https-proxy.json');
const privateRoot = resolve('output/dev-evidence/private/HTTPS 中文 '+randomUUID());
mkdirSync(privateRoot,{recursive:true});
if (existsSync(output)) copyFileSync(output,join(privateRoot,'previous-report.json'));
const lock = JSON.parse(readFileSync(resolve('deployment/caddy-lock.json'),'utf8'));
const executable = resolve(process.env.WB_CADDY_EXE || 'output/dev-evidence/private/caddy-2.11.7/caddy.exe');
const sha = (bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const pause = (ms:number)=>new Promise<void>(done=>setTimeout(done,ms));
const report:Record<string,any> = {at:new Date().toISOString(),status:'running',scope:'Real isolated loopback TLS proxy, no public listener, no main configuration change',modelRequests:0,systemTrustInstalled:false};
const save=()=>writeFileSync(output,JSON.stringify(report,null,2));
const step=(name:string)=>{report.step=name;save();console.log('HTTPS probe: '+name);};
function safeEnv():NodeJS.ProcessEnv {
  return {...process.env,PI_API_KEY:'',PI_MODEL:'',PI_PROVIDER:'anthropic',PI_MAX_CALLS:'0',PI_BUDGET_USD:'0',PI_MAX_OUTPUT_TOKENS:'2048',PI_CALL_RESERVE_USD:'1',PI_TIMEOUT_MS:'120000',DATA_DIR:join(privateRoot,'data'),BACKUP_DIR:join(privateRoot,'backup'),WORKBENCH_PASSWORD:password};
}
type Owned = {child:ChildProcess;exit:Promise<{code:number|null;signal:NodeJS.Signals|null}>;log:string};
function launch(exe:string,args:string[],env:NodeJS.ProcessEnv,label:string):Owned {
  const child=spawn(exe,args,{cwd:workspace,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  const owned:Owned={child,exit:Promise.resolve({code:null,signal:null}),log:''};
  const capture=(chunk:Buffer)=>{owned.log=(owned.log+chunk.toString()).slice(-128000);};
  child.stdout!.on('data',capture);child.stderr!.on('data',capture);
  owned.exit=new Promise((done,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>{child.stdout?.destroy();child.stderr?.destroy();writeFileSync(join(privateRoot,label+'.log'),owned.log.replaceAll(password,'[redacted]'));done({code,signal});});});
  return owned;
}
async function freePort(){const server=createServer();await new Promise<void>((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});const port=(server.address() as {port:number}).port;await new Promise<void>((done,reject)=>server.close(error=>error?reject(error):done()));return port;}
async function until(check:()=>Promise<boolean>,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){if(await check())return;await pause(100);}throw new Error('Observation deadline: '+report.step);}
const password=randomUUID();
let app:Owned|undefined;let proxy:Owned|undefined;let ca:Buffer|undefined;let cookieA='';let cookieB='';let port=0;let origin='';let health:any;let h2:ClientHttp2Session|undefined;let stream:ClientHttp2Stream|undefined;
async function http(path:string,method='GET',data?:unknown,cookie=cookieB,custom:Record<string,string>={},trusted=true){
  const bytes=data===undefined?undefined:Buffer.isBuffer(data)?data:Buffer.from(JSON.stringify(data));
  const headers:Record<string,string>={Host:'studio.test:'+port,Origin:origin,Connection:'close',...(cookie?{Cookie:cookie}:{}),...(bytes?{'Content-Type':Buffer.isBuffer(data)?'application/octet-stream':'application/json','Content-Length':String(bytes.length)}:{}),...custom};
  const options:RequestOptions={hostname:'127.0.0.1',port,path,method,servername:'studio.test',rejectUnauthorized:true,...(trusted?{ca}:{}),headers};
  return new Promise<{status:number;headers:import('node:http').IncomingHttpHeaders;bytes:Buffer;authorized:boolean}>((done,reject)=>{
    const req=requestHttps(options,res=>{const authorized=(res.socket as TLSSocket).authorized;const chunks:Buffer[]=[];res.on('data',chunk=>chunks.push(chunk));res.once('error',reject);res.once('end',()=>done({status:res.statusCode!,headers:res.headers,bytes:Buffer.concat(chunks),authorized}));});
    req.once('error',reject);req.setTimeout(30000,()=>req.destroy(new Error('HTTPS request timeout')));req.end(bytes);
  });
}
async function api<T>(path:string,data?:unknown,method=data===undefined?'GET':'POST',cookie=cookieB):Promise<T>{const res=await http('/api'+path,method,data,cookie);assert(res.status>=200&&res.status<300,'API '+path+' HTTP '+res.status);return JSON.parse(res.bytes.toString()) as T;}
async function login(){const res=await http('/api/login','POST',{password},'');assert.equal(res.status,200);const set=res.headers['set-cookie']?.[0];assert(set);assert(set.includes('Secure')&&set.includes('HttpOnly')&&set.includes('SameSite=Strict'));return set.split(';')[0];}
save();
try {
  step('verify-pinned-executable-and-primary-identity');
  assert.equal(process.platform,'win32','Pinned executable is Windows amd64');assert.equal(process.arch,'x64');
  assert.equal(sha(readFileSync(executable)),lock.windowsAmd64ExecutableSha256);
  report.caddy={version:lock.version,executableSha256:lock.windowsAmd64ExecutableSha256,signatureVerified:false};
  const primaryBefore=await (await fetch('http://127.0.0.1:4310/api/health',{headers:{Connection:'close'}})).json();report.primaryBefore=primaryBefore;
  const backendPort=await freePort();port=await freePort();assert.notEqual(port,backendPort);assert.notEqual(port,4310);assert.notEqual(backendPort,4310);
  origin='https://studio.test:'+port;
  const env={...safeEnv(),PORT:String(backendPort),PUBLIC_ORIGIN:origin,WORKBENCH_SITE:'studio.test:'+port,WORKBENCH_PORT:String(backendPort),PROXY_BIND:'127.0.0.1',TLS_MODE:'tls internal',XDG_DATA_HOME:join(privateRoot,'caddy-data'),XDG_CONFIG_HOME:join(privateRoot,'caddy-config')};
  step('actual-caddy-validation');
  const validation=launch(executable,['validate','--config',resolve('deployment/Caddyfile'),'--adapter','caddyfile'],env,'validation');assert.equal((await validation.exit).code,0,'Caddyfile validation failed; private log retained');report.configurationValidated=true;
  app=launch(process.execPath,['--import','tsx','server/index.ts','--service-instance',randomUUID()],env,'backend');
  proxy=launch(executable,['run','--config',resolve('deployment/Caddyfile'),'--adapter','caddyfile'],env,'proxy');
  const rootCertificate=join(env.XDG_DATA_HOME,'caddy','pki','authorities','local','root.crt');
  step('trusted-tls-and-authentication');
  await until(async()=>{assert.equal(app!.child.exitCode,null,'Owned backend exited');assert.equal(proxy!.child.exitCode,null,'Owned proxy exited');if(!existsSync(rootCertificate))return false;ca=readFileSync(rootCertificate);try{const res=await http('/api/health');if(res.status!==200)return false;assert(res.authorized);health=JSON.parse(res.bytes.toString());return health.ready===true;}catch{return false;}});
  assert.equal(health.pid,app.child.pid);report.ownedBackend={pid:health.pid,instanceId:health.instanceId};
  await assert.rejects(http('/api/health','GET',undefined,'',{},false));report.untrustedCertificateRejected=true;
  assert.equal((await http('/api/snapshot','GET',undefined,'')).status,401);
  cookieA=await login();cookieB=await login();assert.notEqual(cookieA,cookieB);report.secureCookiesAndAuthentication=true;
  const snapshot=await api<Snapshot>('/snapshot');assert.equal(snapshot.config.modelConfigured,false);assert.equal(snapshot.config.deployment,'remote');
  const page=await http('/');assert.equal(page.status,200);assert.equal(page.headers['x-frame-options'],'DENY');assert.equal(page.headers['x-content-type-options'],'nosniff');assert(page.headers['content-security-policy']?.includes("script-src 'self'"));
  const assetPath=page.bytes.toString().match(/src="([^" ]+\.js)"/)?.[1];assert(assetPath);assert.equal((await http(assetPath)).status,200);report.staticPageAndAssetViaHttps=true;
  step('remote-origin-boundary');
  for (const originHeader of ['https://evil.example','http://127.0.0.1:4311']) {const res=await http('/api/projects','POST',{name:'must reject'},cookieB,{Origin:originHeader});report.lastOriginCheck={origin:originHeader,status:res.status};save();assert.equal(res.status,403,'Remote HTTPS must reject origin '+originHeader);}
  assert.equal((await api<Snapshot>('/snapshot')).projects.length,0);report.remoteRejectsDevelopmentOrigin=true;
  const project=await api<Project>('/projects',{name:'HTTPS 双端项目',description:'独立合成数据；不使用模型'});
  step('ten-mib-upload-and-byte-roundtrip');
  const bytes=Buffer.alloc(10*1024*1024,0x61);const upload=await api<{id:string}>('/uploads',{projectId:project.id,name:'十 MiB 原件.txt',mime:'text/plain'});
  const uploaded=await http('/api/uploads/'+upload.id,'PUT',bytes,cookieB,{'X-Content-Hash':sha(bytes)});assert.equal(uploaded.status,200);const asset=JSON.parse(uploaded.bytes.toString()) as Asset;assert.equal(asset.hash,sha(bytes));assert.deepEqual((await http('/api/assets/'+asset.id,'GET',undefined,cookieA)).bytes,bytes);
  const oversized=await api<{id:string}>('/uploads',{projectId:project.id,name:'超限.txt',mime:'text/plain'});const refused=await http('/api/uploads/'+oversized.id,'PUT',Buffer.alloc(bytes.length+1));assert.equal(refused.status,413);assert.equal((await api<Snapshot>('/snapshot')).assets.length,1);report.upload={acceptedBytes:bytes.length,sha256:asset.hash,oversizedStatus:refused.status};
  step('two-session-draft-conflict');
  const draft=await api<Draft>('/drafts',{projectId:project.id,title:'HTTPS 文章',body:'原始正文',sourceIds:[asset.id]});await api('/drafts/'+draft.id,{revision:draft.revision,title:draft.title,body:'电脑更新的正文'},'PATCH');
  assert.equal((await http('/api/drafts/'+draft.id,'PATCH',{revision:draft.revision,title:draft.title,body:'第二端旧版本'},cookieA)).status,409);
  const exported=await http('/api/drafts/'+draft.id+'/export','GET',undefined,cookieA);assert(exported.bytes.includes(Buffer.from('电脑更新的正文')));assert(exported.bytes.includes(Buffer.from(asset.hash)));report.draftConflictAndExport=true;
  step('http2-sse-real-worker-and-sixty-five-second-stream');
  let streamText='';let streamError:Error|undefined;let ended=false;const started=Date.now();
  h2=connectH2(origin,{createConnection:()=>connectTls({host:'127.0.0.1',port,servername:'studio.test',ca,rejectUnauthorized:true,ALPNProtocols:['h2']})});h2.on('error',error=>{streamError=error;});
  await new Promise<void>((done,reject)=>{h2!.once('connect',done);h2!.once('error',reject);});assert.equal((h2.socket as TLSSocket).alpnProtocol,'h2');assert((h2.socket as TLSSocket).authorized);
  stream=h2.request({':path':'/api/events?after='+snapshot.cursor,Cookie:cookieA});stream.setEncoding('utf8');stream.on('data',chunk=>streamText+=chunk);stream.on('error',error=>{streamError=error;});stream.on('end',()=>{ended=true;});
  await until(async()=>{if(streamError)throw streamError;return streamText.includes(': heartbeat');},5000);const firstHeartbeatMs=Date.now()-started;
  const accepted=await api<{run:Run}>('/tasks',{projectId:project.id,mode:'fixture',commandId:randomUUID(),goal:'运行固定资料计算，保存报告、图表和文章草稿'});
  let completed:Run|undefined;await until(async()=>{const run=(await api<Snapshot>('/snapshot')).runs.find(r=>r.id===accepted.run.id);assert(run);assert(['queued','running','completed'].includes(run.status),'Fixture task '+run.status);if(run.status==='completed'){completed=run;return true;}return false;});assert.equal(completed!.calls,0);assert.equal(completed!.resultAssetIds.length,2);
  await until(async()=>{if(streamError)throw streamError;assert(!ended,'SSE ended before observation completed');return Date.now()-started>=65000;},70000);
  const sequences=[...streamText.matchAll(/^id: (\d+)$/gm)].map(match=>Number(match[1]));assert(sequences.length>0);assert(sequences.every((n,i)=>i===0||n>sequences[i-1]));const heartbeatCount=streamText.match(/: heartbeat/g)?.length||0;assert(heartbeatCount>=60);assert(streamText.includes(accepted.run.id));
  report.sse={http2:true,firstHeartbeatMs,durationMs:Date.now()-started,heartbeatCount,events:sequences.length,strictlyOrdered:true,runId:accepted.run.id,modelCalls:completed!.calls};
  step('revocation-closes-existing-proxy-stream');
  const sessions=await api<{hash:string;current:boolean}[]>('/sessions');const target=sessions.find(s=>!s.current);assert(target);const revokedAt=Date.now();await api('/sessions/revoke',{hash:target.hash});await until(async()=>ended,5000);assert.equal((await http('/api/snapshot','GET',undefined,cookieA)).status,401);assert.equal((await http('/api/snapshot')).status,200);report.revocation={streamEndedMs:Date.now()-revokedAt,newRequestStatus:401};cookieA='';
  stream.close();stream=undefined;h2.destroy();h2=undefined;
  step('owned-graceful-shutdown-and-primary-preservation');
  assert.equal((await http('/api/service/shutdown','POST',{instanceId:health.instanceId,ephemeralSession:true})).status,202);cookieB='';assert.equal((await app.exit).code,0);report.backendGracefulExit=true;app=undefined;
  proxy.child.kill();report.proxyExit=await proxy.exit;proxy=undefined;report.ownedProxyStopped=true;
  const primaryAfter=await (await fetch('http://127.0.0.1:4310/api/health',{headers:{Connection:'close'}})).json();assert.deepEqual(primaryAfter,primaryBefore);report.primaryIdentityUnchanged=true;report.primaryAfter=primaryAfter;
  report.status='passed';report.at=new Date().toISOString();report.remaining=['Public DNS/certificate and actual remote host','Real different-network phone','Remote subscription authorization/migration','Production quota/WAL and offsite restoration'];save();console.log('HTTPS proxy passed; zero model requests; primary service unchanged');
} catch(error){report.status='failed';report.reason=error instanceof Error?error.message:'HTTPS probe failed';save();throw error;}
finally {
  stream?.close();h2?.destroy();
  if(app){try{if(cookieB&&health&&ca){await http('/api/service/shutdown','POST',{instanceId:health.instanceId,ephemeralSession:true});await Promise.race([app.exit,pause(5000)]);}}catch{}if(app.child.exitCode===null&&app.child.signalCode===null)app.child.kill();report.cleanupBackend=await app.exit;}
  if(proxy){if(proxy.child.exitCode===null&&proxy.child.signalCode===null)proxy.child.kill();report.cleanupProxy=await proxy.exit;}
  save();
}
