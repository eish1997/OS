import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Writable} from 'node:stream';
import {createHash} from 'node:crypto';
import {streamNativeImage} from '../server/native-image-stream.js';
import {scanBranchPoints} from '../server/native-branch-points.js';

function fixture(size=8*1024*1024){
  const root=mkdtempSync(join(tmpdir(),'native-image-stream-'));const folder=join(root,'sessions','project');mkdirSync(folder,{recursive:true});const path=join(folder,'owned.jsonl');
  const bytes=Buffer.alloc(size,65);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
  writeFileSync(path,[{type:'session',version:3,id:'session'},{type:'message',id:'image',parentId:null,message:{role:'user',content:[{type:'image',mimeType:'image/png',data:bytes.toString('base64')}]}}].map(r=>JSON.stringify(r)).join('\n')+'\n');
  const input={root,path,projectId:'project',sessionId:'session',offset:0,limit:30,throughEntryId:'image',detailEntryId:'image',imageIndex:0};
  return {bytes,input:{...input,sourceHash:scanBranchPoints(input).sourceHash}};
}

test('native image streams exact bytes into a slow bounded sink without IPC image body',async()=>{
  const {input,bytes}=fixture();const digest=createHash('sha256');let count=0;let peakBuffered=0;let announced=false;
  const sink=new Writable({highWaterMark:16384,write(chunk,_encoding,done){assert(announced);count+=chunk.length;digest.update(chunk);peakBuffered=Math.max(peakBuffered,this.writableLength);setTimeout(done,1);}});
  await streamNativeImage(input,sink,metadata=>{announced=true;assert.deepEqual(metadata,{mimeType:'image/png',bytes:bytes.length});});
  await new Promise<void>(resolve=>sink.end(resolve));
  assert.equal(count,bytes.length);assert.equal(digest.digest('hex'),createHash('sha256').update(bytes).digest('hex'));assert(peakBuffered<=256*1024,`bounded write queue: ${peakBuffered}`);
});

test('native image cancellation terminates the scanner and a later stream can proceed',async()=>{
  const {input}=fixture();const controller=new AbortController();let count=0;
  const sink=new Writable({write(chunk,_encoding,done){count+=chunk.length;controller.abort();done();}});
  await assert.rejects(streamNativeImage(input,sink,()=>{},controller.signal),/取消/);assert(count>0);sink.destroy();
  const next=new Writable({write(_chunk,_encoding,done){done();}});await streamNativeImage(input,next,()=>{});next.end();
  let started=false;const invalid=new Writable({write(_chunk,_encoding,done){done();}});
  await assert.rejects(streamNativeImage({...input,sourceHash:'0'.repeat(64)},invalid,()=>{started=true;}),/已变化/);assert.equal(started,false);invalid.destroy();
});

test('80 MiB image in a near-limit native history streams without changing the existing scanner heap limit',async()=>{
  const {input,bytes}=fixture(80*1024*1024);const digest=createHash('sha256');let count=0;
  const sink=new Writable({highWaterMark:16384,write(chunk,_encoding,done){count+=chunk.length;digest.update(chunk);done();}});
  await streamNativeImage(input,sink,metadata=>assert.equal(metadata.bytes,bytes.length));
  await new Promise<void>(resolve=>sink.end(resolve));assert.equal(count,bytes.length);assert.equal(digest.digest('hex'),createHash('sha256').update(bytes).digest('hex'));
});
