import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync,writeFileSync,readFileSync,readdirSync,existsSync,copyFileSync } from 'node:fs';
import { resolve,join } from 'node:path';
import { createRequire } from 'node:module';
import { createApp } from '../server/app.js';
import { restore,verifyBackup } from '../server/backup.js';
import type { Run } from '../shared/contracts.js';
import { config } from '../server/config.js';
if(existsSync('output/dev-evidence/automatic-backup.json')){mkdirSync('output/dev-evidence/automatic-backup-history',{recursive:true});copyFileSync('output/dev-evidence/automatic-backup.json',`output/dev-evidence/automatic-backup-history/${Date.now()}.json`);}
const id=randomUUID();const source=resolve('output/dev-evidence/private/automatic-'+id);const root=join(process.env.USERPROFILE!,'AI-OS-Backups','automation-probes',id);
assert.equal(process.platform,'win32');assert.equal(source[0].toUpperCase(),'E');assert.equal(root[0].toUpperCase(),'C');
let clock=Date.now();const report:Record<string,unknown>={status:'running',at:new Date().toISOString(),modelRequests:0,scope:'Isolated synthetic source on E and owned backup root on C; real timer; controlled clock advances daily due times for retention; production data unchanged'};
const save=()=>writeFileSync('output/dev-evidence/automatic-backup.json',JSON.stringify(report,null,2));mkdirSync('output/dev-evidence',{recursive:true});save();
const password=randomUUID();const app=createApp({dataDir:source,password,schedule:true,backup:{root,retainCount:2,pollMs:25,now:()=>clock}});
await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;const oldOrigin=config.origin;config.origin=base;let browser:any;
const until=async(condition:()=>boolean)=>{const deadline=Date.now()+20000;while(!condition()&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,25));assert(condition(),JSON.stringify(app.automaticBackup.status()));};
try{
  assert(app.automaticBackup.status().enabled,'Actual physical-disk discovery must pass; no injected location validator');
  mkdirSync(join(root,'manual'));writeFileSync(join(root,'manual','keep'),'manual-backup-placeholder');
  const project=app.service.createProject('自动备份验证');app.assets.write(project.id,'source.md','text/markdown','automatic-backup-fixture');
  const run=app.service.submit(project.id,'运行固定资料计算，保存报告、图表和文章草稿','fixture-'+id,'fixture',{version:1,projectId:project.id,toolNames:['write_asset','create_draft'],allowModel:false,maxCalls:0,maxCostUsd:0,reservePerCallUsd:0,maxOutputTokens:10,timeoutMs:60000}).run;
  app.scheduler.tick();assert.equal(app.store.get<Run>('run',run.id).status,'running');await app.automaticBackup.tick();assert(app.automaticBackup.status().waitingForIdle);assert.equal(app.automaticBackup.status().lastSuccessAt,undefined);report.realWorkerNotInterrupted=true;
  await until(()=>app.store.get<Run>('run',run.id).status==='completed'&&Boolean(app.automaticBackup.status().lastSuccessAt));
  assert.equal(app.store.get<Run>('run',run.id).calls,0);report.firstScheduledRecoveryCheck=true;
  clock+=86400001;await until(()=>app.automaticBackup.status().retained===2);clock+=86400001;await until(()=>app.automaticBackup.status().pruned===1);await app.automaticBackup.stop();
  const status=app.automaticBackup.status();assert.equal(status.retained,2);assert.equal(status.error,undefined);assert(existsSync(join(root,'manual','keep')));
  const points=readdirSync(join(root,'automatic')).filter(name=>name.startsWith('snapshot-'));assert.equal(points.length,2);for(const name of points)verifyBackup(join(root,'automatic',name));
  const recovered=join(root,'external-restore-check');restore(join(root,'automatic',points[0]),recovered);assert.equal(readFileSync(join(recovered,'assets',app.snapshot().assets[0].locator),'utf8'),'automatic-backup-fixture');
  report.root=root;report.source=source;report.statusAfterScheduledPruning=status;report.verifiedRecoveryPoints=points.length;report.manualBackupPreserved=true;report.extraCleanRestore=true;
  if(process.env.PLAYWRIGHT_PACKAGE&&process.env.CHROME_PATH){
    const require=createRequire(import.meta.url);const {chromium}=require(process.env.PLAYWRIGHT_PACKAGE);browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors:string[]=[];page.on('pageerror',(error:Error)=>errors.push(error.message));
    await page.goto(base);await page.getByLabel('工作台密码').fill(password);await page.getByRole('button',{name:/进入工作台/}).click();await page.locator('.nav-item').filter({hasText:'设置'}).click();await page.getByRole('heading',{name:'自动备份',exact:true}).waitFor();await page.getByText('已启用 · 空闲时维护',{exact:true}).waitFor();await page.getByRole('button',{name:'刷新备份状态'}).click();
    mkdirSync('output/dev-evidence/ui',{recursive:true});await page.screenshot({path:'output/dev-evidence/ui/automatic-backup-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:'output/dev-evidence/ui/automatic-backup-mobile.png',fullPage:true});assert.equal(errors.length,0);report.chromeDesktopAnd390Mobile=true;report.pageErrors=errors.length;
    await page.context().request.post(base+'/api/logout',{data:{}});await browser.close();browser=undefined;
  }
  report.status='passed';report.at=new Date().toISOString();save();console.log(JSON.stringify(report));
}catch(error){report.status='failed';report.reason=error instanceof Error?error.message:'Automatic backup check failed';save();throw error;}
finally{if(browser)await browser.close();await app.close();config.origin=oldOrigin;}
