import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.js';
import {PrivateFiles} from '../server/private-files.js';
import {backup} from '../server/backup.js';
import type {Credential} from '../server/chatgpt-auth.js';
import type {TransferBundle,TransferReceipt} from '../server/chatgpt-transfer.js';

const keys=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...keys.publicKey.export({format:'jwk'}),kid:'transfer-fixture-key',use:'sig',alg:'RS256'};
const encoded=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
const scopes='openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
async function fixture(root=mkdtempSync(join(tmpdir(),'订阅迁移 QA '))){
 let authorization:URL|undefined,refreshes=0,revocations=0;let refreshGate:Promise<void>|undefined;
 const fetcher:typeof fetch=async(input,init)=>{
  const url=String(input);
  if(url==='https://auth.openai.com/.well-known/jwks.json')return Response.json({keys:[jwk]});
  if(url==='https://auth.openai.com/api/accounts/oauth/token'){
   const form=new URLSearchParams(String(init?.body));const refreshing=form.get('grant_type')==='refresh_token';
   if(refreshing){refreshes++;assert.equal(form.get('refresh_token'),'TRANSFER_REFRESH_SECRET');await refreshGate;}
   else{assert.equal(form.get('redirect_uri'),authorization!.searchParams.get('redirect_uri'));assert(form.get('code_verifier'));}
   const input=[encoded({alg:'RS256',kid:jwk.kid}),encoded({iss:'https://auth.openai.com',aud:'oaiapp-transfer-qa',sub:'selected-transfer-user',exp:Math.floor(Date.now()/1000)+3600,...(!refreshing?{nonce:authorization!.searchParams.get('nonce')}:{})})].join('.');
   return Response.json({access_token:refreshing?'TARGET_REFRESHED_SECRET':'TRANSFER_ACCESS_SECRET',refresh_token:'TRANSFER_REFRESH_SECRET',id_token:input+'.'+sign('RSA-SHA256',Buffer.from(input),keys.privateKey).toString('base64url'),scope:scopes,token_type:'Bearer',expires_in:3600});
  }
  if(url==='https://api.openai.com/v1/models')return Response.json({models:[{slug:'gpt-5.6-sol',display_name:'Offline migration fixture',visibility:'list'}]});
  if(url==='https://auth.openai.com/api/accounts/oauth/revoke'){revocations++;return new Response('',{status:200});}
  throw new Error('External request forbidden in synthetic transfer fixture');
 };
 const app=createApp({dataDir:root,password:'transfer-qa-password',schedule:false,chatgpt:{fetch:fetcher}});
 await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+(app.server.address() as {port:number}).port;
 const login=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({password:'transfer-qa-password'})});const cookie=login.headers.get('set-cookie')!.split(';')[0];
 const call=async(path:string,data?:unknown)=>{const response=await fetch(base+'/api'+path,{headers:{Cookie:cookie},...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})});return {status:response.status,value:await response.json()};};
 const connect=async()=>{
  const start=await call('/chatgpt/start',{});assert.equal(start.status,200);authorization=new URL(start.value.url);
  const callback=new URL(authorization.searchParams.get('redirect_uri')!);callback.search=new URLSearchParams({code:'synthetic-transfer-code',state:authorization.searchParams.get('state')!,client_id:'oaiapp-transfer-qa'}).toString();const response=await fetch(callback);assert.equal(response.status,200);await response.text();assert.equal(app.chatgpt.ready(),true);
 };
 const files=new PrivateFiles(root,app.store.capacity!);
 return {app,root,files,base,call,connect,counts:()=>({refreshes,revocations}),setRefreshGate:(gate:Promise<void>)=>refreshGate=gate};
}
const connectPair=async()=>{
 const source=await fixture(),target=await fixture();await source.connect();
 const recipient=(await target.call('/chatgpt/transfer/recipient',{})).value;
 const original=source.files.read<Credential>('chatgpt.json')!;
 const offer=await source.call('/chatgpt/transfer/begin',{recipient,connectionId:original.connectionId});assert.equal(offer.status,200);
 return {source,target,recipient,original,bundle:offer.value as TransferBundle};
};

