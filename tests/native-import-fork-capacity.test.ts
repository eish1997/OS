import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,readdirSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {loadPi} from '../server/pi-adapter.js';
import {Store} from '../server/store.js';
import {StorageCapacity,defaultStorageLimits} from '../server/storage.js';
import {NativeImports} from '../server/native-imports.js';
import {forkImportedSession} from '../server/native-import-recovery.js';
import {backup,restore} from '../server/backup.js';
import {nativeForkGrowth} from '../server/native-session.js';
import {nativeSessionMaximum} from '../server/native-inspection.js';
import {prepareNativeImport} from '../server/native-import-async.js';
import {AppError} from '../server/store.js';

function writeChunks(imports:NativeImports,projectId:string,id:string,bytes:Buffer){
  for(let offset=0;offset<bytes.length;offset+=1024*1024)imports.write(projectId,id,offset,bytes.subarray(offset,offset+1024*1024));
}

test('session group capacity migration is config-only and preserves an explicit legacy cap',()=>{
  assert.equal(defaultStorageLimits.sessionsBytes,2*nativeSessionMaximum+16*1024*1024);
  assert.equal(defaultStorageLimits.sessionsBytes,285212672);
  assert.equal(nativeSessionMaximum,134217728);
  const root=mkdtempSync(join(tmpdir(),'session-cap-migrate-'));
  try{
    const legacy=new StorageCapacity(root,{sessionsBytes:134217728,minFreeBytes:0});
    assert.equal(legacy.limits.sessionsBytes,134217728);
    const migrated=new StorageCapacity(root,{minFreeBytes:0});
    assert.equal(migrated.limits.sessionsBytes,defaultStorageLimits.sessionsBytes);
    mkdirSync('output/dev-evidence/pi-parity/loop-107',{recursive:true});
    writeFileSync('output/dev-evidence/pi-parity/loop-107/report.json',JSON.stringify({
      defaultSessionsBytes:defaultStorageLimits.sessionsBytes,
      fileMaximum:nativeSessionMaximum,
      legacyOverride:legacy.limits.sessionsBytes,
      migration:'config-only; no session file rewrite',
      adr:'037'
    },null,2));
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('default session quota forks a near-limit import and refuses a second copy that would exceed the unified group',{timeout:300000},async()=>{
  assert.equal(defaultStorageLimits.sessionsBytes,2*nativeSessionMaximum+16*1024*1024);
  const root=mkdtempSync(join(tmpdir(),'import-fork-fit-'));const archive=mkdtempSync(join(tmpdir(),'import-fork-archive-'));
  const store=new Store(join(root,'workbench.sqlite'));const capacity=new StorageCapacity(root,{minFreeBytes:0});store.attachCapacity(capacity);
  assert.equal(capacity.limits.sessionsBytes,defaultStorageLimits.sessionsBytes);
  const evidence:Record<string,unknown>={sessionsLimit:capacity.limits.sessionsBytes,fileMaximum:nativeSessionMaximum,contract:'original+fork+16MiB'};
  try{
    const project=store.create('project',{});const cwd=join(root,'workspaces',project.id);mkdirSync(cwd,{recursive:true});const outside=join(root,'owned-source');mkdirSync(outside);
    const pi=await loadPi();const source=pi.SessionManager.create(outside,outside);
    const selected=source.appendMessage({role:'user',content:`FORK_KEEP ${'x'.repeat(120*1024*1024)}`,timestamp:1});
    source.appendMessage({role:'user',content:'AFTER_SELECTED',timestamp:2});
    const bytes=readFileSync(source.getSessionFile()!);const sha256=createHash('sha256').update(bytes).digest('hex');
    assert(bytes.length>100*1024*1024);assert(bytes.length<=nativeSessionMaximum);
    const imports=new NativeImports(store,root);const record=imports.begin(project.id,'fit.jsonl',bytes.length,sha256,'fork-fit');writeChunks(imports,project.id,record.id,bytes);
    const fork=forkImportedSession(pi,store,capacity,project.id,record.id,sha256,selected);
    const context=JSON.stringify(fork.buildSessionContext().messages);
    assert(context.includes('FORK_KEEP'));assert(!context.includes('AFTER_SELECTED'));
    const originalPath=join(root,'sessions',project.id,`import-${record.id}.jsonl`);
    assert.deepEqual(readFileSync(originalPath),bytes);assert.notEqual(fork.getSessionFile(),originalPath);
    const used=capacity.usage().groups.sessions.bytes;
    assert(used<=capacity.limits.sessionsBytes,`fork must fit default quota: ${used}`);
    assert(used>=bytes.length+statSync(fork.getSessionFile()!).size);
    evidence.fit={originalBytes:bytes.length,forkBytes:statSync(fork.getSessionFile()!).size,reservedBytes:nativeForkGrowth({bytes:bytes.length,entryCount:2}),sessionBytes:used};
    backup(store,root,join(archive,'backup'));restore(join(archive,'backup'),join(archive,'restored'));
    const restoredOriginal=join(archive,'restored','sessions',project.id,`import-${record.id}.jsonl`);
    assert.deepEqual(readFileSync(restoredOriginal),bytes);
    const restoredFork=readdirSync(join(archive,'restored','sessions',project.id)).map(name=>join(archive,'restored','sessions',project.id,name)).find(path=>path!==restoredOriginal);
    assert(restoredFork);
    const reopened=pi.SessionManager.open(restoredFork,join(archive,'restored','sessions',project.id),join(archive,'restored','workspaces',project.id));
    const restoredContext=JSON.stringify(reopened.buildSessionContext().messages);
    assert(restoredContext.includes('FORK_KEEP'));assert(!restoredContext.includes('AFTER_SELECTED'));
    evidence.restoredForkBytes=statSync(restoredFork).size;
    const scanStarted=performance.now();
    const scan=await prepareNativeImport({root:join(archive,'restored'),projectId:project.id,path:restoredOriginal,entryId:selected,measure:true});
    assert.equal(scan.sha256,sha256);
    evidence.scan={elapsedMs:Math.round(performance.now()-scanStarted),workerPeakRss:scan.workerPeakRss,entryCount:scan.entryCount,fileBytes:bytes.length};
    reopened.appendMessage({role:'user',content:'CONTINUE_AFTER_RESTORE',timestamp:3});
    const continued=pi.SessionManager.open(restoredFork!,join(archive,'restored','sessions',project.id),join(archive,'restored','workspaces',project.id));
    const continuedContext=JSON.stringify(continued.buildSessionContext().messages);
    assert(continuedContext.includes('CONTINUE_AFTER_RESTORE'));
    assert(continuedContext.includes('FORK_KEEP'));
    assert(!continuedContext.includes('AFTER_SELECTED'));
    evidence.continuedAfterRestore=true;
    evidence.quotaRaised=false;
  }finally{store.close();rmSync(root,{recursive:true,force:true});rmSync(archive,{recursive:true,force:true});}

  const deniedRoot=mkdtempSync(join(tmpdir(),'import-fork-denied-'));const denied=new Store(join(deniedRoot,'workbench.sqlite'));const deniedCapacity=new StorageCapacity(deniedRoot,{minFreeBytes:0});denied.attachCapacity(deniedCapacity);
  try{
    const project=denied.create('project',{});mkdirSync(join(deniedRoot,'workspaces',project.id),{recursive:true});const outside=join(deniedRoot,'owned-source');mkdirSync(outside);
    const pi=await loadPi();
    const first=pi.SessionManager.create(outside,outside);
    const firstSelected=first.appendMessage({role:'user',content:'FIRST '+'a'.repeat(80*1024*1024),timestamp:1});
    const firstBytes=readFileSync(first.getSessionFile()!);const firstHash=createHash('sha256').update(firstBytes).digest('hex');
    const imports=new NativeImports(denied,deniedRoot);
    const firstRecord=imports.begin(project.id,'first.jsonl',firstBytes.length,firstHash,'fork-first');writeChunks(imports,project.id,firstRecord.id,firstBytes);
    forkImportedSession(pi,denied,deniedCapacity,project.id,firstRecord.id,firstHash,firstSelected);
    const secondOutside=join(deniedRoot,'owned-source-2');mkdirSync(secondOutside);
    const second=pi.SessionManager.create(secondOutside,secondOutside);
    const secondSelected=second.appendMessage({role:'user',content:'SECOND '+'b'.repeat(90*1024*1024),timestamp:1});
    const secondBytes=readFileSync(second.getSessionFile()!);const secondHash=createHash('sha256').update(secondBytes).digest('hex');
    const secondRecord=imports.begin(project.id,'second.jsonl',secondBytes.length,secondHash,'fork-second');writeChunks(imports,project.id,secondRecord.id,secondBytes);
    const before=readdirSync(join(deniedRoot,'sessions',project.id));
    await assert.rejects(Promise.resolve().then(()=>forkImportedSession(pi,denied,deniedCapacity,project.id,secondRecord.id,secondHash,secondSelected)),(error:unknown)=>{
      assert.equal((error as AppError).status,507);assert.match((error as Error).message,/会话空间不足/);assert.match((error as Error).message,/不会提高/);return true;
    });
    assert.deepEqual(readdirSync(join(deniedRoot,'sessions',project.id)),before);
    assert.deepEqual(readFileSync(join(deniedRoot,'sessions',project.id,`import-${secondRecord.id}.jsonl`)),secondBytes);
    evidence.denied={firstBytes:firstBytes.length,secondBytes:secondBytes.length,reservedBytes:nativeForkGrowth({bytes:secondBytes.length,entryCount:1}),sessionBytes:deniedCapacity.usage().groups.sessions.bytes};
  }finally{denied.close();rmSync(deniedRoot,{recursive:true,force:true});}
  const output='output/dev-evidence/pi-parity/import-fork';mkdirSync(output,{recursive:true});writeFileSync(join(output,'report.json'),JSON.stringify(evidence,null,2));
  let importLarge:unknown=null;
  try{importLarge=JSON.parse(readFileSync('output/dev-evidence/pi-parity/import-large/report.json','utf8'));}catch{/* prior 127MiB scan evidence optional */}
  mkdirSync('output/dev-evidence/pi-parity/loop-157',{recursive:true});
  writeFileSync('output/dev-evidence/pi-parity/loop-157/report.json',JSON.stringify({
    closed:'约 120MiB 导入备份还原后可打开并追加接续；记录扫描耗时与 workerPeakRss；未提高配额',
    nearLimit:evidence.fit,
    restoredForkBytes:evidence.restoredForkBytes,
    scan:evidence.scan,
    continuedAfterRestore:evidence.continuedAfterRestore,
    quotaRaised:false,
    prior127MiBScans:importLarge,
  },null,2));
});
