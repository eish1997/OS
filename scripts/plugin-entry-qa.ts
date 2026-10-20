import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright-core';
import { config } from '../server/config.js';
import { defaultLayout, addWindow, createWindow, validateLayout, type LayoutRecord } from '../shared/workbench-layout.js';
import type { Snapshot } from '../shared/contracts.js';

const base='http://127.0.0.1:4310';const evidence=resolve(process.env.PLUGIN_QA_ROOT||'output/dev-evidence/plugins/live');mkdirSync(evidence,{recursive:true});
const report=JSON.parse(readFileSync(join(evidence,'report.json'),'utf8'));assert.equal(report.status,'passed');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();
const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
const api=async(path:string)=>{const response=await context.request.get(base+'/api'+path);assert(response.ok());return response.json();};
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
try {
  const login=await context.request.post(base+'/api/login',{data:{password:config.password}});assert.equal(login.status(),200);
  const before=await api('/workbench/config');const snapshot:Snapshot=await api('/snapshot');const run=snapshot.runs.find(r=>r.id===report.runIds[0])!;assert(run?.conversationId);
  const chat=createWindow('chat','插件真实调用记录',run.projectId);chat.binding.conversationId=run.conversationId;
  const manager=createWindow('plugins','插件管理');let layout=addWindow(addWindow(defaultLayout(),manager),chat);layout.activeProjectId=run.projectId;
  let record:LayoutRecord={revision:1,layout};
  await page.route('**/api/workbench/config',async route=>{
    if(route.request().method()==='PUT'){const data=route.request().postDataJSON();validateLayout(data.layout);record={revision:record.revision+1,layout:data.layout};}
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(record)});
  });
  await page.goto(base);await page.getByRole('heading',{name:'还没有安装插件',exact:true}).waitFor();
  await page.locator('.wb-chat-pane').getByText(/PLUGIN_[0-9a-f-]+/).waitFor();
  await page.locator('.wb-plugin-run-details').first().locator('summary').click();
  await page.locator('.wb-plugin-run-details').first().getByText(/workbench_plugin_probe/).waitFor();
  await page.screenshot({path:join(evidence,'deployed-entry.png'),fullPage:true});
  assert.equal(hash(await api('/workbench/config')),hash(before),'User saved layout must remain unchanged');assert.deepEqual(errors,[]);
  writeFileSync(join(evidence,'entry.json'),JSON.stringify({status:'passed',at:new Date().toISOString(),runId:run.id,checks:['deployed default entry','plugin manager empty after cleanup','actual model reply displayed','plugin tool source shown in run details','saved user layout unchanged'],errors},null,2));
}finally{await context.request.post(base+'/api/logout',{data:{}}).catch(()=>{});await browser.close();}
