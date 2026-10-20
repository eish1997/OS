import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright-core';
import {createApp} from '../server/app.js';
import {config} from '../server/config.js';
Object.assign(config,{apiKey:'offline-import-hash',provider:'openai',model:'gpt-5.6-sol',maxCalls:1,budgetUsd:1,reservePerCallUsd:1});

const root=mkdtempSync(join(tmpdir(),'pi-import-hash-'));const evidence='output/dev-evidence/pi-parity/import-hash';mkdirSync(evidence,{recursive:true});
const app=createApp({dataDir:root,staticDir:'output/pi-parity-build',password:'import-hash-test',schedule:false,storageLimits:{sessionsBytes:80_000}});
const project=app.service.createProject('Import hash');
await new Promise<void>(done=>app.server.listen(0,'127.0.0.1',done));const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;config.origin=base;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});const context=await browser.newContext({viewport:{width:1280,height:900}});const page=await context.newPage();page.setDefaultTimeout(60000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{if(response.url().includes('/prepare'))void response.text().then(body=>console.log('prepare',response.status(),body.slice(0,500))).catch(()=>{});});
const timestamp=new Date().toISOString();const small=Buffer.from([JSON.stringify({type:'session',version:3,id:'owned',cwd:'Z:/ignored',timestamp}),JSON.stringify({type:'message',id:'first',parentId:null,timestamp,message:{role:'user',content:'CAPACITY_BODY '+'x'.repeat(28000),timestamp:1}})].join('\n')+'\n');
const large=Buffer.alloc(16*1024*1024,0x61);
try{
  await context.request.post(base+'/api/login',{data:{password:'import-hash-test'}});await page.goto(base);
  await page.getByLabel('当前项目',{exact:true}).click();await page.locator(`[role=option][data-value="${project.id}"]`).click();
  await page.getByRole('button',{name:'＋ 窗口',exact:true}).click();await page.getByRole('button',{name:/Pi 对话/}).click();await page.getByRole('button',{name:'新建对话',exact:true}).click();
  await page.getByRole('button',{name:'导入原生会话',exact:true}).click();
  await page.getByLabel('原生会话文件',{exact:true}).setInputFiles({name:'large.jsonl',mimeType:'application/x-ndjson',buffer:large});
  const started=Date.now();
  await page.getByRole('button',{name:'保存原件并校验',exact:true}).click();
  await page.getByRole('status').filter({hasText:'正在校验所选文件'}).waitFor();
  await page.getByRole('button',{name:'暂停导入',exact:true}).click();
  await page.getByRole('status').filter({hasText:'已暂停，可重新选择原文件继续上传。'}).waitFor();
  assert.equal(app.store.list('native_import').length,0,`pause landed after ${Date.now()-started}ms`);
  await page.screenshot({path:join(evidence,'paused.png')});
  await page.getByLabel('原生会话文件',{exact:true}).setInputFiles({name:'small.jsonl',mimeType:'application/x-ndjson',buffer:small});
  await page.getByRole('button',{name:'保存原件并校验',exact:true}).click();
  await page.getByLabel('导入校验预览',{exact:true}).waitFor();
  assert.equal(app.store.list('native_import').length,1);assert.equal(app.store.list('run').length,0);
  await page.getByRole('button',{name:'选择恢复历史位置',exact:true}).click();await page.getByRole('radio').first().check();
  console.log('small-bytes',small.length);
  await page.getByRole('button',{name:'核对恢复环境',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'会话空间不足'}).waitFor();
  assert.match(await page.getByRole('alert').innerText(),/现有上限不会提高/);
  assert.equal(app.store.list('native_import_confirmation').length,0);assert.equal(app.store.list('run').length,0);
  const saved=readFileSync(join(root,'sessions',project.id,`import-${app.store.list('native_import')[0].id}.jsonl`));assert.deepEqual(saved,small);
  await page.screenshot({path:join(evidence,'capacity.png')});
  assert.deepEqual(errors,[]);
  console.log(`PASS: hash pause before create in ${Date.now()-started}ms; 507 explains session room without raising the 80000 byte limit; zero runs`);
}catch(error){console.log('URL',page.url());console.log('ALERTS',await page.getByRole('alert').allInnerTexts().catch(()=>[]));console.log('BODY',(await page.locator('body').innerText().catch(()=>'')).slice(0,1500));console.log('PAGEERRORS',errors);await page.screenshot({path:join(evidence,'failed.png')}).catch(()=>{});throw error;}
finally{await browser.close();await app.close();}
