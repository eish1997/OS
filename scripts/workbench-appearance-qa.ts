import {createRequire} from 'node:module';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.js';
import {config} from '../server/config.js';
const {chromium}=createRequire(import.meta.url)('playwright-core');
const root=(process.env.WORKBENCH_QA_ROOT||'output/dev-evidence/workbench-ui-063')+'/appearance';mkdirSync(root,{recursive:true});
const app=createApp({dataDir:mkdtempSync(join(tmpdir(),'wb-appearance-')),staticDir:'output/workbench-build',password:'appearance-test',schedule:false});
await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;config.origin=base;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();page.setDefaultTimeout(12000);
const checks:string[]=[],errors:string[]=[];page.on('pageerror',(e:Error)=>errors.push(e.message));
try{
  await context.request.post(base+'/api/login',{data:{password:'appearance-test'}});await page.goto(base+'/');await page.getByRole('heading',{name:'安排你的工作空间'}).waitFor();await page.screenshot({path:root+'/start.png',fullPage:true});
  await page.getByRole('button',{name:'添加窗口',exact:true}).first().click();await page.getByRole('button',{name:/布局演示/}).click();await page.getByLabel('演示窗口 1内容').fill('外观切换时保留这段内容');await page.locator('.wb-panel').getByLabel('悬浮',{exact:true}).click();const floating=page.locator('.wb-floating');const original=await floating.boundingBox();
  await page.getByRole('button',{name:'设置',exact:true}).click();const settings=page.getByRole('dialog',{name:'外观设置'});await settings.waitFor();
  await settings.getByRole('radio',{name:/浅色/}).check();const slider=settings.getByLabel('线条粗细',{exact:false});await slider.focus();await page.keyboard.press('End');
  assert.equal(await slider.inputValue(),'3');assert.equal(await floating.evaluate((el:HTMLElement)=>getComputedStyle(el).borderTopWidth),'3px');
  assert.equal(await page.getByRole('separator').first().evaluate((el:HTMLElement)=>getComputedStyle(el,'::before').width),'3px');
  // The six-pixel drag target must not paint over the configurable thin line.
  const divider=page.getByRole('separator').first();
  assert.equal(await divider.evaluate((el:HTMLElement)=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
  assert.equal(await divider.evaluate((el:HTMLElement)=>el.getBoundingClientRect().width),6);
  assert.equal(await page.locator('.wb-root').evaluate((el:HTMLElement)=>getComputedStyle(el).backgroundColor),'rgb(245, 245, 242)');
  assert.equal(await settings.evaluate((el:HTMLElement)=>getComputedStyle(el).borderTopWidth),'3px');
  await page.screenshot({path:root+'/light-settings.png',fullPage:true});await settings.getByRole('button',{name:'完成',exact:true}).click();assert.deepEqual(await floating.boundingBox(),original);assert.equal(await page.getByLabel('演示窗口 1内容').inputValue(),'外观切换时保留这段内容');checks.push('global light palette and 3px floating/dialog/divider borders; bounds and input retained');
  await page.locator('.wb-save').filter({hasText:'已保存'}).waitFor();await page.reload();await floating.waitFor();assert.equal(await floating.evaluate((el:HTMLElement)=>getComputedStyle(el).borderTopWidth),'3px');
  const other=await browser.newContext({viewport:{width:1440,height:1000}});await other.addCookies(await context.cookies());const second=await other.newPage();await second.goto(base+'/');await second.locator('.wb-floating').waitFor();assert.equal(await second.locator('.wb-root').evaluate((el:HTMLElement)=>getComputedStyle(el).backgroundColor),'rgb(245, 245, 242)');await other.close();checks.push('appearance restored after reload and in fresh browser context');
  await page.getByRole('button',{name:'设置',exact:true}).click();for(const name of ['暖灰','石墨','墨黑']){await settings.getByRole('radio',{name:new RegExp(name)}).check();assert.equal(await settings.getByRole('radio',{name:new RegExp(name)}).isChecked(),true);}
  await settings.getByRole('checkbox',{name:'折叠空间导航'}).check();await page.keyboard.press('Escape');assert.equal(await page.locator('.wb-nav').evaluate((el:HTMLElement)=>el.getBoundingClientRect().width),52);await page.locator('.wb-save').filter({hasText:'已保存'}).waitFor();await page.reload();await floating.waitFor();assert.equal(await page.locator('.wb-nav').evaluate((el:HTMLElement)=>el.getBoundingClientRect().width),52);checks.push('all presets selectable; navigation mode persists; Escape closes settings');
  await divider.hover();assert.equal(await divider.evaluate((el:HTMLElement)=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
  await divider.focus();assert.equal(await divider.evaluate((el:HTMLElement)=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
  assert.equal(await divider.evaluate((el:HTMLElement)=>getComputedStyle(el,'::before').width),'3px');checks.push('divider hover and focus preserve a transparent 6px hit target and configured visible line');
  await page.getByRole('button',{name:'设置',exact:true}).click();await settings.getByRole('button',{name:'恢复默认外观'}).click();await settings.getByRole('button',{name:'完成',exact:true}).click();assert.equal(await floating.evaluate((el:HTMLElement)=>getComputedStyle(el).borderTopWidth),'1px');assert.equal(await page.locator('.wb-nav').evaluate((el:HTMLElement)=>el.getBoundingClientRect().width),208);await page.locator('.wb-save').filter({hasText:'已保存'}).waitFor();await page.screenshot({path:root+'/dark-workspace.png',fullPage:true});checks.push('reset appearance preserves layout and restores defaults');
  await page.setViewportSize({width:800,height:600});await page.getByRole('button',{name:'设置',exact:true}).click();await settings.getByRole('button',{name:'完成',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:root+'/small-settings.png',fullPage:true});await settings.getByRole('button',{name:'完成',exact:true}).click();checks.push('settings remain operable at 800x600 with scrollable dialog');
  assert.deepEqual(errors,[]);writeFileSync(root+'/report.json',JSON.stringify({status:'passed',at:new Date().toISOString(),checks,errors,modelRequests:0},null,2));console.log('Appearance browser validation passed');
}catch(e){await page.screenshot({path:root+'/failure.png',fullPage:true});writeFileSync(root+'/report.json',JSON.stringify({status:'failed',checks,error:String(e),errors},null,2));throw e;}
finally{await browser.close();await app.close();}
