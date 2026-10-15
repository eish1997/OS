import {chromium} from 'playwright-core';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.js';
import {config} from '../server/config.js';
const root=(process.env.WORKBENCH_QA_ROOT||'output/dev-evidence/workbench-ui-069')+'/projects';mkdirSync(root,{recursive:true});
const app=createApp({dataDir:mkdtempSync(join(tmpdir(),'wb-project-')),staticDir:'output/workbench-build',password:'project-test',schedule:false});
const a=app.service.createProject('项目 A'),b=app.service.createProject('项目 B');app.assets.write(a.id,'A-only.md','text/markdown','A content');app.assets.write(b.id,'B-only.md','text/markdown','B content');
await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;config.origin=base;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH}),context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await context.request.post(base+'/api/login',{data:{password:'project-test'}});await page.goto(base);
 async function add(name:RegExp){await page.getByRole('button',{name:'＋ 窗口',exact:true}).click();assert.equal(await page.getByRole('dialog').getByRole('combobox').count(),0);await page.getByRole('dialog').getByRole('button',{name}).click();}
 async function select(id:string){await page.getByRole('combobox',{name:'当前项目'}).click();await page.locator(`[role=option][data-value="${id}"]`).click();}
 await add(/资产浏览/);await add(/Pi 对话/);assert.equal(await page.locator('[data-window]').count(),2);
 await page.getByText('在顶部选择项目后，即可浏览对应资产。').waitFor();
 await select(a.id);await page.getByRole('button',{name:/A-only.md/}).waitFor();assert.equal(await page.getByRole('button',{name:/B-only.md/}).count(),0);
 await page.getByRole('button',{name:'新建对话',exact:true}).click();await page.getByLabel('对话输入').fill('A 草稿');await page.locator('.wb-save').filter({hasText:'已保存'}).waitFor();
 const first=(await(await context.request.get(base+'/api/workbench/config')).json()).layout;
 await select(b.id);await page.getByRole('button',{name:/B-only.md/}).waitFor();assert.equal(await page.getByRole('button',{name:/A-only.md/}).count(),0);assert.equal(await page.getByLabel('对话输入').count(),0);
 await page.getByRole('button',{name:'新建对话',exact:true}).click();await page.getByLabel('对话输入').fill('B 草稿');await select(a.id);await page.getByLabel('对话输入').waitFor();assert.equal(await page.getByLabel('对话输入').inputValue(),'A 草稿');
 await page.locator('.wb-save').filter({hasText:'已保存'}).waitFor();const last=(await(await context.request.get(base+'/api/workbench/config')).json()).layout;assert.deepEqual(last.workspaces,first.workspaces);assert.deepEqual(last.floating,first.floating);assert.deepEqual(Object.keys(last.windows),Object.keys(first.windows));
 await page.reload();await page.getByLabel('对话输入').waitFor();assert.equal(await page.getByLabel('对话输入').inputValue(),'A 草稿');assert.match(await page.getByRole('combobox',{name:'当前项目'}).innerText(),/项目 A/);
 await select(b.id);await page.getByLabel('对话输入').waitFor();assert.equal(await page.getByLabel('对话输入').inputValue(),'B 草稿');
 const region=page.locator('.wb-region').filter({has:page.locator('.wb-assets-pane')});const regionId=await region.getAttribute('data-leaf');const bounds=await region.boundingBox();
 await region.getByRole('button',{name:'切换窗口',exact:true}).click();await page.getByRole('dialog',{name:'切换窗口'}).getByRole('button',{name:/布局演示/}).click();
 const same=page.locator(`[data-leaf="${regionId}"]`);assert.deepEqual(await same.boundingBox(),bounds);assert.equal(await same.locator('.wb-demo').count(),1);assert.equal(await page.locator('.wb-floating').count(),0);
 await same.getByRole('button',{name:'切换窗口',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:/留空/}).click();assert.deepEqual(await same.boundingBox(),bounds);assert.equal(await same.locator('[data-window]').count(),0);await same.getByRole('button',{name:'添加窗口',exact:true}).waitFor();
 await page.screenshot({path:root+'/project-B.png'});assert.deepEqual(errors,[]);writeFileSync(root+'/report.json',JSON.stringify({status:'passed',checks:['add assets and Pi without project','no project picker in add dialog','global project filters assets','separate conversations and drafts','layout geometry preserved','selection and drafts survive reload','replace occupied region without creating floating window','leave region empty and preserve geometry'],errors},null,2));console.log('Project context browser validation passed');
}finally{await browser.close();await app.close();}
