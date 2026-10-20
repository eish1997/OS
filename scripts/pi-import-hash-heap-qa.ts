import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright-core';
import {createApp} from '../server/app.js';
import {config} from '../server/config.js';

const root=mkdtempSync(join(tmpdir(),'pi-import-heap-'));const evidence='output/dev-evidence/pi-parity/import-hash';mkdirSync(evidence,{recursive:true});
const app=createApp({dataDir:root,staticDir:'output/pi-parity-build',password:'import-heap-test',schedule:false});
const project=app.service.createProject('Import heap');
await new Promise<void>(done=>app.server.listen(0,'127.0.0.1',done));const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;config.origin=base;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,args:['--js-flags=--expose-gc']});const context=await browser.newContext();const page=await context.newPage();page.setDefaultTimeout(30000);
const client=await context.newCDPSession(page);await client.send('Performance.enable');
const heap=async()=>Number((await client.send('Performance.getMetrics')).metrics.find(metric=>metric.name==='JSHeapUsedSize')?.value??0);
const fileBytes=32*1024*1024;
try{
  await context.request.post(base+'/api/login',{data:{password:'import-heap-test'}});await page.goto(base);
  await page.getByLabel('当前项目',{exact:true}).click();await page.locator(`[role=option][data-value="${project.id}"]`).click();
  await page.getByRole('button',{name:'＋ 窗口',exact:true}).click();await page.getByRole('button',{name:/Pi 对话/}).click();await page.getByRole('button',{name:'新建对话',exact:true}).click();
  await page.getByRole('button',{name:'导入原生会话',exact:true}).click();
  await page.getByLabel('原生会话文件',{exact:true}).setInputFiles({name:'heap.jsonl',mimeType:'application/x-ndjson',buffer:Buffer.alloc(fileBytes,0x61)});
  const baseline=await heap();const samples:number[]=[];let hashing=false;
  const watch=setInterval(()=>{void heap().then(value=>{samples.push(value);});},20);
  await page.getByRole('button',{name:'保存原件并校验',exact:true}).click();
  await page.getByRole('status').filter({hasText:'正在校验所选文件'}).waitFor();hashing=true;
  await page.getByRole('button',{name:'暂停导入',exact:true}).click();
  await page.getByRole('status').filter({hasText:'已暂停'}).waitFor();
  clearInterval(watch);await new Promise(resolve=>setTimeout(resolve,50));
  const peak=Math.max(baseline,...samples);const growth=peak-baseline;
  await page.evaluate(()=>{(globalThis as {gc?:()=>void}).gc?.();});
  const retained=await heap();const retainedGrowth=retained-baseline;
  assert(hashing);assert(samples.length>1);
  assert(growth<fileBytes,`JS heap grew by the whole file: ${growth}`);
  assert(retainedGrowth<4*1024*1024,`hash retained ${retainedGrowth} bytes after GC`);
  assert.equal(app.store.list('native_import').length,0);
  writeFileSync(join(evidence,'heap-report.json'),JSON.stringify({fileBytes,chunkBytes:1024*1024,baseline,peak,growth,retained,retainedGrowth,samples:samples.length,imports:0},null,2));
  console.log(`PASS: 32MiB hash paused before create; peak JS heap growth ${growth}; after GC ${retainedGrowth}; samples ${samples.length}`);
}finally{await browser.close();await app.close();}
