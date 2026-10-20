import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.js';
import {acceptRunInput,updateRunInput,inputView} from '../server/run-input.js';
import type {Policy} from '../shared/contracts.js';

test('steering receipt is atomic, scoped, ordered and never silently moved to a new run',async()=>{
  const app=createApp({dataDir:mkdtempSync(join(tmpdir(),'run-input-')),password:'input-test-password',schedule:false});
  try{
    const project=app.service.createProject('指导回执');const c=app.service.createConversation(project.id,'话题','c');
    const policy:Policy={version:8,projectId:project.id,toolNames:[],allowModel:false,maxCalls:0,maxCostUsd:0,reservePerCallUsd:0,maxOutputTokens:100,timeoutMs:10000};
    const run=app.service.submit(project.id,'goal','run','pi',policy,[],undefined,{view:'project'},null,c.id).run;
    assert.throws(()=>acceptRunInput(app.store,run.id,c.id,'early','text'),/不能接收/);app.service.transition(run.id,'running');
    assert.throws(()=>acceptRunInput(app.store,run.id,'other','wrong','text'),/话题/);
    app.store.db.exec("CREATE TRIGGER reject_input BEFORE INSERT ON events WHEN json_extract(NEW.body,'$.type')='run.input' BEGIN SELECT RAISE(ABORT,'controlled failure'); END");
    assert.throws(()=>acceptRunInput(app.store,run.id,c.id,'rollback','text'),/controlled failure/);assert.equal(app.store.list('run_input').length,0);app.store.db.exec('DROP TRIGGER reject_input');
    const input=acceptRunInput(app.store,run.id,c.id,'stable','text').input;
    assert.throws(()=>updateRunInput(app.store,run.id,input.id,'applied'),/顺序/);
    assert.throws(()=>updateRunInput(app.store,'other',input.id,'queued'),/归属/);
    updateRunInput(app.store,run.id,input.id,'queued');app.service.transition(run.id,'interrupted');
    const receipt=acceptRunInput(app.store,run.id,c.id,'stable','text');assert.equal(receipt.fresh,false);assert.equal(receipt.input.state,'unknown');
    assert.throws(()=>acceptRunInput(app.store,run.id,c.id,'late','text'),/已结束/);
    assert.equal(app.service.conversation(project.id,undefined,50,c.id).messages.find(m=>m.id===input.id)?.inputState,'unknown');
    const final=updateRunInput(app.store,run.id,input.id,'not_applied','worker confirmed queue not consumed');assert.equal(inputView(app.store,final).state,'not_applied');
    assert.throws(()=>updateRunInput(app.store,run.id,input.id,'applied'),/顺序/);
  }finally{await app.close();}
});