test('authenticated encrypted handoff preserves VM host/model and leaves exactly one refresh owner after restart',async()=>{
 const q=await connectPair();let reopened:Awaited<ReturnType<typeof fixture>>|undefined;
 try{
  const {source,target,bundle,original,recipient}=q;
  assert.equal((await fetch(target.base+'/api/chatgpt/transfer/accept',{method:'POST',body:'{}'})).status,401);
  assert(!JSON.stringify(bundle).includes('TRANSFER_ACCESS_SECRET'));assert(!JSON.stringify(bundle).includes('TRANSFER_REFRESH_SECRET'));
  assert.equal(source.app.chatgpt.ready(),false);assert.equal(source.app.modelAccess.settings().binding.kind,'chatgpt');await assert.rejects(source.app.chatgpt.access(original.connectionId),/迁移|迁出/);
  assert.deepEqual((await source.call('/chatgpt/transfer/begin',{recipient,connectionId:original.connectionId})).value,bundle);
  const accepted=await target.call('/chatgpt/transfer/accept',{bundle,sourceHostId:bundle.header.sourceHostId});assert.equal(accepted.status,200);const receipt=accepted.value as TransferReceipt;
  assert.deepEqual((await target.call('/chatgpt/transfer/accept',{bundle,sourceHostId:bundle.header.sourceHostId})).value,receipt);
  assert.equal(target.files.read<{id:string}>('host.json')!.id,recipient.hostId);assert.notEqual(recipient.hostId,bundle.header.sourceHostId);
  assert.deepEqual(target.files.read('chatgpt.json'),original);assert.equal(target.app.chatgpt.ready(),true);
  assert.equal((await source.call('/chatgpt/transfer/finalize',{receipt})).status,200);assert.equal((await source.call('/chatgpt/transfer/finalize',{receipt})).status,200);assert.equal(existsSync(join(source.root,'private-model/chatgpt.json')),false);assert.equal(existsSync(join(source.root,'private-model/transfer-offer.json')),false);
  assert.equal(source.app.chatgpt.ready(),false);assert.equal((await source.call('/chatgpt/start',{})).status,423);assert.equal(source.counts().revocations,0);
  const publicStatus=(await target.call('/chatgpt/status')).value;assert.equal(publicStatus.limitsMode,'automatic');assert(!JSON.stringify(publicStatus).includes('TRANSFER_REFRESH_SECRET'));assert(!JSON.stringify(target.app.snapshot()).includes('TRANSFER_ACCESS_SECRET'));
  const point=join(mkdtempSync(join(tmpdir(),'迁移备份 QA ')),'point');const manifest=backup(target.app.store,target.root,point);assert(!manifest.files.some(f=>f.path.includes('private-model')));
  target.files.save('chatgpt.json',{...original,expires:Date.now()+1000});await target.app.close();reopened=await fixture(target.root);
  assert.equal(await reopened.app.chatgpt.access(original.connectionId),'TARGET_REFRESHED_SECRET');assert.equal(reopened.counts().refreshes,1);assert.equal(source.counts().refreshes,0);await assert.rejects(source.app.chatgpt.access(original.connectionId),/迁移|迁出/);
 }finally{await q.source.app.close();if(reopened)await reopened.app.close();else await q.target.app.close();}
});

test('wrong destination, altered ciphertext, mismatched source and forged receipt cannot replace or retire a connection',async()=>{
 const q=await connectPair(),other=await fixture();
 try{
  const originalSource=readFileSync(join(q.source.root,'private-model/chatgpt.json'));
  const originalCiphertext=Buffer.from(q.bundle.ciphertext,'base64url'),alteredCiphertext=Buffer.from(originalCiphertext);
  assert(alteredCiphertext.length>0);alteredCiphertext[0]^=1;
  assert(!alteredCiphertext.equals(originalCiphertext),'The negative case must alter actual ciphertext bytes');
  for(const packet of [{...q.bundle,ciphertext:alteredCiphertext.toString('base64url')},{...q.bundle,header:{...q.bundle.header,recipientHostId:'urn:uuid:00000000-0000-0000-0000-000000000000'}}]){
   assert.equal((await q.target.call('/chatgpt/transfer/accept',{bundle:packet,sourceHostId:q.bundle.header.sourceHostId})).status,400);assert.equal(q.target.app.chatgpt.status().connected,false);
  }
  const otherRecipient=(await other.call('/chatgpt/transfer/recipient',{})).value;
  assert.notEqual(otherRecipient.hostId,q.recipient.hostId);assert.equal((await other.call('/chatgpt/transfer/accept',{bundle:q.bundle,sourceHostId:q.bundle.header.sourceHostId})).status,400);
  assert.equal((await q.target.call('/chatgpt/transfer/accept',{bundle:q.bundle,sourceHostId:otherRecipient.hostId})).status,400);
  const accepted=await q.target.call('/chatgpt/transfer/accept',{bundle:q.bundle,sourceHostId:q.bundle.header.sourceHostId});assert.equal(accepted.status,200);
  const forged={...accepted.value,signature:Buffer.alloc(64).toString('base64url')};assert.equal((await q.source.call('/chatgpt/transfer/finalize',{receipt:forged})).status,400);
  assert.deepEqual(readFileSync(join(q.source.root,'private-model/chatgpt.json')),originalSource);assert.equal(q.source.app.chatgpt.ready(),false);
  assert.equal((await q.target.call('/chatgpt/transfer/recipient',{})).status,409);assert.deepEqual(q.target.files.read('chatgpt.json'),q.original);
 }finally{await q.source.app.close();await q.target.app.close();await other.app.close();}
});

