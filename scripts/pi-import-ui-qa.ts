import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright-core';
import {createApp} from '../server/app.js';
import {config} from '../server/config.js';
import type {NativeImport} from '../server/native-imports.js';
import {setTimeout as delay} from 'node:timers/promises';
import {modelToolSequence} from '../tests/helpers/model-tool-sequence.js';
import {inspectPlugin} from '../server/plugin-packages.js';
import type {Run} from '../shared/contracts.js';

const root=mkdtempSync(join(tmpdir(),'pi-import-ui-'));const evidence='output/dev-evidence/pi-parity/import-ui';mkdirSync(evidence,{recursive:true});
const restoreUI=process.env.RESTORE_UI==='1';const transport=restoreUI?modelToolSequence(root,[]):undefined;
if(restoreUI)Object.assign(config,{apiKey:'offline-import-ui',provider:'openai',model:'gpt-5.6-sol',maxCalls:2,budgetUsd:100,reservePerCallUsd:10});
const app=createApp({dataDir:root,staticDir:'output/pi-parity-build',password:'import-ui-test',schedule:false});const project=app.service.createProject('Import UI');
if(transport){const state=app.plugins.state;const op=state.enqueue({action:'install',source:transport.source,revision:state.configuration().revision,commandId:'owned-import-ui',trusted:true});const pkg=await inspectPlugin(transport.source,app.plugins.agentDir);state.phase(op.id,'committing','Owned fixture');state.commit(op.id,[pkg]);state.configure(state.configuration().revision,pkg.id,true);}
await new Promise<void>(done=>app.server.listen(0,'127.0.0.1',done));const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;config.origin=base;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});const context=await browser.newContext({viewport:{width:1300,height:900}});const page=await context.newPage();page.setDefaultTimeout(15000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
const timestamp=new Date().toISOString();const bytes=Buffer.from([JSON.stringify({type:'session',version:3,id:'owned',cwd:'Z:/ignored',timestamp}),JSON.stringify({type:'message',id:'first',parentId:null,timestamp,message:{role:'user',content:'OWNED_IMPORT_START',timestamp:1}}),JSON.stringify({type:'message',id:'later',parentId:'first',timestamp,message:{role:'user',content:'unselected history '.repeat(100000),timestamp:2}})].join('\n')+'\n');
try{
  await context.request.post(base+'/api/login',{data:{password:'import-ui-test'}});await page.goto(base);
  await page.getByLabel('当前项目',{exact:true}).click();await page.locator(`[role=option][data-value="${project.id}"]`).click();
  await page.getByRole('button',{name:'＋ 窗口',exact:true}).click();await page.getByRole('button',{name:/Pi 对话/}).click();await page.getByRole('button',{name:'新建对话',exact:true}).click();
  await page.getByRole('button',{name:'导入原生会话',exact:true}).click();
  let dropped=0;await context.route('**/api/native-imports/*?*',async route=>{if(route.request().method()==='PUT'&&!dropped){const response=await route.fetch();assert.equal(response.status(),200);dropped++;await route.abort('failed');}else await route.continue();});
  const file={name:'owned.jsonl',mimeType:'application/x-ndjson',buffer:bytes};
  await page.getByLabel('原生会话文件',{exact:true}).setInputFiles(file);await page.getByRole('button',{name:'保存原件并校验',exact:true}).click();await page.getByRole('alert').filter({hasText:/fetch|Failed|失败/}).waitFor();
  assert.equal(dropped,1);assert.equal(app.store.list('native_import').length,1);
  const pending=app.store.list<NativeImport>('native_import')[0];
  const deadline=Date.now()+5000;while(!app.store.list('workbench_config').some(item=>JSON.stringify(item).includes('"type":"chat"'))&&Date.now()<deadline)await delay(25);
  assert(app.store.list('workbench_config').some(item=>JSON.stringify(item).includes('"type":"chat"')));
  await page.reload();await page.getByRole('button',{name:'导入原生会话',exact:true}).click();await page.getByLabel('导入记录',{exact:true}).selectOption(pending.id);
  await page.getByLabel('原生会话文件',{exact:true}).setInputFiles(file);await page.getByRole('button',{name:'继续上传并校验',exact:true}).click();
  await page.getByLabel('导入校验预览',{exact:true}).waitFor();assert.equal(app.store.list('native_import').length,1);
  const record=app.store.list<NativeImport>('native_import')[0];assert.deepEqual(readFileSync(join(root,'sessions',project.id,`import-${record.id}.jsonl`)),bytes);
  assert.equal(app.store.list('run').length,0);assert.equal(app.store.list('task').length,0);
  await page.getByLabel('导入校验预览',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:join(evidence,'preview.png')});
  if(restoreUI){
    await page.getByRole('button',{name:'选择恢复历史位置',exact:true}).click();await page.getByRole('radio').first().check();await page.getByRole('button',{name:'核对恢复环境',exact:true}).click();
    await page.getByText(/恢复副本及临时文件预计需额外/).waitFor();await page.getByText(/恢复副本及临时文件预计需额外/).scrollIntoViewIfNeeded();await page.screenshot({path:join(evidence,'environment.png')});
    await page.getByLabel('我确认使用上述当前环境恢复',{exact:true}).check();await page.getByLabel('外部操作核对说明',{exact:true}).fill('Owned fixture, no external operations');await page.getByLabel('恢复话题名称',{exact:true}).fill('Recovered UI topic');await page.getByLabel('恢复后的新目标',{exact:true}).fill('Continue this owned fixture');
    let droppedRestore=0;await context.route('**/api/native-imports/*/restore',async route=>{if(!droppedRestore){const response=await route.fetch();assert.equal(response.status(),202);droppedRestore++;await route.abort('failed');}else await route.continue();});
    await page.getByRole('button',{name:'创建恢复话题并执行',exact:true}).click();await page.getByRole('alert').filter({hasText:/fetch|Failed|失败/}).waitFor();assert.equal(app.store.list('run').length,1);
    await page.reload();await page.getByRole('button',{name:'导入原生会话',exact:true}).click();await page.getByLabel('导入记录',{exact:true}).selectOption(record.id);await page.getByRole('button',{name:'核对恢复提交结果',exact:true}).click();await page.getByRole('button',{name:'打开恢复话题',exact:true}).waitFor();assert.equal(app.store.list('run').length,1);
    const run=app.store.list<Run>('run')[0];const deadline=Date.now()+15000;let final=run;while(Date.now()<deadline){app.scheduler.tick();final=app.store.get<Run>('run',run.id);if(['completed','failed','interrupted'].includes(final.status)&&!app.scheduler.pluginMaintenanceBlocked())break;await delay(25);}assert.equal(final.status,'completed',final.error??'worker failed');
    const payload=readFileSync(transport!.payloads,'utf8');assert(payload.includes('OWNED_IMPORT_START'));assert(!payload.includes('unselected history'));
    await page.getByRole('button',{name:'打开恢复话题',exact:true}).click();await page.getByText('SEQUENCE_DONE',{exact:true}).waitFor();await page.getByText('已完成',{exact:true}).waitFor();await page.screenshot({path:join(evidence,'restored.png')});
    await page.getByRole('button',{name:'导入起点历史预览',exact:true}).click();const inherited=page.getByLabel('导入继承历史',{exact:true});await inherited.getByText('OWNED_IMPORT_START',{exact:true}).waitFor();assert(!(await inherited.innerText()).includes('unselected history'));await inherited.scrollIntoViewIfNeeded();await page.screenshot({path:join(evidence,'inherited.png')});
    assert.deepEqual(readFileSync(join(root,'sessions',project.id,`import-${record.id}.jsonl`)),bytes);assert.equal(droppedRestore,1);
  }else{await page.getByRole('button',{name:'撤销并删除导入副本',exact:true}).click();await page.getByRole('status').filter({hasText:'已撤销，服务端导入副本已删除'}).waitFor();assert.equal(app.store.get<NativeImport>('native_import',record.id).revoked,true);}
  assert.deepEqual(errors,[]);
  console.log(restoreUI?'PASS: browser upload/reload/resume, environment confirmation, restore lost reply/reload/same receipt, open completed topic; one actual Pi worker with owned transport; zero external model requests':'PASS: browser upload lost reply, resume same file, byte-exact preview, cancellation; zero model runs');
}finally{await browser.close();await app.close();}
