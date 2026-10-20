import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.js';
import type {Policy,Run} from '../shared/contracts.js';
import type {PluginInteraction} from '../shared/plugin-interaction.js';
import {createInteraction,answerInteraction,acknowledgeInteraction,closeInteractions,interactionView} from '../server/plugin-interaction.js';
import {Store} from '../server/store.js';
import {backup,restore} from '../server/backup.js';
import {recordPluginNotice} from '../server/plugin-notice.js';
import type {PluginNotice} from '../shared/plugin-interaction.js';

test('plugin dialogs persist requests, accept one answer, and never store input secrets',async()=>{
  const app=createApp({dataDir:mkdtempSync(join(tmpdir(),'plugin-interaction-')),password:'interaction-test-password',schedule:false});
  try{
    const project=app.service.createProject('Dialog contract');
    const policy:Policy={version:8,projectId:project.id,toolNames:[],allowModel:false,maxCalls:0,maxCostUsd:0,reservePerCallUsd:0,maxOutputTokens:100,timeoutMs:10000};
    const run=app.service.submit(project.id,'goal','run','pi',policy,[],undefined,{view:'project'}).run;
    app.service.transition(run.id,'running',{mcpManifest:{schemaVersion:1,signature:'fixture',enabled:true,globalRevision:0,projectRevision:0,servers:[],autoEnableCodemode:true,codemode:true,toolSearch:false}});
    const now=Date.now();const request={id:'dialog-input',source:'builtin:mcp',kind:'input' as const,title:'Enter value',timeoutMs:10000};
    assert.throws(()=>createInteraction(app.store,run.id,{...request,source:'unapproved'}),/来源/);
    app.store.db.exec("CREATE TRIGGER reject_dialog BEFORE INSERT ON events WHEN json_extract(NEW.body,'$.type')='run.interaction' BEGIN SELECT RAISE(ABORT,'controlled dialog failure'); END");
    assert.throws(()=>createInteraction(app.store,run.id,request,now),/controlled dialog failure/);assert.equal(app.store.list('plugin_interaction').length,0);app.store.db.exec('DROP TRIGGER reject_dialog');
    const dialog=createInteraction(app.store,run.id,request,now);
    assert.equal(createInteraction(app.store,run.id,request,now+100).expiresAt,dialog.expiresAt,'retry cannot extend the wait');
    assert.throws(()=>createInteraction(app.store,run.id,{...request,title:'different'}),/不同请求/);
    assert.throws(()=>answerInteraction(app.store,'another-run',dialog.id,1,'wrong','secret',now),/不属于/);
    assert.throws(()=>answerInteraction(app.store,run.id,dialog.id,1,'wrong',true,now),/格式/);
    app.store.db.exec("CREATE TRIGGER reject_answer BEFORE INSERT ON events WHEN json_extract(NEW.body,'$.type')='run.interaction_answered' BEGIN SELECT RAISE(ABORT,'controlled answer failure'); END");
    assert.throws(()=>answerInteraction(app.store,run.id,dialog.id,1,'answer','never-store-this-secret',now),/controlled answer failure/);
    assert.equal(app.store.get<PluginInteraction>('plugin_interaction',dialog.id).state,'pending');app.store.db.exec('DROP TRIGGER reject_answer');
    const first=answerInteraction(app.store,run.id,dialog.id,1,'answer','never-store-this-secret',now);assert.equal(first.fresh,true);assert.equal(first.answer,'never-store-this-secret');
    const repeat=answerInteraction(app.store,run.id,dialog.id,1,'answer','different-payload',now);assert.equal(repeat.fresh,false);assert.equal(repeat.answer,undefined,'same command retrieves receipt, never resends any value');
    const capacity=app.store.capacity!;const exclusive=capacity.exclusive;
    try{capacity.exclusive=()=>{throw new Error('simulated concurrent history write lock');};
      assert.equal(answerInteraction(app.store,run.id,dialog.id,1,'answer','different-payload',now).fresh,false);
      assert.throws(()=>answerInteraction(app.store,run.id,dialog.id,1,'another-page','second-answer',now),/已答复/);
    }finally{capacity.exclusive=exclusive;}
    assert.throws(()=>answerInteraction(app.store,run.id,dialog.id,1,'another-page','second-answer',now),/已答复/);
    const delivered=acknowledgeInteraction(app.store,run.id,dialog.id,now);assert.equal(delivered.state,'delivered');assert.equal(acknowledgeInteraction(app.store,run.id,dialog.id,now).revision,delivered.revision);
    const reader=new Store(app.store.path,{readOnly:true});
    try{assert.equal(reader.get<PluginInteraction>('plugin_interaction',dialog.id).state,'delivered');assert(!JSON.stringify(reader.db.prepare('SELECT body FROM entities UNION ALL SELECT body FROM events').all()).includes('never-store-this-secret'));}finally{reader.close();}
    const select=createInteraction(app.store,run.id,{id:'select',source:'builtin:mcp',kind:'select',title:'Choose',options:['A','B'],timeoutMs:10000},now);
    assert.throws(()=>answerInteraction(app.store,run.id,select.id,1,'select-wrong','C',now),/格式/);
    assert.equal(answerInteraction(app.store,run.id,select.id,1,'select-good','B',now).answer,'B');
    const confirm=createInteraction(app.store,run.id,{id:'confirm',source:'builtin:mcp',kind:'confirm',title:'Continue?',timeoutMs:10000},now);
    assert.equal(answerInteraction(app.store,run.id,confirm.id,1,'confirm-no',false,now).answer,false);
    const dismissed=createInteraction(app.store,run.id,{...request,id:'dismissed'},now);assert.equal(answerInteraction(app.store,run.id,dismissed.id,1,'dismiss',null,now).answer,null);
    const expiring=createInteraction(app.store,run.id,{...request,id:'expired',timeoutMs:1},now);
    assert.equal(interactionView(app.store,expiring,now+1).state,'expired');assert.throws(()=>answerInteraction(app.store,run.id,expiring.id,1,'late','text',now+1),/到期/);
    assert.equal(closeInteractions(app.store,run.id,'expired',now+1),1);
    const pending=createInteraction(app.store,run.id,{...request,id:'pending'},now);
    app.service.transition(run.id,'interrupted');
    assert.equal(interactionView(app.store,pending,now).state,'closed');assert.throws(()=>answerInteraction(app.store,run.id,pending.id,1,'stopped','text',now),/停止/);
    assert.throws(()=>acknowledgeInteraction(app.store,run.id,select.id,now),/不再可交付/);
    assert.equal(closeInteractions(app.store,run.id,'worker_exited',now),4);assert.equal(closeInteractions(app.store,run.id,'worker_exited',now),0);
    assert.equal(app.store.get<Run>('run',run.id).status,'interrupted');
  }finally{await app.close();}
});

