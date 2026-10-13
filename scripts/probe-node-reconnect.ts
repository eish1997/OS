import assert from 'node:assert/strict';
import {createServer,request as forward,type ClientRequest,type ServerResponse} from 'node:http';
import {fork,type ChildProcess} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createApp} from '../server/app.js';
import {config} from '../server/config.js';
import type {Run,Asset} from '../shared/contracts.js';

// Real outbound CLI and HTTP fault injection; never targets the main service.
assert.equal(config.apiKey,'');assert.equal(config.model,'');assert.equal(config.maxCalls,0);assert.equal(config.budgetUsd,0);
const root=resolve(process.env.WB_NODE_RECOVERY_DIR||'output/dev-evidence/private/node-reconnect');
assert(!existsSync(join(root,'server','workbench.sqlite')),'Use a fresh isolated probe directory');
mkdirSync(root,{recursive:true});
const allowed=join(root,'permitted'),out=resolve(process.env.WB_NODE_RECOVERY_REPORT||'output/dev-evidence/node-reconnect.json');
const app=createApp({dataDir:join(root,'server'),password:'synthetic-node-recovery-password',schedule:true});
const connections=new Set<ClientRequest>(),responses=new Set<ServerResponse>();
let paused=true,dropAcknowledgement=false,dropBeforeCommit=false,droppedAck=0,droppedBefore=0,failedPolls=0,forwardedResults=0;
const proxy=createServer((req,res)=>{
 responses.add(res);res.once('close',()=>responses.delete(res));
 if(paused){if(req.url==='/api/node/poll')failedPolls++;req.resume();res.writeHead(503);res.end();return;}
 if(req.url==='/api/node/result'&&dropBeforeCommit){dropBeforeCommit=false;droppedBefore++;paused=true;req.resume();res.socket?.destroy();return;}
 const lose=req.url==='/api/node/result'&&dropAcknowledgement;if(lose)dropAcknowledgement=false;
 if(req.url==='/api/node/result')forwardedResults++;
 const upstream=forward({host:'127.0.0.1',port:(app.server.address() as {port:number}).port,path:req.url,method:req.method,headers:req.headers},reply=>{
  if(lose){reply.resume();reply.once('end',()=>{droppedAck++;paused=true;res.socket?.destroy();});return;}
  res.writeHead(reply.statusCode!,reply.headers);reply.pipe(res);
 });connections.add(upstream);upstream.once('close',()=>connections.delete(upstream));upstream.once('error',()=>{if(!res.headersSent)res.writeHead(503);res.end();});res.once('close',()=>upstream.destroy());req.pipe(upstream);
});
let child:ChildProcess|undefined,childExit:Promise<{code:number|null;signal:NodeJS.Signals|null}>|undefined;
let output='',errorOutput='';
const delay=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
async function until(check:()=>boolean,label:string,timeout=25000){const end=Date.now()+timeout;while(!check()&&Date.now()<end){if(child&&child.exitCode!==null)throw new Error('Node exited unexpectedly');await delay(50);}assert(check(),label);}
function ledger(){const file=join(allowed,'node-ledger.json');return existsSync(file)?JSON.parse(readFileSync(file,'utf8')) as Record<string,{content:string;sent:boolean}>:{};}
const result:any={at:new Date().toISOString(),status:'running',modelRequests:0,scope:'Independent local loopback backend and actual outbound CLI; no real remote host or OS sleep',checks:[]};
try{
 await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));await new Promise<void>(r=>proxy.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+(app.server.address() as {port:number}).port;
 const login=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({password:'synthetic-node-recovery-password'})});assert(login.ok);const cookie=login.headers.get('set-cookie')!.split(';')[0];
 async function post(path:string,body:unknown){const res=await fetch(base+path,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});assert(res.ok,'Probe API '+path+': '+res.status);return res.json();}
 const project=await post('/api/projects',{name:'节点真实断线恢复'});const pair=await post('/api/nodes',{name:'isolated outbound node',projectIds:[project.id]});
 const submit=(key:string)=>post('/api/tasks',{projectId:project.id,mode:'node',nodeId:pair.node.id,goal:'可信文件断线验证',commandId:key});
 const first=(await submit('ack-loss')).run as Run;
 await until(()=>app.store.get<Run>('run',first.id).status==='waiting_node','Offline node must wait before dispatch');
 child=fork(resolve('scripts/local-node.ts'),[],{cwd:root,execPath:process.execPath,execArgv:['--import',pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href],env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,NODE_SERVER:'http://127.0.0.1:'+(proxy.address() as {port:number}).port,NODE_ID:pair.node.id,NODE_TOKEN:pair.token,NODE_ALLOWED_DIR:allowed,DATA_DIR:join(root,'node-host'),PI_API_KEY:'',PI_MODEL:'',PI_MAX_CALLS:'0',PI_BUDGET_USD:'0'},stdio:['ignore','pipe','pipe','ipc']});
 childExit=new Promise(r=>child!.once('exit',(code,signal)=>r({code,signal})));child.stdout!.on('data',b=>{output+=b;});child.stderr!.on('data',b=>{errorOutput+=b;});
 await until(()=>failedPolls>=2,'Real CLI must observe HTTP503');assert.equal(app.snapshot().assets.length,0);
 result.checks.push({name:'offline-before-dispatch',status:'passed',failedPolls,runStatus:app.store.get<Run>('run',first.id).status,nodePid:child.pid});
 dropAcknowledgement=true;paused=false;
 await until(()=>droppedAck===1&&Boolean(ledger()[first.id]),'Commit response must actually be lost');
 assert.equal(app.store.get<Run>('run',first.id).status,'completed');assert.equal(ledger()[first.id].sent,false);assert.equal(app.snapshot().assets.length,1);
 const firstBytes=readFileSync(join(allowed,first.id+'.md'));const firstAsset=app.snapshot().assets[0] as Asset;assert.deepEqual(app.assets.read(firstAsset),firstBytes);
 paused=false;await until(()=>ledger()[first.id]?.sent===true,'Original receipt must reconcile automatically');
 assert.equal(app.snapshot().assets.length,1);assert.deepEqual(readFileSync(join(allowed,first.id+'.md')),firstBytes);
 result.checks.push({name:'committed-receipt-lost-ack',status:'passed',assetCount:1,deliveryRequests:forwardedResults,fileSha256:createHash('sha256').update(firstBytes).digest('hex'),nodePidUnchanged:true});
 dropBeforeCommit=true;const second=(await submit('delivery-outage')).run as Run;
 await until(()=>droppedBefore===1&&Boolean(ledger()[second.id]),'Uncommitted delivery must fail after durable local file');
 assert.equal(ledger()[second.id].sent,false);assert.equal(app.snapshot().assets.length,1);const secondBytes=readFileSync(join(allowed,second.id+'.md'));
 const third=(await submit('queued-after-outage')).run as Run;
 const outageStarted=Date.now();await until(()=>app.store.get<Run>('run',second.id).status==='interrupted','Real wall-clock node lease must expire',24000);
 assert.equal(app.store.get<Run>('run',third.id).status,'queued');assert(!existsSync(join(allowed,third.id+'.md')));
 const interruptedMs=Date.now()-outageStarted;assert.equal(app.snapshot().assets.length,1);
 paused=false;await until(()=>ledger()[second.id]?.sent===true&&app.store.get<Run>('run',second.id).error?.includes('已对账')===true,'Durable receipt must reconcile expired lease without re-execution');
 assert.deepEqual(readFileSync(join(allowed,second.id+'.md')),secondBytes);
 await until(()=>app.store.get<Run>('run',third.id).status==='completed'&&ledger()[third.id]?.sent===true,'Queued task must resume after reconciliation');
 const snap=app.snapshot();assert.equal(snap.runs.length,3);assert.equal(snap.assets.length,3);
 for(const run of [first,second,third]){const current=app.store.get<Run>('run',run.id);assert.equal(current.resultAssetIds.length,1);assert.equal(current.attempt,1);assert.deepEqual(app.assets.read(snap.assets.find(a=>a.id===current.resultAssetIds[0])!),readFileSync(join(allowed,run.id+'.md')));}
 result.checks.push({name:'uncommitted-outage-lease-expiry-and-queued-release',status:'passed',interruptedMs,finalInterruptedStatus:app.store.get<Run>('run',second.id).status,finalInterruptedError:app.store.get<Run>('run',second.id).error,queuedCompleted:true,assets:3,runs:3,allAttemptOne:true,bytesPreserved:true,nodePid:child.pid});
 assert.equal(child.exitCode,null);result.status='passed';result.nodePid=child.pid;result.forwardedResults=forwardedResults;result.droppedAck=droppedAck;result.droppedBefore=droppedBefore;
 await post('/api/logout',{});
}catch(e){result.status='failed';result.failure=e instanceof Error?e.message:String(e);throw e;}
finally{
 if(child&&child.exitCode===null&&child.signalCode===null)child.kill();if(childExit)result.nodeExit=await childExit;
 for(const req of connections)req.destroy();for(const res of responses)res.destroy();proxy.closeAllConnections();await new Promise<void>(r=>proxy.close(()=>r()));await app.close();
 result.nodeLogSha256=createHash('sha256').update(output+'\n'+errorOutput).digest('hex');result.cleanup='Owned child handle exit awaited, proxy connections closed, isolated backend closed';mkdirSync(resolve(out,'..'),{recursive:true});writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
