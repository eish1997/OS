import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { config } from '../server/config.js';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright-core');
const base='http://127.0.0.1:4310';
const root=(process.env.WORKBENCH_QA_ROOT||'output/dev-evidence/workbench')+'/entry';mkdirSync(root,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();
const errors:string[]=[];page.on('pageerror',(e:Error)=>errors.push(e.message));
try{
  const response=await context.request.post(base+'/api/login',{data:{password:config.password}});assert.equal(response.status(),200);
  const before=await(await context.request.get(base+'/api/workbench/config')).json();
  await page.goto(base+'/');await page.locator('.wb-root').waitFor();assert.equal(await page.locator('.wb-region').count()>0,true);
  await page.screenshot({path:root+'/default-workspace.png',fullPage:true});
  await page.getByRole('button',{name:'＋ 窗口',exact:true}).click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('dialog',{name:'外观设置'}).waitFor();await page.keyboard.press('Escape');
  await page.goto(base+'/legacy');await page.getByRole('heading',{name:'你的工作室',exact:true}).waitFor();assert.equal(await page.locator('.wb-root').count(),0);
  await page.goto(base+'/workbench');await page.locator('.wb-root').waitFor();
  const after=await(await context.request.get(base+'/api/workbench/config')).json();
  // Revision zero is a generated default, whose unsaved node IDs are fresh per read.
  if(before.revision===0){assert.equal(after.revision,0);assert.deepEqual(after.layout.windows,{});assert.deepEqual(after.layout.floating,[]);}
  else assert.deepEqual(after,before);
  assert.deepEqual(errors,[]);writeFileSync(root+'/report.json',JSON.stringify({status:'passed',at:new Date().toISOString(),browser:await browser.version(),checks:['local production default route loads new workspace','window chooser and appearance settings open and Escape closes','legacy route loads original UI','workbench alias loads new UI','saved user layout unchanged'],errors},null,2));
  console.log('Production workbench entry validation passed');
}finally{await context.request.post(base+'/api/logout',{data:{}}).catch(()=>{});await browser.close();}
