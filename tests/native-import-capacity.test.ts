import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createApp} from '../server/app.js';
import {NativeImports} from '../server/native-imports.js';
import {NativeImportSubmission} from '../server/native-import-submission.js';
import {nativeForkGrowth} from '../server/native-session.js';
import type {Policy} from '../shared/contracts.js';

test('import capacity is checked before confirmation and atomically before creating recovery work',async()=>{
  const root=mkdtempSync(join(tmpdir(),'import-capacity-'));const app=createApp({dataDir:root,password:'capacity',schedule:false,storageLimits:{sessionsBytes:50000}});
  try{
    const project=app.service.createProject('Capacity');const timestamp=new Date().toISOString();const bytes=Buffer.from([JSON.stringify({type:'session',version:3,id:'owned',cwd:'Z:/ignored',timestamp}),JSON.stringify({type:'message',id:'first',parentId:null,timestamp,message:{role:'user',content:'x'.repeat(10000),timestamp:1}})].join('\n')+'\n');
    const sha256=createHash('sha256').update(bytes).digest('hex');const imports=new NativeImports(app.store,root);const record=imports.begin(project.id,'owned.jsonl',bytes.length,sha256,'capacity-source');imports.write(project.id,record.id,0,bytes);
    const policy:Policy={version:8,projectId:project.id,allowModel:true,toolNames:[],maxCalls:1,maxCostUsd:1,reservePerCallUsd:1,maxOutputTokens:128,timeoutMs:1000};
    const submissions=new NativeImportSubmission(app.store,app.service,imports,async()=>({policy,pluginSignature:'owned',mcpSignature:'owned',plugins:[],mcpServers:[],supportsImages:false}));
    const confirmation=await submissions.prepare(project.id,record.id,sha256,'first');assert.equal(confirmation.requiredSessionBytes,nativeForkGrowth({bytes:bytes.length,entryCount:1}));
    // A separate valid upload consumes free space after the user previews recovery.
    const fillerBytes=Buffer.from(JSON.stringify({type:'session',version:3,id:'filler',cwd:'Z:/ignored',timestamp,note:'x'.repeat(30000)})+'\n');const filler=imports.begin(project.id,'filler.jsonl',fillerBytes.length,createHash('sha256').update(fillerBytes).digest('hex'),'capacity-filler');imports.write(project.id,filler.id,0,fillerBytes);
    await assert.rejects(submissions.prepare(project.id,record.id,sha256,'first'),(error:unknown)=>{assert.equal((error as {status:number}).status,507);assert.match((error as Error).message,/会话空间不足/);assert.match((error as Error).message,/现有上限不会提高/);return true;});assert.equal(app.store.list('native_import_confirmation').length,1);
    const request={confirmationId:confirmation.id,commandId:'capacity-restore',title:'Recovered',goal:'Owned goal',acceptCurrentEnvironment:true,externalEffectsReview:'No external operations'};
    await assert.rejects(submissions.submit(project.id,record.id,request),(error:unknown)=>{assert.equal((error as {status:number}).status,507);assert.match((error as Error).message,/会话空间不足/);return true;});
    for(const kind of ['conversation','task','run'])assert.equal(app.store.list(kind).length,0);
    assert.deepEqual(readFileSync(join(root,'sessions',project.id,`import-${record.id}.jsonl`)),bytes);
    imports.cancel(project.id,filler.id);const accepted=await submissions.submit(project.id,record.id,request);assert.equal(accepted.run.status,'queued');assert.equal(app.store.list('run').length,1);
    const repeated=await submissions.submit(project.id,record.id,request);assert.equal(repeated.run.id,accepted.run.id);
  }finally{await app.close();}
});