test('backup restore closes pending and accepted dialogs without replaying answers or changing originals',async()=>{
  const root=mkdtempSync(join(tmpdir(),'dialog-backup-'));const data=join(root,'data');
  const app=createApp({dataDir:data,password:'dialog-backup-password',schedule:false});
  try{
    const project=app.service.createProject('Restore dialogs');
    const policy:Policy={version:8,projectId:project.id,toolNames:[],allowModel:false,maxCalls:0,maxCostUsd:0,reservePerCallUsd:0,maxOutputTokens:100,timeoutMs:10000};
    const run=app.service.submit(project.id,'goal','run','pi',policy).run;
    app.service.transition(run.id,'running',{mcpManifest:{schemaVersion:1,signature:'fixture',enabled:true,globalRevision:0,projectRevision:0,servers:[],autoEnableCodemode:true,codemode:true,toolSearch:false}});
    const make=(id:string)=>createInteraction(app.store,run.id,{id,source:'builtin:mcp',kind:'input',title:'Value',timeoutMs:60000});
    const pending=make('pending');const answered=make('answered');const delivered=make('delivered');
    const notice=recordPluginNotice(app.store,run.id,{id:'notice',source:'builtin:mcp',level:'warning',message:'Controlled warning'});
    assert.equal(recordPluginNotice(app.store,run.id,{id:'notice',source:'builtin:mcp',level:'warning',message:'Controlled warning'}).revision,notice.revision);
    assert.throws(()=>recordPluginNotice(app.store,run.id,{id:'notice',source:'builtin:mcp',level:'warning',message:'Different'}),/不同内容/);
    assert.throws(()=>recordPluginNotice(app.store,run.id,{id:'unapproved',source:'unapproved',level:'info',message:'text'}),/来源/);
    app.store.db.exec("CREATE TRIGGER reject_notice BEFORE INSERT ON events WHEN json_extract(NEW.body,'$.type')='run.plugin_notice' BEGIN SELECT RAISE(ABORT,'controlled notice failure'); END");
    assert.throws(()=>recordPluginNotice(app.store,run.id,{id:'rollback',source:'builtin:mcp',level:'info',message:'text'}),/controlled notice failure/);
    assert.equal(app.store.list('plugin_notice').length,1);app.store.db.exec('DROP TRIGGER reject_notice');
    answerInteraction(app.store,run.id,answered.id,1,'answer-one','private-backup-value');
    answerInteraction(app.store,run.id,delivered.id,1,'answer-two','private-backup-value');acknowledgeInteraction(app.store,run.id,delivered.id);
    // An external process loss can leave dialog rows before its exit callback runs.
    app.service.transition(run.id,'interrupted');
    backup(app.store,data,join(root,'backup'));restore(join(root,'backup'),join(root,'restored'));
    const restored=new Store(join(root,'restored','workbench.sqlite'));
    try{
      assert.equal(restored.get<PluginNotice>('plugin_notice',notice.id).message,'Controlled warning');
      for(const id of [pending.id,answered.id])assert.equal(restored.get<PluginInteraction>('plugin_interaction',id).state,'closed','restore must close waits before any scheduler tick');
      assert.equal(restored.get<PluginInteraction>('plugin_interaction',delivered.id).state,'delivered','historical worker receipt remains true');
      assert.throws(()=>answerInteraction(restored,run.id,pending.id,1,'new','value'),/已答复|停止/);
      assert.equal(answerInteraction(restored,run.id,answered.id,1,'answer-one','private-backup-value').fresh,false);
      assert(!JSON.stringify(restored.db.prepare('SELECT body FROM entities UNION ALL SELECT body FROM events').all()).includes('private-backup-value'));
    }finally{restored.close();}
    assert.equal(app.store.get<PluginInteraction>('plugin_interaction',pending.id).state,'pending');
    assert.equal(app.store.get<PluginInteraction>('plugin_interaction',answered.id).state,'answered');
  }finally{await app.close();}
});
