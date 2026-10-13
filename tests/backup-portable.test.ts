import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,relative,posix,win32} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {Store} from '../server/store.js';
import {Assets} from '../server/assets.js';
import {Service} from '../server/service.js';
import {backup,restore,backupRelativePath} from '../server/backup.js';
import {loadPi} from '../server/pi-adapter.js';
import type {Policy,Run,SessionBinding} from '../shared/contracts.js';

test('backup source dialect maps Windows and POSIX addresses while rejecting siblings and traversal',()=>{
 const windows='E:\\旧 工作台',path='E:\\旧 工作台\\sessions\\project\\history.jsonl';
 const child=backupRelativePath(windows,path);assert.equal(child,'sessions/project/history.jsonl');assert.equal(posix.join('/var/lib/workbench',child!),'/var/lib/workbench/sessions/project/history.jsonl');
 assert.notEqual(posix.join('/var/lib/workbench',posix.relative(windows,path)),'/var/lib/workbench/sessions/project/history.jsonl','The previous host-native algorithm loses Windows path semantics on POSIX');
 assert.equal(backupRelativePath(windows,'e:/旧 工作台/sessions/project/history.jsonl'),child);
 assert.equal(win32.join('C:\\restored',backupRelativePath('/srv/workbench','/srv/workbench/sessions/history.jsonl')!),'C:\\restored\\sessions\\history.jsonl');
 assert.equal(backupRelativePath('\\\\server\\share\\data','\\\\server\\share\\data\\sessions\\a.jsonl'),'sessions/a.jsonl');
 for(const value of ['E:\\旧 工作台-other\\sessions\\a.jsonl','E:\\旧 工作台\\..\\outside.jsonl','F:\\旧 工作台\\sessions\\a.jsonl','E:relative.jsonl','sessions/a.jsonl','/sessions/a.jsonl'])assert.equal(backupRelativePath(windows,value),undefined,value);
 for(const value of ['/srv/workbench-other/sessions/a.jsonl','/srv/workbench/../outside.jsonl','/srv/workbench/sessions\\..\\..\\outside.jsonl','sessions/a.jsonl','E:\\sessions\\a.jsonl'])assert.equal(backupRelativePath('/srv/workbench',value),undefined,value);
 assert.equal(backupRelativePath('relative','/srv/workbench'),undefined);assert.equal(backupRelativePath(windows,undefined),undefined);
});

test('foreign backup paths restore native Run and binding without changing original history bytes',async()=>{
 const base=mkdtempSync(join(tmpdir(),'跨平台备份 QA ')),source=join(base,'source');mkdirSync(source);
 const store=new Store(join(source,'workbench.sqlite'));
 try{
  const service=new Service(store,new Assets(store,source)),project=service.createProject('迁移');
  const policy:Policy={version:1,projectId:project.id,allowModel:false,maxCalls:0,maxCostUsd:0,reservePerCallUsd:0,maxOutputTokens:100,timeoutMs:10000,toolNames:[]};
  const cwd=join(source,'workspaces',project.id),sessionDir=join(source,'sessions',project.id);mkdirSync(cwd,{recursive:true});mkdirSync(sessionDir,{recursive:true});
  const pi=await loadPi(),manager=pi.SessionManager.create(cwd,sessionDir);manager.appendMessage({role:'user',content:'PORTABLE_HISTORY_中文',timestamp:Date.now()});manager.appendMessage({role:'assistant',content:[{type:'text',text:'saved'}],api:'openai-responses',provider:'openai',model:'offline',usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:'stop',timestamp:Date.now()});
  const sessionPath=manager.getSessionFile()!,bytes=readFileSync(sessionPath),portable=relative(source,sessionPath).replaceAll('\\','/');
  const run=service.submit(project.id,'migration','portable','fixture',policy).run;
  store.update<Run>('run',run.id,run.revision,{sessionPath,sessionId:manager.getSessionId()});
  store.create('session_binding',{id:'portable-binding',projectId:project.id,...({cwd,sessionPath,pid:123,worker:'old-worker'} as object)});
  for(const [i,sourceRoot,foreignPath,foreignCwd] of [
   [0,'Z:\\旧 工作台','z:/旧 工作台/'+portable,'z:/旧 工作台/workspaces/'+project.id],
   [1,'/srv/旧 工作台','/srv/旧 工作台/'+portable,'/srv/旧 工作台/workspaces/'+project.id]
  ] as const){
   const pack=join(base,'pack-'+i),target=join(base,'restored-'+i);backup(store,source,pack);
   const snapshot=new Store(join(pack,'workbench.sqlite'));
   try{const saved=snapshot.get<Run>('run',run.id);snapshot.update<Run>('run',run.id,saved.revision,{sessionPath:foreignPath});const binding=snapshot.get<SessionBinding>('session_binding','portable-binding');snapshot.update<SessionBinding>('session_binding',binding.id,binding.revision,{sessionPath:foreignPath,cwd:foreignCwd});}finally{snapshot.close();}
   const manifestPath=join(pack,'manifest.json'),manifest=JSON.parse(readFileSync(manifestPath,'utf8'));manifest.sourceRoot=sourceRoot;manifest.files.find((f:{path:string})=>f.path==='workbench.sqlite').sha256=createHash('sha256').update(readFileSync(join(pack,'workbench.sqlite'))).digest('hex');writeFileSync(manifestPath,JSON.stringify(manifest));
   restore(pack,target);const recovered=new Store(join(target,'workbench.sqlite'));
   try{const saved=recovered.get<Run>('run',run.id),binding=recovered.get<SessionBinding>('session_binding','portable-binding');assert.equal(saved.sessionPath,join(target,...portable.split('/')));assert.equal(binding.sessionPath,saved.sessionPath);assert.equal(binding.cwd,join(target,'workspaces',project.id));assert.equal(binding.pid,undefined);assert.equal(binding.worker,undefined);assert(readFileSync(saved.sessionPath!).equals(bytes));const reopened=pi.SessionManager.open(saved.sessionPath!,undefined,binding.cwd);assert.equal(reopened.getSessionId(),manager.getSessionId());assert.equal(reopened.getCwd(),binding.cwd);assert(reopened.buildSessionContext().messages.some(m=>JSON.stringify(m).includes('PORTABLE_HISTORY_中文')));}finally{recovered.close();}
  }
  assert(readFileSync(sessionPath).equals(bytes));
 }finally{store.close();}
});
