import {generateKeyPairSync,sign} from 'node:crypto';
import {readFileSync,writeSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createApp} from '../../server/app.js';
import {PrivateFiles} from '../../server/private-files.js';
import type {Credential} from '../../server/chatgpt-auth.js';
import {AppError} from '../../server/store.js';

// Owned fault fixture only: requires the parent's fresh-directory marker.
const [directory,runId]=process.argv.slice(2),root=resolve(directory);
if(JSON.parse(readFileSync(join(root,'.transfer-process-fixture.json'),'utf8')).runId!==runId)throw new Error('Owned fixture marker required');
const emit=(v:unknown)=>writeSync(1,JSON.stringify(v)+'\n');
const keys=generateKeyPairSync('rsa',{modulusLength:2048}),jwk={...keys.publicKey.export({format:'jwk'}),kid:'crash-fixture-key',use:'sig',alg:'RS256'};
const enc=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
let nonce='',armed='',refreshes=0,grants=0,revocations=0;
const counters=()=>({grants,refreshes,revocations,inferenceRequests:0});
const saveCounters=()=>writeFileSync(join(root,'synthetic-provider-counts.json'),JSON.stringify(counters()),{mode:0o600});
const fetcher:typeof fetch=async(input,init)=>{
 const url=String(input);
 if(url==='https://auth.openai.com/.well-known/jwks.json')return Response.json({keys:[jwk]});
 if(url==='https://auth.openai.com/api/accounts/oauth/token'){
  const form=new URLSearchParams(String(init?.body)),refreshing=form.get('grant_type')==='refresh_token';
  if(refreshing){if(form.get('refresh_token')!=='PROCESS_REFRESH_FIXTURE')throw new Error('Unexpected synthetic token');refreshes++;}else grants++;
  saveCounters();const value=[enc({alg:'RS256',kid:jwk.kid}),enc({iss:'https://auth.openai.com',aud:'oaiapp-process-fixture',sub:'process-fixture-user',exp:Math.floor(Date.now()/1000)+3600,...(!refreshing?{nonce}:{})})].join('.');
  return Response.json({access_token:refreshing?'PROCESS_REFRESHED_FIXTURE':'PROCESS_ACCESS_FIXTURE',refresh_token:'PROCESS_REFRESH_FIXTURE',id_token:value+'.'+sign('RSA-SHA256',Buffer.from(value),keys.privateKey).toString('base64url'),scope:'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',token_type:'Bearer',expires_in:3600});
 }
 if(url==='https://api.openai.com/v1/models')return Response.json({models:[{slug:'gpt-5.6-sol',display_name:'Offline process fixture',visibility:'list'}]});
 if(url==='https://auth.openai.com/api/accounts/oauth/revoke'){revocations++;saveCounters();return new Response('',{status:200});}
 throw new Error('External/inference request forbidden in synthetic process fixture');
};
const originalSave=PrivateFiles.prototype.save;
const checkpoint=(name:string)=>{emit({kind:'checkpoint',checkpoint:name,pid:process.pid});for(;;)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,60000);};
PrivateFiles.prototype.save=function(name,value:any){
 if(this.directory===join(root,'private-model')){
  if(armed==='target-active'&&name==='transfer-incoming.json'&&value.phase==='active')checkpoint(armed);
  if(armed==='source-retired'&&name==='transfer-outgoing.json'&&value.phase==='retired')checkpoint(armed);
 }
 originalSave.call(this,name,value);
 if(this.directory===join(root,'private-model')&&armed==='source-frozen'&&name==='transfer-outgoing.json'&&value.phase==='frozen')checkpoint(armed);
};
const app=createApp({dataDir:root,password:'process-fixture-password',schedule:false,chatgpt:{fetch:fetcher},backup:{root:join(root,'unused-backup'),validateLocation:()=>false}});
const files=new PrivateFiles(root,app.store.capacity!);
process.on('message',async(message:any)=>{
 try{
  if(message.kind==='stop'){await app.close();process.exit(0);}
  let value:unknown;
  if(message.kind==='arm'){if(!['source-frozen','target-active','source-retired'].includes(message.checkpoint))throw new Error('Unknown checkpoint');armed=message.checkpoint;value={armed};}
  else if(message.kind==='nonce'){nonce=String(message.nonce);value={configured:true};}
  else if(message.kind==='refresh'){
   const c=files.read<Credential>('chatgpt.json');if(c)files.save('chatgpt.json',{...c,expires:Date.now()+1000});
   try{const access=await app.chatgpt.access(message.connectionId);value={allowed:true,syntheticValueVerified:access==='PROCESS_REFRESHED_FIXTURE',...counters()};}
   catch(e){value={allowed:false,status:e instanceof AppError?e.status:500,...counters()};}
  }else if(message.kind==='inspect')value={...counters(),ready:app.chatgpt.ready(),hostId:files.read<{id:string}>('host.json')?.id,connectionId:app.chatgpt.status().connectionId,apiFallback:app.modelAccess.settings().binding.kind==='api'};
  else throw new Error('Unknown fixture command');
  process.send?.({kind:'response',id:message.id,value});
 }catch(e){process.send?.({kind:'response',id:message.id,error:e instanceof AppError?e.message:'Fixture command failed'});}
});
await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));
emit({kind:'ready',pid:process.pid,port:(app.server.address() as {port:number}).port,instanceId:app.scheduler.owner});
