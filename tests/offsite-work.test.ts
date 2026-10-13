import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {OffsiteWork} from '../server/offsite-work.js';
const hash='a'.repeat(64);
const load=(p:string)=>JSON.parse(readFileSync(join(p,'.offsite-attempt.json'),'utf8'));
const save=(p:string,value:unknown)=>writeFileSync(join(p,'.offsite-attempt.json'),JSON.stringify(value));
async function owned(){const child=spawn(process.execPath,['-e','process.send({ready:true});setInterval(()=>{},1000)'],{windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});const exit=new Promise(r=>child.once('close',(code,signal)=>r({code,signal})));await new Promise(r=>child.once('message',r));return {child,exit};}
test('scratch cleanup requires dead owner and dead recorded transport; launch ambiguity, CLI and foreign content survive',async()=>{
 const root=mkdtempSync(join(tmpdir(),'offsite-work-')),work=new OffsiteWork(join(root,'work'),hash),owner=await owned(),transport=await owned();
 try{
  const live=work.create(randomUUID(),'upload',true);save(live,{...load(live),pid:owner.child.pid});assert.deepEqual(work.cleanup(),{removed:0,preserved:1,uncertain:0});assert(existsSync(live));
  owner.child.kill('SIGKILL');await owner.exit;const running=work.create(randomUUID(),'upload',true);save(running,{...load(running),pid:owner.child.pid,phase:'running',childPid:transport.child.pid});
  const ambiguous=work.create(randomUUID(),'upload',true);save(ambiguous,{...load(ambiguous),pid:owner.child.pid,phase:'launching'});
  const cli=work.create(randomUUID(),'upload',false);save(cli,{...load(cli),pid:owner.child.pid});
  const foreign=join(work.root,'pending-foreign');mkdirSync(foreign);writeFileSync(join(foreign,'keep'),'foreign original');
  assert.deepEqual(work.cleanup(),{removed:1,preserved:1,uncertain:3});assert(!existsSync(live));assert(existsSync(running));
  transport.child.kill('SIGKILL');await transport.exit;assert.deepEqual(work.cleanup(),{removed:1,preserved:1,uncertain:2});assert(!existsSync(running));assert(existsSync(ambiguous));assert(existsSync(cli));assert.equal(readFileSync(join(foreign,'keep'),'utf8'),'foreign original');
 }finally{if(owner.child.exitCode===null&&owner.child.signalCode===null){owner.child.kill();await owner.exit;}if(transport.child.exitCode===null&&transport.child.signalCode===null){transport.child.kill();await transport.exit;}}
});
test('scratch ownership refuses unmarked directories, changed configuration, forged receipts and links; own dispose requires idle',async()=>{
 const root=mkdtempSync(join(tmpdir(),'offsite-boundary-')),unmarked=join(root,'existing');mkdirSync(unmarked);writeFileSync(join(unmarked,'keep'),'existing');assert.throws(()=>new OffsiteWork(unmarked,hash));
 const work=new OffsiteWork(join(root,'work'),hash);assert.throws(()=>new OffsiteWork(work.root,'b'.repeat(64)));
 const p=work.create(randomUUID(),'upload',true);work.launching(p);assert.throws(()=>work.dispose(p));work.transportStarted(p,process.pid);assert.throws(()=>work.dispose(p));work.transportFinished(p);
 const outside=join(root,'outside');mkdirSync(outside);writeFileSync(join(outside,'keep'),'outside');symlinkSync(outside,join(p,'link'),process.platform==='win32'?'junction':'dir');assert.throws(()=>work.dispose(p));assert.equal(readFileSync(join(outside,'keep'),'utf8'),'outside');
 const forged=work.create(randomUUID(),'upload',true);save(forged,{...load(forged),ownerId:randomUUID()});assert.throws(()=>work.dispose(forged));assert(existsSync(forged));
 const valid=work.create(randomUUID(),'upload',true);writeFileSync(join(valid,'plaintext'),'disposable');work.dispose(valid);assert(!existsSync(valid));assert(existsSync(p));assert(existsSync(forged));
});
