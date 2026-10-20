import {pixelPng} from './helpers/pixel.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {loadPi} from '../server/pi-adapter.js';
import {prepareNativeImport} from '../server/native-import-async.js';
import {createApp} from '../server/app.js';
import {NativeImports} from '../server/native-imports.js';
import {NativeImportSubmission} from '../server/native-import-submission.js';
import type {Policy} from '../shared/contracts.js';

test('selected SDK projection counts effective images across edits, compaction and branches; incompatible model rejected',async()=>{
  const root=mkdtempSync(join(tmpdir(),'import-image-projection-'));const app=createApp({dataDir:root,password:'image-projection',schedule:false});
  try{
    const project=app.service.createProject('Images');const dir=join(root,'sessions',project.id);mkdirSync(dir,{recursive:true});const pi=await loadPi();const manager=pi.SessionManager.create(root,dir);
    const image={type:'image' as const,mimeType:'image/png',data:pixelPng().toString('base64')};
    const first=manager.appendMessage({role:'user',content:[image],timestamp:1});
    manager.appendContextEdit(first,{content:'image replaced with text'});const afterReplacement=manager.appendMessage({role:'user',content:'after replacement',timestamp:2});
    const text=manager.appendMessage({role:'user',content:'text before image edit',timestamp:3});manager.appendContextEdit(text,{content:[image]});const afterImageEdit=manager.appendMessage({role:'user',content:'after image edit',timestamp:4});
    manager.appendContextEdit(text,null);const afterRemoval=manager.appendMessage({role:'user',content:'after removal',timestamp:5});
    const memory=manager.appendMessage({role:'toolResult',toolCallId:'owned-memory',toolName:'search_memory',content:[image],isError:false,timestamp:6});manager.appendContextEdit(memory,{content:[image]});const afterMemory=manager.appendMessage({role:'user',content:'memory removed during fork',timestamp:7});
    manager.branch(first);manager.appendCompaction('text summary',null,100);const afterCompaction=manager.appendMessage({role:'user',content:'after compaction',timestamp:8});
    const path=manager.getSessionFile()!;const original=readFileSync(path);
    for(const [entryId,count] of [[first,1],[afterReplacement,0],[afterImageEdit,1],[afterRemoval,0],[afterMemory,0],[afterCompaction,0]] as const){const preview=await prepareNativeImport({root,projectId:project.id,path,entryId});assert.equal(preview.effectiveImageCount,count,entryId);}
    assert.deepEqual(readFileSync(path),original);
    const sha256=createHash('sha256').update(original).digest('hex');const imports=new NativeImports(app.store,root);const upload=imports.begin(project.id,'images.jsonl',original.length,sha256,'owned-images');imports.write(project.id,upload.id,0,original);
    let supportsImages=false;const policy:Policy={version:8,projectId:project.id,allowModel:true,toolNames:[],maxCalls:1,maxCostUsd:1,reservePerCallUsd:1,maxOutputTokens:128,timeoutMs:1000};
    const submissions=new NativeImportSubmission(app.store,app.service,imports,async()=>({policy,plugins:[],mcpServers:[],pluginSignature:'owned',mcpSignature:'owned',supportsImages}));
    await assert.rejects(submissions.prepare(project.id,upload.id,sha256,first),{status:400});
    await submissions.prepare(project.id,upload.id,sha256,afterRemoval);
    supportsImages=true;const accepted=await submissions.prepare(project.id,upload.id,sha256,afterImageEdit);
    supportsImages=false;await assert.rejects(submissions.submit(project.id,upload.id,{confirmationId:accepted.id,commandId:'incompatible-submit',title:'Images',goal:'Owned',acceptCurrentEnvironment:true,externalEffectsReview:'No external operations'}),{status:400});
    assert.equal(app.store.list('run').length,0);assert.equal(app.store.list('task').length,0);
  }finally{await app.close();}
});
