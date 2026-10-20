import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,openSync,writeSync,closeSync,writeFileSync,statSync,createReadStream} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {prepareNativeImport} from '../server/native-import-async.js';
import {nativeFingerprint} from '../server/native-inspection.js';
import {createApp} from '../server/app.js';

const root=mkdtempSync(join(tmpdir(),'import-large-'));const projectId='owned';const folder=join(root,'sessions',projectId);mkdirSync(folder,{recursive:true});const path=join(folder,'large.jsonl');
const maximum=127*1024*1024,timestamp=new Date().toISOString();const fd=openSync(path,'wx');const digest=createHash('sha256');let bytes=0,count=0,last:string|null=null;
const write=(value:string)=>{const data=Buffer.from(value);let offset=0;while(offset<data.length)offset+=writeSync(fd,data,offset,data.length-offset);digest.update(data);bytes+=data.length;};
try{
  write(JSON.stringify({type:'session',version:3,id:'large-owned',timestamp,cwd:'Z:/not-used'})+'\n');
  while(bytes<maximum){const id=`entry-${count}`;const base={type:'message',id,parentId:last,timestamp,message:{role:'user',content:'',timestamp:1}};const overhead=Buffer.byteLength(JSON.stringify(base)+'\n');const remaining=maximum-bytes;let size=Math.min(65536,remaining);if(remaining-size<1024)size=remaining;assert(size>=overhead);base.message.content='x'.repeat(size-overhead);write(JSON.stringify(base)+'\n');last=id;count++;}
}finally{closeSync(fd);}
const sha256=digest.digest('hex');assert.equal(statSync(path).size,maximum);const input={root,projectId,path,measure:true};const stamp=nativeFingerprint({...input,sessionId:'large-owned'}).fingerprint;
const report:{fileBytes:number;entries:number;stages:unknown[];limits:{fileMiB:number;heapMiB:number}}={fileBytes:maximum,entries:count,stages:[],limits:{fileMiB:128,heapMiB:768}};
for(const [name,entryId] of [['structure',undefined],['effective-context',last!]] as const){const started=performance.now();const result=await prepareNativeImport({...input,entryId});assert.equal(result.sha256,sha256);assert.equal(result.entryCount,count);if(entryId)assert.equal(result.effectiveImageCount,0);report.stages.push({name,elapsedMs:Math.round(performance.now()-started),workerPeakRss:result.workerPeakRss});console.log(JSON.stringify(report.stages.at(-1)));}
const controller=new AbortController();const started=performance.now();const pending=prepareNativeImport({...input,entryId:last!},controller.signal);const timer=setTimeout(()=>controller.abort(),500);
try{await assert.rejects(pending,{status:499});}finally{clearTimeout(timer);}report.stages.push({name:'cancel',elapsedMs:Math.round(performance.now()-started)});
const recovered=await prepareNativeImport(input);assert.equal(recovered.sha256,sha256);assert.equal(nativeFingerprint({...input,sessionId:'large-owned'}).fingerprint,stamp);
// A single huge JSON line stresses different allocations than many small messages.
const singleRoot=mkdtempSync(join(tmpdir(),'import-single-large-'));const singleFolder=join(singleRoot,'sessions',projectId);mkdirSync(singleFolder,{recursive:true});const singlePath=join(singleFolder,'single.jsonl');
const prefix=JSON.stringify({type:'session',version:3,id:'single-owned',timestamp,cwd:'Z:/ignored'})+'\n'+`{"type":"message","id":"single","parentId":null,"timestamp":${JSON.stringify(timestamp)},"message":{"role":"user","content":"`;
const suffix='","timestamp":1}}\n';const singleFd=openSync(singlePath,'wx');const singleHash=createHash('sha256');
const put=(value:Buffer)=>{let offset=0;while(offset<value.length)offset+=writeSync(singleFd,value,offset,value.length-offset);singleHash.update(value);};
try{put(Buffer.from(prefix));let remaining=maximum-Buffer.byteLength(prefix)-Buffer.byteLength(suffix);const block=Buffer.alloc(65536,120);while(remaining){const length=Math.min(block.length,remaining);put(block.subarray(0,length));remaining-=length;}put(Buffer.from(suffix));}finally{closeSync(singleFd);}
const singleStart=performance.now();const single=await prepareNativeImport({root:singleRoot,projectId,path:singlePath,entryId:'single',measure:true});assert.equal(single.sha256,singleHash.digest('hex'));assert.equal(single.effectiveImageCount,0);report.stages.push({name:'single-record-effective-context',elapsedMs:Math.round(performance.now()-singleStart),workerPeakRss:single.workerPeakRss});console.log(JSON.stringify(report.stages.at(-1)));
const target=mkdtempSync(join(tmpdir(),'import-large-http-'));const app=createApp({dataDir:target,password:'large-import-owned',schedule:false});
await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;
try{
  // Exercise both production inspection slots while the HTTP host stays available.
  const parallelStart=performance.now();let complete=false;const healthMs:number[]=[];
  const scans=Promise.all([
    prepareNativeImport({...input,entryId:last!}),
    prepareNativeImport({root:singleRoot,projectId,path:singlePath,entryId:'single',measure:true}),
  ]).finally(()=>{complete=true;});
  const health=(async()=>{while(!complete){const start=performance.now();const reply=await fetch(base+'/api/health',{signal:AbortSignal.timeout(5000)});assert.equal(reply.status,200);await reply.text();healthMs.push(Math.round(performance.now()-start));await new Promise(resolve=>setTimeout(resolve,25));}})();
  const [results]=await Promise.all([scans,health]);assert.equal(results[0].sha256,sha256);assert.equal(results[1].sha256,single.sha256);assert(healthMs.length>1);
  assert.equal(nativeFingerprint({...input,sessionId:'large-owned'}).fingerprint,stamp);
  report.stages.push({name:'two-concurrent-context-scans',elapsedMs:Math.round(performance.now()-parallelStart),workerPeakRss:results.map(result=>result.workerPeakRss),healthSamples:healthMs.length,maxHealthMs:Math.max(...healthMs),note:'Per-worker lifetime peaks, not simultaneous aggregate RSS'});console.log(JSON.stringify(report.stages.at(-1)));
  const project=app.service.createProject('Large import');const login=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({password:'large-import-owned'})});const headers={cookie:login.headers.get('set-cookie')!.split(';')[0]};
  const creation=await fetch(base+'/api/native-imports',{method:'POST',headers,body:JSON.stringify({projectId:project.id,name:'large.jsonl',bytes:maximum,sha256,commandId:'large-owned'})});assert.equal(creation.status,201);const record=await creation.json();
  const begin=performance.now();let received=0;
  for await(const chunk of createReadStream(path,{highWaterMark:1024*1024})){const reply=await fetch(base+`/api/native-imports/${record.id}?projectId=${project.id}&offset=${received}`,{method:'PUT',headers,body:chunk});assert.equal(reply.status,200,await reply.clone().text());received=(await reply.json()).received;}
  assert.equal(received,maximum);const preview=await fetch(base+`/api/native-imports/${record.id}/preview?projectId=${project.id}`,{headers});assert.equal(preview.status,200);assert.equal((await preview.json()).preview.sha256,sha256);
  assert.equal(app.store.list('run').length,0);assert.equal(app.store.list('task').length,0);
  report.stages.push({name:'http-upload-and-preview',elapsedMs:Math.round(performance.now()-begin),chunks:127,sessionBytes:app.store.capacity!.usage().groups.sessions.bytes});console.log(JSON.stringify(report.stages.at(-1)));
}finally{await app.close();}
const output='output/dev-evidence/pi-parity/import-large';mkdirSync(output,{recursive:true});writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2));console.log('PASS: 127 MiB original unchanged, projection/hash verified, cancelled owned scanner closed and next scan succeeded');
