import { chromium } from 'playwright-core';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp } from '../../../server/app.js';
import { config } from '../../../server/config.js';
import { persistTextChunk } from '../../../server/run-stream.js';
import { persistToolProgress } from '../../../server/tool-progress.js';
import { loadPi } from '../../../server/pi-adapter.js';
import { createInteraction } from '../../../server/plugin-interaction.js';
import type { Run } from '../../../shared/contracts.js';

const evidence=resolve('output/dev-evidence/chat-ui-audit-2026-10-21');
mkdirSync(evidence,{recursive:true});
Object.assign(config,{apiKey:'offline-audit-only',provider:'openai',model:'gpt-5.6-sol',maxCalls:4,budgetUsd:4,reservePerCallUsd:1});
const dataDir=mkdtempSync(join(tmpdir(),'chat-ui-audit-'));
const app=createApp({dataDir,staticDir:'dist',password:'offline-audit',schedule:false});
const project=app.service.createProject('对话交互审查（离线样例）');
const pi=await loadPi();
function saveSession(run:Run){
 const cwd=join(dataDir,'workspaces',project.id),dir=join(dataDir,'sessions',project.id);mkdirSync(cwd,{recursive:true});mkdirSync(dir,{recursive:true});
 const session=pi.SessionManager.create(cwd,dir);session.appendMessage({role:'user',content:'离线样例',timestamp:Date.now()});
 session.appendMessage({role:'assistant',content:[{type:'text',text:'样例回复'}],api:'openai-responses',provider:'openai',model:'gpt-5.6-sol',usage:{input:1,output:1,cacheRead:0,cacheWrite:0,totalTokens:2,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:'stop',timestamp:Date.now()});
 const fresh=app.store.get<Run>('run',run.id);app.store.update<Run>('run',run.id,fresh.revision,{sessionId:session.getSessionId(),sessionPath:session.getSessionFile()});
}
await new Promise<void>(done=>app.server.listen(0,'127.0.0.1',done));
const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;config.origin=base;
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const context=await browser.newContext({viewport:{width:1366,height:900}});const page=await context.newPage();page.setDefaultTimeout(12000);
const report:any={realModelRequests:0,staticDir:'dist',scenarios:{},errors:[]};
page.on('pageerror',e=>report.errors.push(e.message));
const geometry=async()=>page.evaluate(()=>{
 const sels=['.wb-chat-pane','.wb-chat-history','.wb-chat-runs','.wb-chat-composer','.wb-chat-composer textarea'];
 const result:any={viewport:{width:innerWidth,height:innerHeight},zoom:getComputedStyle(document.documentElement).zoom};
 for(const sel of sels){const el=document.querySelector(sel) as HTMLElement;if(!el)continue;const r=el.getBoundingClientRect();result[sel]={x:r.x,y:r.y,width:r.width,height:r.height,scrollTop:el.scrollTop,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,fontSize:getComputedStyle(el).fontSize,pointerEvents:getComputedStyle(el).pointerEvents};}
 result.buttons=[...document.querySelectorAll('.wb-chat-pane button')].map(el=>{const r=el.getBoundingClientRect();return{text:el.textContent,x:r.x,y:r.y,width:r.width,height:r.height,disabled:(el as HTMLButtonElement).disabled}});
 return result;
});
try{
 await context.request.post(base+'/api/login',{data:{password:'offline-audit'}});await page.goto(base);
 await page.getByLabel('当前项目',{exact:true}).click();await page.locator(`[role=option][data-value="${project.id}"]`).click();
 await page.getByRole('button',{name:'＋ 窗口',exact:true}).click();await page.getByRole('button',{name:/Pi 对话/}).click();await page.getByRole('button',{name:'新建对话',exact:true}).click();
 report.scenarios.empty=await geometry();await page.screenshot({path:join(evidence,'01-empty.png')});
 await page.getByLabel('对话输入',{exact:true}).waitFor();report.scenarios.empty=await geometry();
 await page.getByLabel('对话输入',{exact:true}).fill('请检查样例目录，并给出详细过程和结果');await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/tasks')&&r.request().method()==='POST'),page.getByRole('button',{name:'发送 ↑',exact:true}).click()]);
 const first=app.store.list<Run>('run')[0];app.service.transition(first.id,'running',{startedAt:new Date().toISOString()});
 const long=Array.from({length:70},(_,i)=>`第 ${i+1} 项：这是离线生成的审查样例，用于检查长回复的滚动、工具过程和输入区域。`).join('\n\n');
 persistTextChunk(app.store,first.id,{messageId:'audit-message',chunk:0,text:long,phase:'partial'});
 persistToolProgress(app.store,first.id,{callId:'audit-read',name:'read',source:'原生工具',sequence:0,phase:'running',preview:'正在检查样例目录中的文件'});
 await page.getByText('模型请求 · 0 次',{exact:true}).waitFor();await page.locator('.wb-message.assistant').waitFor();await page.getByRole('button',{name:'指导当前执行',exact:true}).waitFor();
 report.scenarios.longResponseAtInitialScroll=await geometry();await page.screenshot({path:join(evidence,'02-long-reply-no-follow.png')});
 await page.getByText('模型请求 · 0 次',{exact:true}).click();await page.getByText('实际工具调用',{exact:true}).click();await page.getByText('正在检查样例目录中的文件',{exact:true}).waitFor();
 report.scenarios.toolsExpanded=await geometry();await page.screenshot({path:join(evidence,'03-tools-expanded.png')});
 await page.setViewportSize({width:800,height:600});report.scenarios.narrowTools=await geometry();await page.screenshot({path:join(evidence,'04-narrow-tools.png')});
 await page.setViewportSize({width:1366,height:900});
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByLabel('思考强度',{exact:true}).waitFor();
 report.scenarios.settings={dialogName:await page.getByRole('dialog').getAttribute('aria-label'),heading:await page.getByRole('dialog').locator('header').innerText(),fields:await page.getByRole('dialog').locator('label').allTextContents()};
 await page.screenshot({path:join(evidence,'05-settings.png')});await page.getByRole('button',{name:'关闭设置',exact:true}).click();
 persistTextChunk(app.store,first.id,{messageId:'audit-message',chunk:1,text:'\n\n回复结束。',phase:'final'});
 saveSession(first);persistTextChunk(app.store,first.id,{messageId:'audit-tool-result',chunk:0,text:'样例目录检查结束',phase:'final',channel:'tool_result'});persistToolProgress(app.store,first.id,{callId:'audit-read',name:'read',source:'原生工具',sequence:1,phase:'completed',preview:'样例目录检查结束',resultMessageId:`${first.id}:audit-tool-result`});
 app.service.transition(first.id,'failed',{error:'离线审查样例：第一次执行失败'});
 await page.getByText('任务总额度与恢复',{exact:true}).click();await page.getByLabel('追加请求次数',{exact:true}).waitFor();
 report.scenarios.failedRecovery={geometry:await geometry(),buttons:await page.locator('.wb-chat-pane button').allTextContents()};
 await page.screenshot({path:join(evidence,'06-failed-recovery.png')});
 for(let i=0;i<3;i++){
   await page.getByLabel('对话输入',{exact:true}).fill(`后续测试消息 ${i+1}`);const [response]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/tasks')&&r.request().method()==='POST'),page.getByRole('button',{name:'发送 ↑',exact:true}).click()]);
   if(!response.ok())throw new Error('追加样例任务被拒绝: '+await response.text());
   const run=app.store.list<Run>('run').at(-1)!;app.service.transition(run.id,'running',{startedAt:new Date().toISOString()});saveSession(run);app.service.transition(run.id,'failed',{error:`离线审查样例：后续执行 ${i+1}`});
   await page.getByText(`离线审查样例：后续执行 ${i+1}`,{exact:false}).waitFor();
 }
 await page.getByText('离线审查样例：后续执行 3',{exact:false}).waitFor();
 report.scenarios.fourRuns={totalRuns:app.store.list<Run>('run').length,renderedCards:await page.locator('.wb-chat-runs>div').count(),firstRunErrorVisible:await page.getByText(/第一次执行失败/).count(),historyText:await page.locator('.wb-chat-history').innerText(),geometry:await geometry()};
 await page.screenshot({path:join(evidence,'07-four-runs.png')});
 await page.reload();await page.getByLabel('对话输入',{exact:true}).waitFor();report.scenarios.afterReload=await geometry();
 await page.getByRole('button',{name:'＋ 窗口',exact:true}).click();await page.getByRole('button',{name:/Pi 对话/}).click();await page.getByRole('button',{name:'新建对话',exact:true}).click();
 await page.locator('.wb-chat-pane').nth(1).waitFor();const second=page.locator('.wb-chat-pane').nth(1);
 await second.getByLabel('对话输入',{exact:true}).fill('保持运行，检查排队追问是否遮掉当前执行');
 await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/tasks')&&r.request().method()==='POST'),second.getByRole('button',{name:'发送 ↑',exact:true}).click()]);
 const live=app.store.list<Run>('run').at(-1)!;app.service.transition(live.id,'running',{startedAt:new Date().toISOString()});saveSession(live);
 const latest=app.store.get<Run>('run',live.id);app.store.update<Run>('run',live.id,latest.revision,{mcpManifest:{schemaVersion:1,signature:'offline-audit',enabled:true,globalRevision:0,projectRevision:0,servers:[],autoEnableCodemode:true,codemode:true,toolSearch:false}});
 createInteraction(app.store,live.id,{id:'audit-confirm',source:'builtin:mcp',kind:'confirm',title:'当前执行等待确认',message:'这个问题应该一直能回答',timeoutMs:60000});
 await second.getByRole('group',{name:'当前执行等待确认',exact:true}).waitFor();
 for(let i=0;i<3;i++){
  await second.getByLabel('对话输入',{exact:true}).fill(`排队追问 ${i+1}`);
  const [response]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/tasks')&&r.request().method()==='POST'),second.getByRole('button',{name:'排队追问',exact:true}).click()]);
  if(!response.ok())throw new Error('排队样例被拒绝: '+await response.text());
  await second.getByLabel('对话输入',{exact:true}).inputValue();
 }
 await page.waitForFunction(()=>[...document.querySelectorAll('.wb-chat-pane')][1]?.querySelectorAll('.wb-chat-runs>div').length===3&&![...document.querySelectorAll('.wb-chat-pane')][1]?.textContent?.includes('当前执行等待确认'));
 report.scenarios.queuedFollowups={actualActiveRunStatus:app.store.get<Run>('run',live.id).status,runStatuses:app.store.list<Run>('run').filter(r=>r.conversationId===live.conversationId).map(r=>r.status),renderedCards:await second.locator('.wb-chat-runs>div').count(),pendingConfirmationRendered:await second.getByRole('group',{name:'当前执行等待确认',exact:true}).count(),visibleRunText:await second.locator('.wb-chat-runs').innerText(),composerButtons:await second.locator('.wb-chat-composer button').allTextContents()};
 await page.screenshot({path:join(evidence,'08-active-run-hidden-by-followups.png')});
}catch(e){report.failure=String(e);await page.screenshot({path:join(evidence,'failure.png')}).catch(()=>{});process.exitCode=1;}
finally{writeFileSync(join(evidence,'report.json'),JSON.stringify(report,null,2));await browser.close();await app.close();}
console.log(JSON.stringify({report:join(evidence,'report.json'),scenarios:Object.keys(report.scenarios),failure:report.failure}));
