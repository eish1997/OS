/** Explicit opt-in: bounded real model requests through the existing local connection. */
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {config} from '../server/config.js';
import {defaultLayout,addWindow,createWindow,floatWindow,validateLayout,type LayoutRecord} from '../shared/workbench-layout.js';
import type {Conversation,Project,Snapshot,Run,ConversationPage} from '../shared/contracts.js';
if(process.env.WORKBENCH_LIVE_QA!=='1')throw new Error('Requires explicit WORKBENCH_LIVE_QA=1');
const require=createRequire(import.meta.url);const {chromium}=require(process.env.PLAYWRIGHT_PACKAGE || 'playwright-core');
const base='http://127.0.0.1:4310';const evidence='output/dev-evidence/workbench/live';mkdirSync(evidence,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();page.setDefaultTimeout(15000);
let project:Project|undefined;const checks:string[]=[];const errors:string[]=[];page.on('pageerror',(e:Error)=>errors.push(e.message));
async function api<T>(path:string,data?:unknown):Promise<T>{const r=data===undefined?await context.request.get(base+'/api'+path):await context.request.post(base+'/api'+path,{data});if(!r.ok())throw new Error(`${path}: ${r.status()} ${(await r.text()).slice(0,300)}`);return r.json();}
async function waitRun(id:string,accept:(run:Run)=>boolean,timeout=85000){const start=Date.now();while(Date.now()-start<timeout){const s=await api<Snapshot>('/snapshot');const r=s.runs.find(r=>r.id===id);if(r&&accept(r))return r;await new Promise(resolve=>setTimeout(resolve,250));}throw new Error('Timed out waiting for own run '+id);}
try{
  const login=await context.request.post(base+'/api/login',{data:{password:config.password}});assert.equal(login.status(),200);
  const initial=await api<Snapshot>('/snapshot');assert(initial.config.modelConfigured,'Existing connection is not ready');assert(!initial.runs.some(r=>['running','queued','waiting_user','waiting_node'].includes(r.status)),'Existing tasks are active');
  project=await api<Project>('/projects',{name:'工作台重构 · 在线验收 '+new Date().toISOString(),description:'开发验证专用，最多3任务/4模型请求；完成后归档。'});
  const a=await api<Conversation>('/conversations',{projectId:project.id,title:'独立对话 A',commandId:randomUUID()});const b=await api<Conversation>('/conversations',{projectId:project.id,title:'独立对话 B',commandId:randomUUID()});
  const wa=createWindow('chat',a.title,project.id);wa.binding.conversationId=a.id;const wb=createWindow('chat',b.title,project.id);wb.binding.conversationId=b.id;
  let isolated:LayoutRecord={revision:1,layout:floatWindow(addWindow(addWindow(defaultLayout(),wa),wb),wa.id,130,100)};
  // Production business APIs remain real. Test layout is private to this browser, not the user's saved layout.
  await page.route('**/api/workbench/config',async(route:any)=>{if(route.request().method()==='PUT'){const body=route.request().postDataJSON();validateLayout(body.layout);assert.equal(body.revision,isolated.revision);isolated={revision:isolated.revision+1,layout:body.layout};}await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(isolated)});});
  await page.route('**/api/tasks',async(route:any)=>{if(route.request().method()==='POST'){const body=route.request().postDataJSON();await route.continue({postData:JSON.stringify({...body,maxCalls:2,timeoutMs:60000})});}else await route.continue();});
  await page.goto(base+'/workbench');await page.locator(`[data-window="${wa.id}"]`).waitFor();const markerA='WB_A_'+randomUUID().slice(0,8),markerB='WB_B_'+randomUUID().slice(0,8);
  await page.locator(`[data-window="${wa.id}"]`).getByLabel('对话输入').fill(`这是工作台生命周期验收。请仅使用 powershell 工具执行 Start-Sleep -Seconds 5，不读写任何文件，然后只回复 ${markerA}。`);
  await page.locator(`[data-window="${wa.id}"]`).getByRole('button',{name:'发送 ↑',exact:true}).click();
  let first:Run|undefined;for(let i=0;i<40;i++){first=(await api<Snapshot>('/snapshot')).runs.find(r=>r.conversationId===a.id);if(first)break;await new Promise(r=>setTimeout(r,200));}assert(first);
  const running=await waitRun(first.id,r=>r.status==='running'||['completed','failed','cancelled'].includes(r.status));assert.equal(running.status,'running','Need to observe running state before closing');
  await page.locator(`[data-window="${wa.id}"]`).getByLabel('关闭窗口',{exact:true}).click();assert.equal(await page.locator(`[data-window="${wa.id}"]`).count(),0);
  const second=await api<{run:Run}>('/tasks',{projectId:project.id,conversationId:b.id,goal:`不要调用工具，只回复 ${markerB}。`,commandId:randomUUID(),mode:'pi',maxCalls:1,timeoutMs:60000});assert.equal(second.run.continueAfterRunId,undefined);
  await page.reload();await page.getByLabel('当前项目').click();await page.locator('[role=option][data-value="'+project.id+'"]') .click();await page.getByRole('button',{name:'＋ 窗口',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:/Pi 对话/}).click();await page.getByLabel('已有对话').click();await page.locator('[role=option][data-value="'+a.id+'"]') .click();await page.getByRole('button',{name:'打开对话',exact:true}).click();
  const completedA=await waitRun(first.id,r=>['completed','failed','cancelled','interrupted'].includes(r.status));assert.equal(completedA.status,'completed',completedA.error||'A failed');checks.push('Pi completed after its window was closed and browser refreshed');
  const completedB=await waitRun(second.run.id,r=>['completed','failed','cancelled','interrupted'].includes(r.status));assert.equal(completedB.status,'completed',completedB.error||'B failed');
  const follow=await api<{run:Run}>('/tasks',{projectId:project.id,conversationId:a.id,goal:'不要调用工具。请只回复本次对话上一轮要求你回复的 WB_A_ 开头的完整标记。',commandId:randomUUID(),mode:'pi',maxCalls:1,timeoutMs:60000});assert.equal(follow.run.continuation?.runId,first.id);
  const completedFollow=await waitRun(follow.run.id,r=>['completed','failed','cancelled','interrupted'].includes(r.status));assert.equal(completedFollow.status,'completed',completedFollow.error||'Follow failed');
  const historyA=await api<ConversationPage>(`/conversations/${a.id}/messages`),historyB=await api<ConversationPage>(`/conversations/${b.id}/messages`);assert(historyA.messages.filter(m=>m.role==='assistant').at(-1)?.text.includes(markerA));assert(!historyA.messages.some(m=>m.text.includes(markerB)));assert(historyB.messages.some(m=>m.role==='assistant'&&m.text.includes(markerB)));assert(!historyB.messages.some(m=>m.text.includes(markerA)));checks.push('two real same-project conversations and native continuation remain isolated');
  await page.waitForFunction((marker:string)=>document.body.innerText.includes(marker),markerA);await page.screenshot({path:evidence+'/restored-chat.png',fullPage:true});assert.deepEqual(errors,[]);
  const runs=[completedA,completedB,completedFollow];assert(runs.reduce((sum,r)=>sum+r.calls,0)<=4);
  writeFileSync(evidence+'/report.json',JSON.stringify({status:'passed',at:new Date().toISOString(),checks,projectId:project.id,runIds:runs.map(r=>r.id),modelRequests:runs.reduce((sum,r)=>sum+r.calls,0),tokenUsage:runs.map(r=>r.usage),layout:'browser-private fixture; production saved layout not modified',errors},null,2));console.log('Live Pi workbench validation passed');
}catch(e){writeFileSync(evidence+'/report.json',JSON.stringify({status:'failed',at:new Date().toISOString(),checks,projectId:project?.id,error:String(e),errors},null,2));await page.screenshot({path:evidence+'/failure.png',fullPage:true}).catch(()=>{});throw e;}
finally{if(project){const s=await api<Snapshot>('/snapshot').catch(()=>undefined);for(const run of s?.runs.filter(r=>r.projectId===project!.id&&['queued','running','waiting_user','waiting_node'].includes(r.status))||[])await api(`/runs/${run.id}/cancel`,{}).catch(()=>{});await api('/projects/update',{id:project.id,revision:project.revision,archived:true}).catch(()=>{});}await api('/logout',{}).catch(()=>{});await browser.close();}
