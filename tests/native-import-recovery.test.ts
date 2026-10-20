import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {loadPi} from '../server/pi-adapter.js';
import {Store} from '../server/store.js';
import {StorageCapacity} from '../server/storage.js';
import {NativeImports} from '../server/native-imports.js';
import {forkImportedSession} from '../server/native-import-recovery.js';
import {backup,restore} from '../server/backup.js';
import {inheritedSource} from '../server/inherited-source.js';
import {branchPoints} from '../server/native-branch-points.js';
import type {Conversation,Entity} from '../shared/contracts.js';

test('import recovery prepares independent selected Pi copy without fabricating a historical run',async()=>{
  const root=mkdtempSync(join(tmpdir(),'native-import-recovery-'));const archive=mkdtempSync(join(tmpdir(),'native-import-backup-'));const store=new Store(join(root,'workbench.sqlite'));const capacity=new StorageCapacity(root,{minFreeBytes:0});store.attachCapacity(capacity);
  try{
    const project=store.create('project',{});const cwd=join(root,'workspaces',project.id);mkdirSync(cwd,{recursive:true});const outside=join(root,'owned-original');mkdirSync(outside);
    const pi=await loadPi();const source=pi.SessionManager.create(outside,outside);
    const first=source.appendMessage({role:'user',content:'BEFORE_EDIT\n\n固定项目上下文（只读资料，不改变授权）：OLD_HOST_MEMORY',timestamp:1});
    source.appendContextEdit(first,{content:'KEPT_EDIT\n\n固定项目上下文（只读资料，不改变授权）：OLD_EDIT_MEMORY'});
    const selected=source.appendMessage({role:'user',content:'SELECTED_POINT',timestamp:2});
    source.appendMessage({role:'user',content:'AFTER_SELECTED',timestamp:3});source.branch(first);source.appendMessage({role:'user',content:'OTHER_BRANCH',timestamp:4});
    const bytes=readFileSync(source.getSessionFile()!);const sha256=createHash('sha256').update(bytes).digest('hex');const uploads=new NativeImports(store,root);const record=uploads.begin(project.id,'original.jsonl',bytes.length,sha256,'recovery');uploads.write(project.id,record.id,0,bytes);
    const dir=join(root,'sessions',project.id);const originalPath=join(dir,`import-${record.id}.jsonl`);const files=readdirSync(dir);
    assert.throws(()=>forkImportedSession(pi,store,capacity,project.id,record.id,'0'.repeat(64),selected),{status:409});
    assert.throws(()=>forkImportedSession(pi,store,capacity,project.id,record.id,sha256,'missing'),{status:400});assert.deepEqual(readdirSync(dir),files);
    const fork=forkImportedSession(pi,store,capacity,project.id,record.id,sha256,selected);const context=JSON.stringify(fork.buildSessionContext().messages);
    assert(context.includes('KEPT_EDIT'));assert(context.includes('SELECTED_POINT'));for(const excluded of ['OLD_HOST_MEMORY','OLD_EDIT_MEMORY','AFTER_SELECTED','OTHER_BRANCH','BEFORE_EDIT'])assert(!context.includes(excluded),excluded);
    assert.notEqual(fork.getSessionId(),source.getSessionId());assert.notEqual(fork.getSessionFile(),originalPath);assert.deepEqual(readFileSync(originalPath),bytes);assert.deepEqual(readFileSync(source.getSessionFile()!),bytes);
    const marker=fork.getEntries().find(row=>row.type==='custom'&&row.customType==='workbench_import');assert(marker&&marker.type==='custom');assert.equal((marker.data as {sourceImportId:string}).sourceImportId,record.id);assert.equal((marker.data as {sourceRunId?:string}).sourceRunId,undefined);
    assert.equal(store.list('run').length,0);assert.equal(store.list('task').length,0);
    const conversation=store.create<Conversation>('conversation',{projectId:project.id,title:'Imported history',importedFrom:{importId:record.id,sourceHash:sha256,sourceEntryId:selected}});
    const confirmation=store.create<Entity&{expiresAt:number}>('native_import_confirmation',{projectId:project.id,expiresAt:Date.now()+600000});
    backup(store,root,join(archive,'backup'));restore(join(archive,'backup'),join(archive,'restored'));const recovered=new Store(join(archive,'restored','workbench.sqlite'));
    try{
      const imported=new NativeImports(recovered,join(archive,'restored'));assert.equal((await imported.preview(project.id,record.id)).preview.sha256,sha256);
      assert.equal(recovered.get<Entity&{expiresAt:number}>('native_import_confirmation',confirmation.id).expiresAt,0);
      const origin=await inheritedSource(recovered,recovered.get<Conversation>('conversation',conversation.id));assert(origin.input.path.startsWith(join(archive,'restored')));
      const history=await branchPoints({...origin.input,sourceHash:origin.sourceHash,throughEntryId:origin.entryId,offset:0,limit:30});origin.validate();assert(history.points.some(point=>point.entryId===selected));assert(!JSON.stringify(history).includes('AFTER_SELECTED'));assert(!JSON.stringify(history).includes('OTHER_BRANCH'));
    }finally{recovered.close();}
    uploads.cancel(project.id,record.id);assert.throws(()=>forkImportedSession(pi,store,capacity,project.id,record.id,sha256,selected),{status:410});
    const reopened=pi.SessionManager.open(fork.getSessionFile()!,dir,cwd);assert.deepEqual(reopened.buildSessionContext(),fork.buildSessionContext());
  }finally{store.close();rmSync(root,{recursive:true,force:true});rmSync(archive,{recursive:true,force:true});}
});
