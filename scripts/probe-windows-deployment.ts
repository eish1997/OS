// Full copied deployment in Chinese/space paths. No primary config import or
// credential discovery; owned synthetic data and fixed, installed code only.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { cpSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import type { Asset, Draft, Run, SessionBinding, Snapshot } from '../shared/contracts.js';

const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const pause = (ms: number) => new Promise<void>(done => setTimeout(done, ms));
const safeEnv = () => Object.fromEntries(['SystemRoot','SystemDrive','WINDIR','ComSpec','PATHEXT','USERPROFILE','TEMP','TMP','PATH','APPDATA','LOCALAPPDATA','HOME','LANG','TZ'].flatMap(key => process.env[key] === undefined ? [] : [[key,process.env[key]!]]));

// These branches execute from the copied repository with its own environment.
if (process.argv[2] === '--seed-native' || process.argv[2] === '--inspect-native') {
  const { Store } = await import('../server/store.js');
  const { loadPi } = await import('../server/pi-adapter.js');
  const data = resolve(process.env.DATA_DIR!); assert(data.includes(' 数据'));
  const store = new Store(join(data,'workbench.sqlite'));
  try {
    const pi = await loadPi();
    if (process.argv[2] === '--seed-native') {
      const { Assets } = await import('../server/assets.js'); const { Service } = await import('../server/service.js');
      const service = new Service(store,new Assets(store,data,500*1024**2));
      const project = service.createProject('中文部署 · 原生会话验证'); const cwd = join(data,'workspaces',project.id); mkdirSync(cwd,{recursive:true});
      const manager = pi.SessionManager.create(cwd,join(data,'sessions',project.id)); manager.appendMessage({role:'user',content:'固定离线原生会话：中文路径和空格，零模型请求。',timestamp:Date.now()});
      let run = service.submit(project.id,'离线会话归档',randomUUID(),'pi',{version:1,projectId:project.id,toolNames:['write_asset'],allowModel:false,maxCalls:0,maxCostUsd:0,reservePerCallUsd:0,maxOutputTokens:10,timeoutMs:60000}).run;
      service.transition(run.id,'running'); run = store.get<Run>('run',run.id);
      store.update<Run>('run',run.id,run.revision,{sessionId:manager.getSessionId(),sessionPath:manager.getSessionFile()!}); service.transition(run.id,'completed');
      store.create<SessionBinding>('session_binding',{id:'session:'+run.id,projectId:project.id,runId:run.id,taskId:run.taskId,sessionId:manager.getSessionId(),sessionPath:manager.getSessionFile()!,cwd,piVersion:'1.0.3',policyVersion:1,model:'',authKind:'api'});
      writeFileSync(process.env.WB_SEED_REPORT!,JSON.stringify({runId:run.id,sessionId:manager.getSessionId(),sessionHash:sha(readFileSync(manager.getSessionFile()!)),projectId:project.id}));
    } else {
      const seed = JSON.parse(readFileSync(process.env.WB_SEED_REPORT!,'utf8'));
      const binding = store.get<SessionBinding>('session_binding','session:'+seed.runId); assert(binding.sessionPath.startsWith(data)); assert(binding.cwd.startsWith(data));
      const opened = pi.SessionManager.open(binding.sessionPath,undefined,binding.cwd); assert.equal(opened.getSessionId(),seed.sessionId); assert.equal(opened.buildSessionContext().messages.length,1); assert.equal(sha(readFileSync(binding.sessionPath)),seed.sessionHash);
      assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM sessions').get()!.n,0); assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM node_tokens').get()!.n,0);
      assert(!existsSync(join(data,'credentials.json'))); assert(!existsSync(join(data,'private-model','chatgpt.json')));
      console.log('Restored native binding, bytes and credential exclusion passed');
    }
  } finally {store.close();}
} else {
  assert.equal(process.platform,'win32'); const originRoot = resolve('.'); const id = randomUUID();
  const root = resolve('output/dev-evidence/private/win-'+id); const workspace = join(root,'中文 工作台'); const data = join(root,'项目 数据'); const restored = join(root,'恢复 数据'); const nodeDirectory = join(root,'电脑 节点');
  const backupRoot = join(process.env.USERPROFILE!,'AI-OS-Backups','windows-probes',id,'备份 空间'); const manual = join(backupRoot,'手动 副本'); const seedFile = join(root,'native-seed.json');
  const output = resolve('output/dev-evidence/windows-deployment.json'); mkdirSync(join(originRoot,'output/dev-evidence'),{recursive:true});
  if(existsSync(output)){const history=resolve('output/dev-evidence/windows-history');mkdirSync(history,{recursive:true});copyFileSync(output,join(history,Date.now()+'.json'));}
  const report:Record<string,unknown> = {status:'running',at:new Date().toISOString(),modelRequests:0,workspace,data,restored,backupRoot,nodeDirectory,scope:'Full code and installed dependency copy, actual PowerShell build/start/stop/restart, fixture worker/node CLI, daily backup and manual clean restore; primary product untouched',previousGoalTurn:'no progress; revalidated current files and selected available Windows deployment gate'};
  const save = () => writeFileSync(output,JSON.stringify(report,null,2)); const step = (name:string) => {report.step=name;save();console.log('Windows deployment: '+name);}; save();
  const shell = join(process.env.SystemRoot!,'System32','WindowsPowerShell','v1.0','powershell.exe');
  let nodeChild:ChildProcess|undefined; let browser:any; const running = new Set<string>(); const serviceData = new Map<string,{port:number;data:string;url:string}>();
  const password = randomUUID(); let cookie=''; let restoreCookie=''; let sourceUrl=''; let restoreUrl='';
  async function command(executable:string,args:string[],env:NodeJS.ProcessEnv={},cwd=workspace) {
    const child=spawn(executable,args,{cwd,env:{...safeEnv(),...env},windowsHide:true,stdio:['ignore','pipe','pipe']});
    let stdout='';let stderr='';child.stdout!.on('data',chunk=>stdout+=String(chunk));child.stderr!.on('data',chunk=>stderr+=String(chunk));
    const exit=await new Promise<number|null>((done,reject)=>{child.once('error',reject);child.once('exit',done);});
    // These commands are bounded internally or small fixed builds. Never restart
    // because observation expires; elapsed time is evidence, not a kill trigger.
    if(exit!==0){writeFileSync(join(root,'command-failure.log'),(stdout+'\n'+stderr).replaceAll(password,'[redacted]'));throw new Error('Owned deployment command failed; private diagnostic retained: '+args.find(a=>a.endsWith('.ps1')||a.endsWith('.ts')));}
    return stdout.trim();
  }
  async function powershell(script:string,env:NodeJS.ProcessEnv={},cwd=workspace) {
    const utf8="$OutputEncoding=[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $ErrorActionPreference='Stop'; ";
    return command(shell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(utf8+script,'utf16le').toString('base64')],env,cwd);
  }
  async function service(action:string,name:string) {
    const entry=serviceData.get(name)!;
    const raw=await powershell("& $env:WB_MANAGER -Action $env:WB_ACTION -Name $env:WB_NAME -Port ([int]$env:WB_PORT) -DataDir $env:WB_DATA -Origin $env:WB_ORIGIN; exit $LASTEXITCODE",{WB_MANAGER:join(workspace,'scripts','local-service.ps1'),WB_ACTION:action,WB_NAME:name,WB_PORT:String(entry.port),WB_DATA:entry.data,WB_ORIGIN:entry.url});
    const value=JSON.parse(raw.replace(/^\uFEFF/,'')); if(action==='start')running.add(name);if(action==='stop')running.delete(name);return value;
  }
  async function port(){for(let attempt=0;attempt<8;attempt++){const server=createServer();await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const value=(server.address() as {port:number}).port;await new Promise<void>((done,reject)=>server.close(error=>error?reject(error):done()));if(value!==4310&&![6000,6665,6666,6667,6668,6669,6697,10080].includes(value))return value;}throw new Error('No isolated test port');}
  const headers = (url:string,auth:string) => ({Connection:'close',Cookie:auth,Origin:url,'Content-Type':'application/json'});
  async function api<T>(path:string,body?:unknown,url=sourceUrl,auth=cookie,method=body===undefined?'GET':'POST'):Promise<T>{const response=await fetch(url+'/api'+path,{headers:headers(url,auth),method,...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});assert(response.ok,`Owned API ${path}: HTTP ${response.status}`);return response.json() as Promise<T>;}
  async function login(url:string){const response=await fetch(url+'/api/login',{method:'POST',headers:headers(url,''),body:JSON.stringify({password})});assert.equal(response.status,200);return response.headers.get('set-cookie')!.split(';')[0];}
  async function bytes(path:string,url=sourceUrl,auth=cookie){const response=await fetch(url+'/api'+path,{headers:headers(url,auth)});assert.equal(response.status,200);return Buffer.from(await response.arrayBuffer());}
  async function waitRun(runId:string){const deadline=Date.now()+30000;while(Date.now()<deadline){const run=(await api<Snapshot>('/snapshot')).runs.find(r=>r.id===runId)!;assert(run);if(run.status==='completed'){assert.equal(run.calls,0);return run;}assert(['queued','running'].includes(run.status),'Owned task failed: '+run.status);await pause(50);}throw new Error('Owned task observation timed out; retain original run');}
  function tree(path:string):{files:number;bytes:number;hash:string}{const entries:{path:string;hash:string;size:number}[]=[];const walk=(folder:string)=>{for(const name of readdirSync(folder).sort()){const full=join(folder,name);const stat=lstatSync(full);assert(!stat.isSymbolicLink(),'Fixed deployment copy excludes links');if(stat.isDirectory())walk(full);else{assert(stat.isFile());const value=readFileSync(full);entries.push({path:relative(path,full).replaceAll('\\','/'),hash:sha(value),size:value.length});}}};walk(path);return {files:entries.length,bytes:entries.reduce((n,e)=>n+e.size,0),hash:sha(JSON.stringify(entries))};}
  try {
    step('primary-identity-and-isolation'); const primary=await fetch('http://127.0.0.1:4310/api/health',{headers:{Connection:'close'}});assert.equal(primary.status,200);const primaryBefore=await primary.json();report.primaryBefore=primaryBefore;
    assert.equal(root[0].toUpperCase(),'E');assert.equal(backupRoot[0].toUpperCase(),'C');mkdirSync(workspace,{recursive:true});
    step('copy-code-and-full-installed-dependencies');
    const folders=['server','shared','src','scripts','tests','doc'];const files=['package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html'];
    for(const folder of [...folders,'node_modules']){const expected=tree(join(originRoot,folder));cpSync(join(originRoot,folder),join(workspace,folder),{recursive:true,errorOnExist:true,force:false});assert.deepEqual(tree(join(workspace,folder)),expected);if(folder==='node_modules')report.dependencyCopy=expected;}
    for(const file of files){copyFileSync(join(originRoot,file),join(workspace,file));assert.equal(sha(readFileSync(join(workspace,file))),sha(readFileSync(join(originRoot,file))));}
    for(const name of ['.env','data','.runtime','.git','output'])assert(!existsSync(join(workspace,name)),'Primary private files excluded');
    report.codeFilesCopied=folders;report.credentialAndDataCopyExcluded=true;
    const sourcePort=await port();let restorePort=await port();while(restorePort===sourcePort)restorePort=await port();sourceUrl=`http://127.0.0.1:${sourcePort}`;restoreUrl=`http://127.0.0.1:${restorePort}`;
    serviceData.set('unicode',{port:sourcePort,data,url:sourceUrl});serviceData.set('restored',{port:restorePort,data:restored,url:restoreUrl});
    writeFileSync(join(workspace,'.env'),[`WORKBENCH_PASSWORD=${password}`,`DATA_DIR=${data}`,`PUBLIC_ORIGIN=${sourceUrl}`,`PORT=${sourcePort}`,`BACKUP_DIR=${backupRoot}`,'PI_MAX_CALLS=0','WORKBENCH_PROXY_MODE=direct',''].join('\r\n'));
    step('copied-powershell-build-and-offline-sdk');
    await powershell("& $env:WB_RUN -Action build; exit $LASTEXITCODE",{WB_RUN:join(workspace,'scripts','run.ps1')});assert(existsSync(join(workspace,'dist','index.html')),'Copied build must actually emit the frontend');
    await powershell("& $env:WB_RUN -Action probe; exit $LASTEXITCODE",{WB_RUN:join(workspace,'scripts','run.ps1')});assert.equal(JSON.parse(readFileSync(join(workspace,'output','dev-evidence','pi-offline-probe.json'),'utf8')).realModelCall,false);report.copiedBuildAndOfflinePi=true;
    await command(process.execPath,['--import','tsx','scripts/probe-windows-deployment.ts','--seed-native'],{DATA_DIR:data,WB_SEED_REPORT:seedFile});report.nativeSeed=JSON.parse(readFileSync(seedFile,'utf8'));
    step('managed-start-reuse-and-actual-http'); const started=await service('start','unicode');const reuse=await service('start','unicode');assert.equal(reuse.pid,started.pid);assert.equal(reuse.alreadyRunning,true);assert.equal((await service('status','unicode')).state,'ready');report.firstService=started;
    cookie=await login(sourceUrl);assert.equal((await api<Snapshot>('/snapshot')).config.modelConfigured,false);assert.equal((await api<{connected:boolean}>('/chatgpt/status')).connected,false);
    const project=await api<{id:string}>('/projects',{name:'中文部署 · 资料到文章',description:'自己的合成资料；零模型请求'});report.projectId=project.id;
    async function upload(text:string,parent?:Asset){const upload=await api<{id:string}>('/uploads',{projectId:project.id,name:'研究 资料.md',mime:'text/markdown',...(parent?{parentVersionId:parent.id}:{})});const value=Buffer.from(text);const response=await fetch(sourceUrl+'/api/uploads/'+upload.id,{method:'PUT',headers:{...headers(sourceUrl,cookie),'Content-Type':'application/octet-stream','X-Content-Hash':sha(value)},body:value});assert.equal(response.status,200);const asset=await response.json() as Asset;assert.equal(asset.hash,sha(value));assert.deepEqual(await bytes('/assets/'+asset.id),value);return asset;}
    const first=await upload('# 原始资料\n\n数据：12、18、9、21。\n');const second=await upload('# 原始资料 · 第二版\n\n合计60，平均15。\n',first);assert.equal(second.parentVersionId,first.id);assert.equal(second.version,2);
    const draft=await api<Draft>('/drafts',{projectId:project.id,title:'我的 中文文章',body:'中文和空格部署验证；固定资料合计60，平均15。',sourceIds:[second.id]});let draftBytes=await bytes('/drafts/'+draft.id+'/export');assert(draftBytes.includes(Buffer.from(second.hash)));assert(draftBytes.includes(Buffer.from(second.id)));
    const accepted=await api<{run:Run}>('/tasks',{projectId:project.id,mode:'fixture',commandId:randomUUID(),goal:'运行固定资料计算，保存报告、图表和文章草稿',assetIds:[second.id]});const run=await waitRun(accepted.run.id);assert.equal(run.resultAssetIds.length,2);report.fixtureRun=run.id;
    step('actual-copied-local-node-cli'); const paired=await api<{node:{id:string};token:string}>('/nodes',{name:'中文路径 电脑节点',projectIds:[project.id]});
    nodeChild=spawn(process.execPath,['--import','tsx','scripts/local-node.ts'],{cwd:workspace,env:{...safeEnv(),NODE_SERVER:sourceUrl,NODE_ID:paired.node.id,NODE_TOKEN:paired.token,NODE_ALLOWED_DIR:nodeDirectory},windowsHide:true,stdio:'ignore'});let nodeExited=false;const nodeExit=new Promise<void>(done=>nodeChild!.once('exit',()=>{nodeExited=true;done();}));
    const nodeTask=await api<{run:Run}>('/tasks',{projectId:project.id,mode:'node',nodeId:paired.node.id,commandId:randomUUID(),goal:'验证中文空格目录内可信文件'});const nodeRun=await waitRun(nodeTask.run.id);assert.equal(nodeRun.resultAssetIds.length,1);const nodeContent=readFileSync(join(nodeDirectory,nodeRun.id+'.md'));assert.deepEqual(await bytes('/assets/'+nodeRun.resultAssetIds[0]),nodeContent);
    await api('/nodes/revoke',{id:paired.node.id});if(!nodeExited)nodeChild.kill();await nodeExit;nodeChild=undefined;report.localNode={runId:nodeRun.id,resultMatchedBytes:true,ownedProcessExited:true};
    step('desktop-and-mobile-browser');
    const require=createRequire(import.meta.url);const {chromium}=require(process.env.PLAYWRIGHT_PACKAGE||join(process.env.USERPROFILE!,'.cache','codex-runtimes','codex-primary-runtime','dependencies','node','node_modules','playwright'));
    browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addCookies([{name:'wb_session',value:cookie.slice('wb_session='.length),url:sourceUrl,httpOnly:true,sameSite:'Strict'}]);const page=await context.newPage();const errors:string[]=[];page.on('pageerror',(e:Error)=>errors.push(e.message));await page.goto(sourceUrl);await page.getByRole('heading',{name:'你的工作室',exact:true}).waitFor();
    mkdirSync(resolve('output/dev-evidence/ui'),{recursive:true});await page.screenshot({path:resolve('output/dev-evidence/ui/windows-deployment-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:resolve('output/dev-evidence/ui/windows-deployment-mobile.png'),fullPage:true});assert.equal(errors.length,0);await browser.close();browser=undefined;report.chromeDesktopAnd390Mobile={pageErrors:errors.length,noHorizontalOverflow:true};
    step('normal-restart-and-session-persistence');const beforeRestart=await api<Snapshot>('/snapshot');await service('stop','unicode');const restarted=await service('start','unicode');assert.notEqual(restarted.instanceId,started.instanceId);assert.equal((await api<Snapshot>('/snapshot')).assets.length,beforeRestart.assets.length);assert.deepEqual(await bytes('/drafts/'+draft.id+'/export'),draftBytes);report.restartPreservedOwnLoginAndDraft=true;
    const afterTask=await api<{run:Run}>('/tasks',{projectId:project.id,mode:'fixture',commandId:randomUUID(),goal:'运行固定资料计算，保存报告、图表和文章草稿'});await waitRun(afterTask.run.id);report.fixtureAfterRestart=afterTask.run.id;
    step('actual-daily-backup-under-unicode-path');let backupStatus:any;const deadline=Date.now()+70000;
    while(Date.now()<deadline){backupStatus=await api('/backup/status');assert.equal(backupStatus.enabled,true,'Actual C/E location validation');assert(!backupStatus.error,'Scheduled backup failed');if(backupStatus.lastSuccessAt&&backupStatus.restoreCheckedAt&&!backupStatus.running)break;await pause(100);}
    assert(backupStatus.lastSuccessAt&&backupStatus.restoreCheckedAt&&!backupStatus.running);assert.equal(backupStatus.intervalHours,24);report.scheduledBackup=backupStatus;
    const automatic=join(backupRoot,'automatic');const points=readdirSync(automatic).filter(n=>n.startsWith('snapshot-')&&existsSync(join(automatic,n,'receipt.json')));assert(points.length>=1);const manifest=JSON.parse(readFileSync(join(automatic,points[0],'manifest.json'),'utf8'));assert(manifest.files.some((f:any)=>String(f.path).endsWith('.jsonl')));report.scheduledBackupIncludesCompletedNative=true;
    step('stopped-manual-backup-and-clean-restore-cli');const expected=await api<Snapshot>('/snapshot');const assetBytes=new Map<string,Buffer>();for(const asset of expected.assets)assetBytes.set(asset.id,await bytes('/assets/'+asset.id));const draftExports=new Map<string,Buffer>();for(const value of expected.drafts)draftExports.set(value.id,await bytes('/drafts/'+value.id+'/export'));
    await api('/logout',{});cookie='';await service('stop','unicode');await command(process.execPath,['--import','tsx','scripts/backup.ts','create',manual]);await command(process.execPath,['--import','tsx','scripts/backup.ts','restore',manual,restored]);
    await command(process.execPath,['--import','tsx','scripts/probe-windows-deployment.ts','--inspect-native'],{DATA_DIR:restored,WB_SEED_REPORT:seedFile});report.nativeRestoreAndCredentialExclusion=true;
    step('restored-managed-service-and-all-http-bytes');await service('start','restored');assert.equal((await fetch(restoreUrl+'/api/snapshot',{headers:headers(restoreUrl,cookie)})).status,401);restoreCookie=await login(restoreUrl);const actual=await api<Snapshot>('/snapshot',undefined,restoreUrl,restoreCookie);
    for(const field of ['projects','assets','tasks','runs','drafts','memories','summaries','nodes'] as const)assert.equal(actual[field].length,expected[field].length,'Restored entity count '+field);
    for(const asset of actual.assets){assert.deepEqual(assetBytes.get(asset.id),await bytes('/assets/'+asset.id,restoreUrl,restoreCookie));assert.equal(sha(assetBytes.get(asset.id)!),asset.hash);}
    for(const value of actual.drafts)assert.deepEqual(draftExports.get(value.id),await bytes('/drafts/'+value.id+'/export',restoreUrl,restoreCookie));
    assert.equal(actual.config.modelConfigured,false);assert.equal((await api<{connected:boolean}>('/chatgpt/status',undefined,restoreUrl,restoreCookie)).connected,false);report.restoredHttp={assetsCompared:actual.assets.length,draftsCompared:actual.drafts.length,versionsPreserved:true,newLoginRequired:true};
    await api('/logout',{},restoreUrl,restoreCookie);restoreCookie='';await service('stop','restored');assert.equal((await service('status','unicode')).state,'stopped');assert.equal((await service('status','restored')).state,'stopped');report.ownedServicesStopped=true;
    const primaryAfter=await (await fetch('http://127.0.0.1:4310/api/health',{headers:{Connection:'close'}})).json();assert.deepEqual(primaryAfter,primaryBefore);report.primaryAfter=primaryAfter;report.primaryIdentityUnchanged=true;
    report.status='passed';report.at=new Date().toISOString();report.remaining=['Actual different-network phone','Production supervised startup and sleep/wake','Full mixed capacity and startup scanning','Filesystem hard quota and WAL growth','Offsite/independent-machine restore','Tencent real comparison and user feedback','M1 parallel agents and upgrades'];save();console.log('Windows deployment passed; zero model requests');
  } catch(error){report.status='failed';report.reason=error instanceof Error?error.message:'Owned Windows deployment failed';save();throw error;}
  finally{
    if(browser)await browser.close();if(nodeChild){const child=nodeChild;const exit=new Promise<void>(done=>child.once('exit',()=>done()));if(child.exitCode===null){child.kill();await exit;}}
    if(cookie)try{await api('/logout',{});}catch{}if(restoreCookie)try{await api('/logout',{},restoreUrl,restoreCookie);}catch{}
    for(const name of [...running])try{await service('stop',name);}catch{report.cleanupNeedsInspection=true;save();}
  }
}
