import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Store} from '../server/store.js';
import {StorageCapacity} from '../server/storage.js';
import {NativeImports} from '../server/native-imports.js';
import {restore} from '../server/backup.js';

test('cross-process backup freezes partial import while heartbeat remains writable, then restored upload resumes',{timeout:20000},async()=>{
  const base=mkdtempSync(join(tmpdir(),'import-backup-race-'));const root=join(base,'data');const store=new Store(join(root,'workbench.sqlite'));store.attachCapacity(new StorageCapacity(root,{minFreeBytes:0}));
  const child=fork(fileURLToPath(new URL('./helpers/native-import-backup-worker.ts',import.meta.url)),[],{execArgv:['--import','tsx'],windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
  const closed=new Promise<number|null>(resolve=>child.once('close',resolve));
  try{
    const project=store.create('project',{});const imports=new NativeImports(store,root);const bytes=Buffer.from(JSON.stringify({type:'session',version:3,id:'partial',cwd:'Z:/ignored',timestamp:new Date().toISOString()})+'\n');const sha=createHash('sha256').update(bytes).digest('hex');
    const record=imports.begin(project.id,'partial.jsonl',bytes.length,sha,'partial-command');imports.write(project.id,record.id,0,bytes.subarray(0,20));
    const owner='owned-import-backup';assert(store.lease('scheduler',owner,120000));
    const started=new Promise<void>((resolve,reject)=>{child.on('message',(message:{phase?:string;error?:string})=>{if(message.phase==='snapshot')resolve();if(message.error)reject(new Error(message.error));});child.once('error',reject);child.once('exit',code=>{if(code!==0)reject(new Error('backup child failed'));});});
    child.send({root,destination:join(base,'backup'),release:join(base,'release'),owner});await started;
    assert.throws(()=>imports.write(project.id,record.id,20,bytes.subarray(20)),{status:423});assert.throws(()=>imports.cancel(project.id,record.id),{status:423});assert.throws(()=>imports.begin(project.id,'new.jsonl',bytes.length,sha,'another-command'),{status:423});
    assert(store.lease('scheduler',owner,120000),'backup gate must not block lease renewal');
    writeFileSync(join(base,'release'),'go');assert.equal(await closed,0);
    imports.write(project.id,record.id,20,bytes.subarray(20));assert.equal((await imports.preview(project.id,record.id)).preview.sha256,sha);
    restore(join(base,'backup'),join(base,'restored'));const recovered=new Store(join(base,'restored','workbench.sqlite'));
    try{const resumed=new NativeImports(recovered,join(base,'restored'));assert.equal(resumed.get(project.id,record.id).received,20);assert.deepEqual(readFileSync(join(base,'restored','sessions',project.id,`import-${record.id}.jsonl`)),bytes.subarray(0,20));resumed.write(project.id,record.id,0,bytes);assert.equal((await resumed.preview(project.id,record.id)).preview.sha256,sha);}finally{recovered.close();}
  }finally{if(child.exitCode===null)child.kill();await closed;store.close();rmSync(base,{recursive:true,force:true});}
});
