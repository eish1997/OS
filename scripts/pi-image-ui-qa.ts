import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {crc32,deflateSync} from 'node:zlib';
import {setTimeout as delay} from 'node:timers/promises';
import {createApp} from '../server/app.js';
import {config} from '../server/config.js';
import {loadPi} from '../server/pi-adapter.js';
import {inspectPlugin} from '../server/plugin-packages.js';
import {modelToolSequence} from '../tests/helpers/model-tool-sequence.js';
import type {Run,Task} from '../shared/contracts.js';

const evidence='output/dev-evidence/pi-parity/image-ui';mkdirSync(evidence,{recursive:true});
const imageGoal=process.env.FULLTEXT_UI==='1'?'Describe the attached image\n'+'Long history text. '.repeat(1000)+'FULLTEXT_END':'Describe the attached image';
Object.assign(config,{apiKey:'offline-image-ui',provider:'openai',model:'gpt-5.6-sol',maxCalls:2,budgetUsd:100,reservePerCallUsd:10});
const root=mkdtempSync(join(tmpdir(),'image-ui-'));const fixture=modelToolSequence(root,[]);
const chunk=(type:string,data:Buffer)=>{const body=Buffer.concat([Buffer.from(type),data]);const size=Buffer.alloc(4);size.writeUInt32BE(data.length);const checksum=Buffer.alloc(4);checksum.writeUInt32BE(crc32(body));return Buffer.concat([size,body,checksum]);};
const header=Buffer.alloc(13);header.writeUInt32BE(1,0);header.writeUInt32BE(1,4);header[8]=8;header[9]=2;
const bytes=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,255,0,0]))),chunk('IEND',Buffer.alloc(0))]);
const app=createApp({dataDir:join(root,'data'),staticDir:'output/pi-parity-build',password:'image-ui-password',schedule:false});
const state=app.plugins.state;const op=state.enqueue({action:'install',source:fixture.source,revision:state.configuration().revision,commandId:'image-ui-fixture',trusted:true});const pkg=await inspectPlugin(fixture.source,app.plugins.agentDir);state.phase(op.id,'committing','Owned fixture');state.commit(op.id,[pkg]);state.configure(state.configuration().revision,pkg.id,true);
const project=app.service.createProject('图片输入验证');
await new Promise<void>(done=>app.server.listen(0,'127.0.0.1',done));const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;config.origin=base;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});const context=await browser.newContext({viewport:{width:1400,height:900}});let page=await context.newPage();page.setDefaultTimeout(15000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
const wait=async(check:()=>boolean,message:string)=>{const deadline=Date.now()+15000;while(!check()&&Date.now()<deadline)await delay(25);assert(check(),message);};
try{
  await context.request.post(base+'/api/login',{data:{password:'image-ui-password'}});await page.goto(base);
  await page.getByLabel('当前项目',{exact:true}).click();await page.locator(`[role=option][data-value="${project.id}"]`).click();
  await page.getByRole('button',{name:'＋ 窗口',exact:true}).click();await page.getByRole('button',{name:/Pi 对话/}).click();await page.getByRole('button',{name:'新建对话',exact:true}).click();
  let droppedUploadReplies=0;
  let uploadHeld=false;let releaseUpload!:()=>void;
  const uploadRelease=new Promise<void>(resolve=>{releaseUpload=resolve;});
  const reopen=process.env.IMAGE_REOPEN==='1'||process.env.IMAGE_REOPEN==='pending';
  let allowReceiptRecovery=!reopen;
  let droppedCreationReplies=0;
  await context.route('**/api/uploads',async route=>{
    if(route.request().method()==='POST'&&!droppedCreationReplies){const result=await route.fetch();assert.equal(result.status(),201);droppedCreationReplies++;await route.abort('failed');}
    else await route.continue();
  });
  await context.route('**/api/uploads/*',async route=>{
    if(route.request().method()==='GET'&&!allowReceiptRecovery)await route.abort('failed');
    else if(route.request().method()==='PUT'&&!droppedUploadReplies){
      if(process.env.IMAGE_CONCURRENT==='1'){uploadHeld=true;await uploadRelease;}
      if(process.env.IMAGE_REOPEN!=='pending'){const result=await route.fetch();assert.equal(result.status(),200);}
      droppedUploadReplies++;await route.abort('failed');
    }
    else await route.continue();
  });
  const chooserPromise=page.waitForEvent('filechooser');await page.getByRole('button',{name:'添加图片',exact:true}).click();
  await (await chooserPromise).setFiles({name:'red-pixel.png',mimeType:'image/png',buffer:bytes});
  if(process.env.IMAGE_CONCURRENT==='1'){
    await wait(()=>uploadHeld,'first page is holding an upload');
    await wait(()=>app.store.list('workbench_config').some(item=>JSON.stringify(item).includes('"type":"chat"')),'chat saved before opening another page');
    const second=await context.newPage();second.setDefaultTimeout(15000);
    try{
      await second.goto(base);await second.getByRole('button',{name:'恢复图片上传',exact:true}).click();
      await second.getByText(/另一页面正在处理此聊天的图片/).waitFor();
      await second.getByRole('button',{name:'取消本次附加',exact:true}).click();await second.getByText(/另一页面正在处理此聊天的图片/).waitFor();
      assert.equal(app.store.list('upload').length,1);assert.equal(app.store.list('asset').length,0);
      assert(await second.evaluate(()=>Object.keys(localStorage).some(key=>key.startsWith('wb-image-upload-v1:'))),'contending cancel cannot clear the original intent');
    }finally{await second.close();releaseUpload();}
  }
  if(reopen){
    await wait(()=>droppedUploadReplies===1,'controlled upload interruption occurs');
    if(process.env.IMAGE_REOPEN==='pending')assert.equal(app.store.list('asset').length,0,'blocked PUT has not saved an asset');
    await wait(()=>app.store.list('workbench_config').some(item=>JSON.stringify(item).includes('"type":"chat"')),'original chat window is saved');
    await page.getByRole('button',{name:'恢复图片上传',exact:true}).waitFor();await page.close();allowReceiptRecovery=true;
    page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
    await page.getByRole('button',{name:'恢复图片上传',exact:true}).waitFor();
    await page.getByLabel('选择聊天图片').setInputFiles({name:'different.png',mimeType:'image/png',buffer:Buffer.from('different file')});
    await page.getByText(/请重新选择待恢复的同一图片/).waitFor();assert.equal(app.store.list('upload').length,1,'wrong replacement does not create another intent');
    await page.setViewportSize({width:760,height:700});await page.screenshot({path:join(evidence,'upload-recovery-small.png')});
    await page.getByRole('button',{name:'恢复图片上传',exact:true}).click();
    if(process.env.IMAGE_REOPEN==='pending'){
      await page.getByText(/图片内容尚未上传完成/).waitFor();
      assert.equal(await page.getByRole('button',{name:'red-pixel.png ×',exact:true}).count(),0,'pending intent must not appear as an attached asset');
      assert.equal(app.store.list('asset').length,0);assert.equal(app.store.list('upload').length,1);
      await page.getByLabel('选择聊天图片').setInputFiles({name:'red-pixel.png',mimeType:'image/png',buffer:bytes});
    }
  }
  await page.getByRole('button',{name:'red-pixel.png ×',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'恢复图片上传',exact:true}).count(),0);
  const asset=app.store.list<import('../shared/contracts.js').Asset>('asset').find(a=>a.name==='red-pixel.png')!;assert(asset);assert.equal(asset.projectId,project.id);
  assert.equal(droppedCreationReplies,1);assert.equal(droppedUploadReplies,1);assert.equal(app.store.list('upload').length,1);assert.equal(app.store.list('asset').length,1,'lost upload replies must not create a duplicate asset or intent');
  await wait(()=>app.store.list('workbench_config').some(item=>JSON.stringify(item).includes(asset.id)),'attachment is saved with the chat');
  await page.reload();await page.getByRole('button',{name:'red-pixel.png ×',exact:true}).waitFor();
  await page.setViewportSize({width:760,height:700});await page.screenshot({path:join(evidence,'attached-small.png')});
  await page.getByLabel('对话输入').fill(imageGoal);await page.getByRole('button',{name:'发送 ↑',exact:true}).click();
  await wait(()=>app.store.list<Run>('run').length===1,'browser submits one task');const run=app.store.list<Run>('run')[0];
  assert.deepEqual(app.store.get<Task>('task',run.taskId).context.assetIds,[asset.id]);
  const historyImage=page.getByRole('img',{name:'附带图片：red-pixel.png',exact:true});await historyImage.waitFor();
  await historyImage.scrollIntoViewIfNeeded();await historyImage.evaluate((img:HTMLImageElement)=>img.decode());
  const message=app.service.conversation(project.id,undefined,50,run.conversationId).messages.find(item=>item.role==='user')!;
  assert.deepEqual(message.images,[{assetId:asset.id,name:asset.name,hash:asset.hash,url:`/api/assets/${asset.id}`}]);
  app.scheduler.start();await wait(()=>app.store.get<Run>('run',run.id).status==='completed','actual image worker completes');
  await page.getByText('SEQUENCE_DONE',{exact:true}).waitFor();
  assert(existsSync(fixture.payloads));const request=JSON.parse(readFileSync(fixture.payloads,'utf8').trim());
  const images=request.input.flatMap((item:{content?:unknown[]})=>item.content??[]).filter((item:{type:string})=>item.type==='input_image');assert.equal(images.length,1);assert.equal(images[0].image_url,`data:image/png;base64,${bytes.toString('base64')}`);
  assert.deepEqual(app.assets.read(asset),bytes);await page.getByText('SEQUENCE_DONE',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:join(evidence,'completed-small.png')});assert.deepEqual(errors,[]);
  await page.reload();await historyImage.waitFor();await historyImage.scrollIntoViewIfNeeded();await historyImage.evaluate((img:HTMLImageElement)=>img.decode());
  const download=page.getByRole('link',{name:'red-pixel.png · 下载原图',exact:true});assert.equal(await download.getAttribute('href'),`/api/assets/${asset.id}`);
  const original=await context.request.get(base+`/api/assets/${asset.id}`);assert.equal(original.status(),200);assert.deepEqual(await original.body(),bytes);
  assert.equal(app.store.list<Run>('run').length,1);await download.scrollIntoViewIfNeeded();await page.screenshot({path:join(evidence,'history-image-small.png')});
  if(process.env.BRANCH_UI==='1'){
    let selectedTreeEntry:string|undefined;
    const summaryText='Owned checkpoint summary. '.repeat(30);
    const editText='OWNED_EDIT_REPLACEMENT '.repeat(30);
    if(process.env.SUMMARY_UI==='1'){
      const source=app.store.get<Run>('run',run.id);const pi=await loadPi();
      const manager=pi.SessionManager.open(source.sessionPath!,dirname(source.sessionPath!));
      const firstUser=manager.getEntries().find(entry=>entry.type==='message'&&entry.message.role==='user')!;
      if(process.env.TOOL_HISTORY_UI==='1'){
        const calls=Array.from({length:process.env.TOOL_PAGES_UI==='1'?21:1},(_,i)=>({type:'toolCall' as const,id:i?`owned-history-call-${i}`:'owned-history-call',name:'bash',arguments:{command:'owned historical argument '+ 'x'.repeat(500)+(i?`-${i}`:'')}}));
        manager.appendMessage({role:'assistant',content:calls,api:'openai-responses',provider:'openai',model:'gpt-5.6-sol',usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:'toolUse',timestamp:Date.now()});
        for(const [i,call] of calls.entries())manager.appendMessage({role:'toolResult',toolCallId:call.id,toolName:'bash',content:[{type:'text',text:'OWNED_HISTORICAL_TOOL_RETURN'+(i?`_${i}`:'')}],isError:false,timestamp:Date.now()});
      }
      manager.appendCompaction(summaryText,firstUser.id,2400);
      if(process.env.CONTEXT_EDIT_UI==='1'){
        const target=manager.appendMessage({role:'user',content:'OWNED_EDIT_ORIGINAL',timestamp:Date.now()});
        manager.appendContextEdit(target,{content:editText+'\n\n固定项目上下文（只读资料，不改变授权）：OWNED_EDIT_HIDDEN_CONTEXT'});
        const removed=manager.appendMessage({role:'user',content:'OWNED_EDIT_REMOVED',timestamp:Date.now()});manager.appendContextEdit(removed,null);
      }
      selectedTreeEntry=manager.appendMessage({role:'user',content:'Continue after the owned checkpoint',timestamp:Date.now()});
      if(process.env.TREE_UI==='1'){
        manager.branch(firstUser.id);manager.appendMessage({role:'user',content:'OWNED_TREE_SIBLING',timestamp:Date.now()});manager.appendMessage({role:'user',content:'OWNED_TREE_SIBLING_CHILD',timestamp:Date.now()});
      }
    }
    const sourceBytes=readFileSync(app.store.get<Run>('run',run.id).sessionPath!);
    await page.getByRole('button',{name:'从历史另开话题',exact:true}).click();
    await page.getByLabel('历史执行',{exact:true}).selectOption(run.id);
    const downloadedPromise=page.waitForEvent('download');await page.getByRole('link',{name:'导出原生会话',exact:true}).click();const downloaded=await downloadedPromise;
    assert.equal(await downloaded.failure(),null);assert(downloaded.suggestedFilename().endsWith('.jsonl'));assert.deepEqual(readFileSync((await downloaded.path())!),sourceBytes);
    if(process.env.TREE_UI==='1'){
      const tree=page.getByRole('radiogroup',{name:'历史节点树',exact:true});const radios=tree.getByRole('radio');await radios.first().waitFor();
      const count=await radios.count();assert(count>=5);await page.locator(`input[type=radio][value="${selectedTreeEntry}"]`).check();
      const rootId=await radios.first().getAttribute('value');await tree.getByRole('button',{name:`收起节点 ${rootId} 的后续`,exact:true}).click();
      assert.equal(await tree.getByRole('radio').count(),1);assert.equal(await tree.locator('input:checked').count(),0,'collapsing selected descendants clears hidden selection');
      await tree.getByRole('button',{name:`展开节点 ${rootId} 的后续`,exact:true}).click();assert.equal(await radios.count(),count);
      await radios.first().focus();await page.keyboard.press('ArrowDown');assert.equal(await radios.nth(1).isChecked(),true);
      await page.locator(`input[type=radio][value="${selectedTreeEntry}"]`).check();await tree.scrollIntoViewIfNeeded();await page.screenshot({path:join(evidence,'branch-tree-small.png')});
    }else if(process.env.SUMMARY_UI==='1')await page.getByRole('radio').last().check();else await page.getByRole('radio').first().check();
    await page.getByLabel('新话题名称',{exact:true}).fill('图片历史分支');
    await page.getByLabel('分支新目标',{exact:true}).fill('Continue from the image in a new branch');
    await page.getByRole('button',{name:'创建并执行分支',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:join(evidence,'branch-select-small.png')});
    let dropped=false;await context.route('**/api/runs/*/branch',async route=>{if(!dropped){const result=await route.fetch();assert.equal(result.status(),202);dropped=true;await route.abort('failed');}else await route.continue();});
    await page.getByRole('button',{name:'创建并执行分支',exact:true}).click();
    await page.getByRole('button',{name:'重试创建分支',exact:true}).waitFor();
    await page.reload();await page.getByRole('button',{name:'重试创建分支',exact:true}).click();
    await page.getByRole('button',{name:'打开新话题',exact:true}).click();
    const branch=app.store.list<Run>('run').find(r=>r.id!==run.id)!;assert(branch);assert.equal(app.store.list<Run>('run').length,2);assert.notEqual(branch.conversationId,run.conversationId);
    await page.getByText(/分支来源：执行/).waitFor();
    await wait(()=>app.store.get<Run>('run',branch.id).status==='completed','branch actual worker completes');
    assert.deepEqual(readFileSync(app.store.get<Run>('run',run.id).sessionPath!),sourceBytes);
    const payloads=readFileSync(fixture.payloads,'utf8').trim().split('\n').map(line=>JSON.parse(line));assert.equal(payloads.length,2);
    if(process.env.TREE_UI==='1')assert(!JSON.stringify(payloads[1]).includes('OWNED_TREE_SIBLING'),'selected branch excludes sibling subtree');
    assert.equal(payloads[1].input.flatMap((item:{content?:unknown[]})=>item.content??[]).filter((item:{type:string})=>item.type==='input_image').length,1);
    await wait(()=>app.store.list('workbench_config').some(item=>JSON.stringify(item).includes(branch.conversationId!)),'branch window is persisted');
    await page.reload();await page.getByText(/分支来源：执行/).waitFor();assert.equal(app.store.list<Run>('run').length,2);
    await page.getByRole('button',{name:'分支起点历史预览',exact:true}).click();
    const inherited=page.getByLabel('分支继承历史',{exact:true});await inherited.getByText(imageGoal.slice(0,400),{exact:true}).waitFor();
    await inherited.getByText('1 张历史图片',{exact:true}).waitFor();
    await inherited.getByRole('button',{name:'查看历史图片',exact:true}).click();
    const inheritedImage=inherited.getByRole('img',{name:'继承历史图片 1',exact:true});await inheritedImage.scrollIntoViewIfNeeded();await inheritedImage.evaluate((img:HTMLImageElement)=>img.decode());
    const imageUrl=await inherited.getByRole('link',{name:'下载会话图片',exact:true}).getAttribute('href');assert(imageUrl);
    const inheritedBytes=await context.request.get(base+imageUrl);assert.equal(inheritedBytes.status(),200);assert.equal(inheritedBytes.headers()['content-type'],'image/png');assert.equal(inheritedBytes.headers()['cache-control'],'no-store');assert.deepEqual(await inheritedBytes.body(),bytes);
    assert.equal((await fetch(base+imageUrl)).status,401);
    assert.equal((await context.request.get(base+imageUrl.replace('imageIndex=0','imageIndex=99'))).status(),404);
    await page.screenshot({path:join(evidence,'branch-inherited-image-small.png')});
    if(process.env.SUMMARY_UI!=='1')assert.equal(await inherited.getByText('SEQUENCE_DONE',{exact:true}).count(),0,'later source reply is outside selected branch history');
    else{
      await inherited.getByText('上下文压缩 · 原历史',{exact:true}).waitFor();
      await inherited.getByText(/所选路径的最新压缩记录 · 压缩前 2400 tokens/).waitFor();
      const summaryRow=inherited.locator('article').filter({hasText:'上下文压缩 · 原历史'});
      await summaryRow.getByRole('button',{name:'阅读历史全文',exact:true}).click();
      await summaryRow.getByLabel('历史全文',{exact:true}).getByText(summaryText,{exact:true}).waitFor();
      assert(JSON.stringify(payloads[1]).includes('Owned checkpoint summary.'),'actual branch request includes native compaction summary');
      await inherited.getByText('上下文压缩 · 原历史',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:join(evidence,'branch-summary-small.png')});
      if(process.env.CONTEXT_EDIT_UI==='1'){
        await inherited.getByText('上下文替换 · 原历史',{exact:true}).waitFor();await inherited.getByText('上下文移除 · 原历史',{exact:true}).waitFor();
        const editRow=inherited.locator('article').filter({hasText:'上下文替换 · 原历史'});await editRow.getByRole('button',{name:'阅读历史全文',exact:true}).click();
        await editRow.getByLabel('历史全文',{exact:true}).getByText(editText,{exact:true}).waitFor();
        const body=JSON.stringify(payloads[1]);assert(body.includes('OWNED_EDIT_REPLACEMENT'));for(const marker of ['OWNED_EDIT_ORIGINAL','OWNED_EDIT_REMOVED','OWNED_EDIT_HIDDEN_CONTEXT'])assert(!body.includes(marker));
        assert(!(await inherited.textContent())!.includes('OWNED_EDIT_HIDDEN_CONTEXT'));
        await editRow.getByText('上下文替换 · 原历史',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:join(evidence,'context-edit-small.png')});
      }
      if(process.env.TOOL_HISTORY_UI==='1'){
        await inherited.getByText('OWNED_HISTORICAL_TOOL_RETURN',{exact:true}).waitFor();
        await inherited.getByText('工具返回 · 原历史',{exact:true}).first().waitFor();
        const tool=inherited.locator('details').filter({hasText:'历史工具调用：bash'}).first();
        await tool.locator('summary').click();await tool.getByRole('button',{name:'阅读历史全文',exact:true}).click();
        const expected=JSON.stringify({command:'owned historical argument '+ 'x'.repeat(500)},null,2);
        await tool.getByLabel('历史全文',{exact:true}).getByText(expected,{exact:true}).waitFor();
        assert(JSON.stringify(payloads[1]).includes('OWNED_HISTORICAL_TOOL_RETURN'));
        assert.equal(app.store.list('operation').length,0,'viewing historical tool records executes no tool');
        await tool.locator('summary').scrollIntoViewIfNeeded();await page.screenshot({path:join(evidence,'branch-tool-history-small.png')});
        if(process.env.TOOL_PAGES_UI==='1'){
          assert.equal(await inherited.locator('details').count(),20);
          await inherited.getByRole('button',{name:'下一组工具调用',exact:true}).click();
          await inherited.getByText('本条共 21 次工具调用，当前显示 21–21。',{exact:true}).waitFor();
          assert.equal(await inherited.locator('details').count(),1);
          const last=inherited.locator('details').first();await last.locator('summary').click();await last.getByRole('button',{name:'阅读历史全文',exact:true}).click();
          await last.getByLabel('历史全文',{exact:true}).getByText(JSON.stringify({command:'owned historical argument '+'x'.repeat(500)+'-20'},null,2),{exact:true}).waitFor();
          await inherited.getByRole('button',{name:'上一组工具调用',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:join(evidence,'branch-tool-pages-small.png')});
          await inherited.getByRole('button',{name:'上一组工具调用',exact:true}).click();await inherited.getByText('本条共 21 次工具调用，当前显示 1–20。',{exact:true}).waitFor();assert.equal(await inherited.locator('details').count(),20);
        }
      }
    }
    await inherited.scrollIntoViewIfNeeded();await page.screenshot({path:join(evidence,'branch-inherited-small.png')});
    if(process.env.FULLTEXT_UI==='1'){
      await inherited.getByRole('button',{name:'阅读历史全文',exact:true}).click();
      const full=inherited.getByLabel('历史全文',{exact:true});await full.getByText('第 1 段',{exact:true}).waitFor();
      assert.equal(await full.locator('p').first().textContent(),imageGoal.slice(0,16000));
      await full.getByRole('button',{name:'下一段',exact:true}).click();await full.getByText('第 2 段 · 已到末尾',{exact:true}).waitFor();
      assert.equal(await full.locator('p').first().textContent(),imageGoal.slice(16000));
      await full.getByRole('button',{name:'上一段',exact:true}).click();await full.getByText('第 1 段',{exact:true}).waitFor();
      assert.equal(await full.locator('p').first().textContent(),imageGoal.slice(0,16000));
      await full.getByRole('button',{name:'下一段',exact:true}).click();await full.getByText('第 2 段 · 已到末尾',{exact:true}).waitFor();
      await full.getByRole('button',{name:'上一段',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:join(evidence,'branch-fulltext-small.png')});
      await inherited.getByRole('button',{name:'收起历史全文',exact:true}).click();
    }
    const sourceButton=page.getByRole('button',{name:'打开来源话题',exact:true});
    await sourceButton.click();
    await page.waitForFunction(()=>document.activeElement?.classList.contains('wb-window-title')&&document.activeElement.textContent?.includes('Pi 对话'));
    assert.equal(await page.locator('.wb-window-title').count(),2,'opening existing source focuses it without duplicate window');
    const originalWindow=page.locator('[data-window]').filter({has:page.locator('.wb-window-title strong').filter({hasText:/^Pi 对话$/})});
    await originalWindow.getByRole('button',{name:'关闭窗口',exact:true}).click();
    assert.equal(await page.locator('.wb-window-title').count(),1);
    await sourceButton.click();
    await page.getByRole('img',{name:'附带图片：red-pixel.png',exact:true}).waitFor();
    assert.equal(await page.locator('.wb-window-title').count(),2,'closed source is reopened with original conversation');
    assert.equal(app.store.list<Run>('run').length,2,'source navigation submits no task');
    await sourceButton.scrollIntoViewIfNeeded();await page.screenshot({path:join(evidence,'branch-source-small.png')});assert.deepEqual(errors,[]);
  }
  writeFileSync(join(evidence,'report.json'),JSON.stringify({passed:true,realWorkers:process.env.BRANCH_UI==='1'?2:1,realModelRequests:0,branchUi:process.env.BRANCH_UI==='1',uploadedThroughBrowser:true,attachmentSurvivesReload:true,requestContainsImage:true,pageErrors:errors},null,2));
}finally{await browser.close();await app.close();}
