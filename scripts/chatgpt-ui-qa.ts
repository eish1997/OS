import { createRequire } from 'node:module';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
const require=createRequire(import.meta.url);
if(!process.env.PLAYWRIGHT_PACKAGE||!process.env.CHROME_PATH)throw new Error('Set installed browser paths');
const {chromium}=require(process.env.PLAYWRIGHT_PACKAGE);
const target='output/dev-evidence/ui';mkdirSync(target,{recursive:true});
const report:Record<string,unknown>={at:new Date().toISOString(),status:'running',realModelCall:false,realAccountLogin:false,authorization:'controlled offline fixture'};
const save=()=>writeFileSync(join(target,'chatgpt-interactions.json'),JSON.stringify(report,null,2));save();
const keys=generateKeyPairSync('rsa',{modulusLength:2048});const jwk={...keys.publicKey.export({format:'jwk'}),kid:'ui-offline',alg:'RS256',use:'sig'};let authorization!:URL;
const fetcher:typeof fetch=async(input)=>{
  const url=String(input);if(url==='https://auth.openai.com/.well-known/jwks.json')return Response.json({keys:[jwk]});
  if(url==='https://auth.openai.com/api/accounts/oauth/token'){
    const encode=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');const body=encode({alg:'RS256',kid:jwk.kid})+'.'+encode({iss:'https://auth.openai.com',aud:'oaiapp-ui-offline',sub:'ui-offline-user',email:'qa@example.invalid',exp:Math.floor(Date.now()/1000)+3600,nonce:authorization.searchParams.get('nonce')});
    return Response.json({access_token:'ui-offline-access',refresh_token:'ui-offline-refresh',id_token:body+'.'+sign('RSA-SHA256',Buffer.from(body),keys.privateKey).toString('base64url'),scope:'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',token_type:'Bearer',expires_in:3600});
  }
  if(url==='https://api.openai.com/v1/models')return Response.json({models:[{slug:'gpt-6.1-sol',display_name:'Offline QA · Sol',visibility:'list'}]});
  if(url==='https://auth.openai.com/api/accounts/oauth/revoke')return new Response('',{status:200});
  throw new Error('Offline UI fixture blocked unexpected network');
};
const app=createApp({dataDir:mkdtempSync(join(tmpdir(),'订阅界面 QA ')),password:'ui-offline-password',schedule:false,chatgpt:{fetch:fetcher}});
await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;const oldOrigin=config.origin;config.origin=base;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});const errors:string[]=[];
try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.route('https://auth.openai.com/**',async(route:any)=>{authorization=new URL(route.request().url());await route.fulfill({status:200,contentType:'text/html',body:'<html><body>Offline UI authorization fixture. No real account or model.</body></html>'});});
  context.on('page',(p:any)=>p.on('pageerror',(e:Error)=>errors.push(e.message)));
  const page=await context.newPage();await page.goto(base);await page.getByLabel('工作台密码').fill('ui-offline-password');await page.getByRole('button',{name:/进入工作台/}).click();await page.locator('.nav-item').filter({hasText:'设置'}).click();await page.getByRole('heading',{name:'用你的 ChatGPT 额度'}).waitFor();await page.getByRole('button',{name:'收起输入'}).click();
  await page.screenshot({path:join(target,'chatgpt-desktop.png'),fullPage:true});
  const popupPromise=context.waitForEvent('page');await page.getByRole('button',{name:'Continue with ChatGPT',exact:true}).click();const popup=await popupPromise;await popup.waitForURL('https://auth.openai.com/**');await popup.getByText('Offline UI authorization fixture. No real account or model.').waitFor();
  await page.getByRole('button',{name:'取消登录',exact:true}).waitFor();await page.getByRole('button',{name:'取消登录',exact:true}).click();await page.getByRole('button',{name:'Continue with ChatGPT',exact:true}).waitFor();assert.equal(app.chatgpt.status().connected,false);await popup.close();report.cancelBeforeAuthorization=true;
  const nextPopup=context.waitForEvent('page');await page.getByRole('button',{name:'Continue with ChatGPT',exact:true}).click();const authorized=await nextPopup;await authorized.waitForURL('https://auth.openai.com/**');await authorized.getByText('Offline UI authorization fixture. No real account or model.').waitFor();
  const callback=new URL(authorization.searchParams.get('redirect_uri')!);callback.search=new URLSearchParams({code:'ui-offline-code',state:authorization.searchParams.get('state')!,client_id:'oaiapp-ui-offline'}).toString();await authorized.goto(callback.toString());
  await page.getByRole('dialog',{name:'正在使用你的 ChatGPT 额度'}).waitFor();assert.equal(app.chatgpt.ready(),true);assert.equal(app.chatgpt.status().limitsMode,'automatic');report.signInAutomaticallyPreparesModel=true;
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(target,'chatgpt-mobile-options.png'),fullPage:true});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);report.mobileOptionsNoHorizontalOverflow=true;
  await page.getByRole('button',{name:'知道了，开始使用',exact:true}).click();await page.getByRole('dialog',{name:'正在使用你的 ChatGPT 额度'}).waitFor({state:'hidden'});
  assert.equal(await page.getByRole('checkbox').count(),0);assert.equal(await page.getByRole('button',{name:'选择模型与自定义限制',exact:true}).isVisible(),false);report.noMandatoryConfiguration=true;
  await page.getByText('高级设置（可选）',{exact:true}).click();await page.getByRole('button',{name:'选择模型与自定义限制',exact:true}).click();await page.getByLabel('ChatGPT模型').waitFor();await page.getByLabel('ChatGPT调用上限').fill('10');await page.getByLabel('ChatGPT超时秒数').fill('120');await page.getByRole('button',{name:'保存自定义设置',exact:true}).click();await page.getByText('自定义剩余调用上限',{exact:true}).first().waitFor();assert.equal(app.chatgpt.status().limitsMode,'custom');assert.equal(app.snapshot().config.budgetUsd,0);assert.equal(await page.getByText('API费用预算',{exact:true}).count(),0);report.optionalCustomLimitsAndSeparateUsage=true;
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:join(target,'chatgpt-desktop-connected.png'),fullPage:true});await page.reload();await page.locator('.nav-item').filter({hasText:'设置'}).click();await page.getByRole('button',{name:'断开 ChatGPT',exact:true}).waitFor();assert.equal(app.chatgpt.ready(),true);assert.equal(await page.getByRole('dialog',{name:'正在使用你的 ChatGPT 额度'}).count(),0);report.refreshPreservesConnection=true;report.welcomeShownOnce=true;
  await page.getByRole('button',{name:'断开 ChatGPT',exact:true}).click();await page.getByRole('button',{name:'Continue with ChatGPT',exact:true}).waitFor();assert.equal(app.chatgpt.ready(),false);assert.equal(app.snapshot().config.authMode,'chatgpt');report.disconnectDoesNotEnableApiFallback=true;
  assert.equal(errors.length,0);assert.equal(app.store.list('run').length,0);report.browserErrors=errors;report.engineeringBaseline=JSON.parse(readFileSync('output/dev-evidence/verification/report.json','utf8')).baseline;report.status='passed';save();console.log('Subscription browser flow: passed (offline authorization fixture, no model/account usage)');
}catch(e){report.status='failed';report.error=e instanceof Error?e.message:'UI check failed';report.browserErrors=errors;save();throw e;}
finally{await browser.close();await app.close();config.origin=oldOrigin;}