test('interrupted destination commit and source retirement recover idempotently without enabling two owners',async()=>{
 const q=await connectPair();let reopened:Awaited<ReturnType<typeof fixture>>|undefined;
 const originalSave=PrivateFiles.prototype.save;
 try{
  let failed=false;
  PrivateFiles.prototype.save=function(name,value:any){if(this.directory===join(q.target.root,'private-model')&&name==='transfer-incoming.json'&&value.phase==='active'&&!failed){failed=true;throw new Error('synthetic commit interruption');}return originalSave.call(this,name,value);};
  assert.equal((await q.target.call('/chatgpt/transfer/accept',{bundle:q.bundle,sourceHostId:q.bundle.header.sourceHostId})).status,500);assert.equal(failed,true);assert.equal(q.target.app.chatgpt.ready(),false);assert.equal(q.source.app.chatgpt.ready(),false);await assert.rejects(q.target.app.chatgpt.access(q.original.connectionId),/未提交/);
  PrivateFiles.prototype.save=originalSave;await q.target.app.close();reopened=await fixture(q.target.root);assert.equal(reopened.app.chatgpt.ready(),false);
  const accepted=await reopened.call('/chatgpt/transfer/accept',{bundle:q.bundle,sourceHostId:q.bundle.header.sourceHostId});assert.equal(accepted.status,200);assert.equal(reopened.app.chatgpt.ready(),true);
  failed=false;PrivateFiles.prototype.save=function(name,value:any){if(this.directory===join(q.source.root,'private-model')&&name==='transfer-outgoing.json'&&value.phase==='retired'&&!failed){failed=true;throw new Error('synthetic retirement interruption');}return originalSave.call(this,name,value);};
  assert.equal((await q.source.call('/chatgpt/transfer/finalize',{receipt:accepted.value})).status,500);assert.equal(failed,true);assert.equal(existsSync(join(q.source.root,'private-model/chatgpt.json')),false);assert.equal(q.source.app.chatgpt.ready(),false);
  PrivateFiles.prototype.save=originalSave;assert.equal((await q.source.call('/chatgpt/transfer/finalize',{receipt:accepted.value})).status,200);assert.equal(q.source.counts().revocations,0);
 }finally{PrivateFiles.prototype.save=originalSave;await q.source.app.close();if(reopened)await reopened.app.close();else await q.target.app.close();}
});

test('active model task and in-flight token refresh block transfer before any freeze',async()=>{
 const source=await fixture(),target=await fixture();
 try{
  await source.connect();const original=source.files.read<Credential>('chatgpt.json')!,recipient=(await target.call('/chatgpt/transfer/recipient',{})).value;
  const project=source.app.service.createProject('迁移并发保护');const policy:any={version:5,projectId:project.id,toolNames:[],allowModel:true,modelBinding:source.app.modelAccess.settings().binding,maxCalls:20,maxCostUsd:0,reservePerCallUsd:0,maxOutputTokens:2048,timeoutMs:300000};
  const run=source.app.service.submit(project.id,'hold','transfer-running','pi',policy).run;
  assert.equal((await source.call('/chatgpt/transfer/begin',{recipient,connectionId:original.connectionId})).status,409);assert.equal(source.files.read('transfer-outgoing.json'),undefined);
  source.app.service.transition(run.id,'running');
  assert.equal((await source.call('/chatgpt/transfer/begin',{recipient,connectionId:original.connectionId})).status,409);assert.equal(source.files.read('transfer-outgoing.json'),undefined);
  source.app.scheduler.finish(run.id,false);
  let release!:()=>void;source.setRefreshGate(new Promise<void>(r=>release=r));source.files.save('chatgpt.json',{...original,expires:Date.now()+1000});
  const refreshing=source.app.chatgpt.access(original.connectionId);
  try{for(let i=0;source.counts().refreshes===0&&i<100;i++)await new Promise(r=>setTimeout(r,10));assert.equal(source.counts().refreshes,1);assert.equal((await source.call('/chatgpt/transfer/begin',{recipient,connectionId:original.connectionId})).status,423);assert.equal(source.files.read('transfer-outgoing.json'),undefined);}finally{release();}
  assert.equal(await refreshing,'TARGET_REFRESHED_SECRET');assert.equal(source.app.chatgpt.ready(),true);
 }finally{await source.app.close();await target.app.close();}
});
