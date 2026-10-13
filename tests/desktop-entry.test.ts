import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
const shell=join(process.env.SystemRoot!,'System32/WindowsPowerShell/v1.0/powershell.exe');
const safeEnv=()=>Object.fromEntries(['SystemRoot','SystemDrive','WINDIR','ComSpec','PATHEXT','USERPROFILE','TEMP','TMP','PATH','APPDATA','LOCALAPPDATA','HOME','LANG','TZ'].flatMap(k=>process.env[k]===undefined?[]:[[k,process.env[k]!]]));
const invoke=(exe:string,args:string[],env:NodeJS.ProcessEnv,json=true)=>new Promise<any>((done,reject)=>{const child=spawn(exe,args,{env,windowsHide:true,stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',v=>out+=String(v));child.stderr.on('data',v=>err+=String(v));child.once('error',reject);child.once('exit',code=>{if(code!==0)reject(new Error('Owned desktop command failed: '+err.slice(-2000)));else try{done(json?JSON.parse(out.trim()):out);}catch(error){reject(error);}});});
const command=(file:string,args:string[],env:NodeJS.ProcessEnv)=>invoke(shell,['-NoProfile','-ExecutionPolicy','Bypass','-File',resolve(file),...args],env);
const tokens=(args:string)=>args.match(/"[^"]*"|\S+/g)!.map(s=>s.startsWith('"')?s.slice(1,-1):s);

test('owned Windows shortcuts launch hidden supervision and reuse the same ready service for one-click opening',{skip:process.platform!=='win32',timeout:60000},async()=>{
  const name='entry-'+randomUUID().replaceAll('-',''),root=mkdtempSync(join(tmpdir(),'桌面 启动 ')),shortcut=join(root,'入口'),startup=join(root,'启动'),data=join(root,'data');mkdirSync(shortcut);mkdirSync(startup);
  const listener=createServer();await new Promise<void>(done=>listener.listen(0,'127.0.0.1',done));const port=(listener.address() as {port:number}).port;await new Promise<void>(done=>listener.close(()=>done()));const base=`http://127.0.0.1:${port}`;
  const env={...safeEnv(),WORKBENCH_PASSWORD:'owned-desktop-fixture',PI_API_KEY:'',PI_MODEL:'',PI_MAX_CALLS:'0',PI_BUDGET_USD:'0',BACKUP_DIR:join(root,'backup'),WORKBENCH_PROXY_MODE:'direct'};
  const args=['-Name',name,'-Port',String(port),'-DataDir',data,'-Origin',base],entryArgs=['-ShortcutDir',shortcut,'-StartupDir',startup,...args];
  try {
    const created=await command('scripts/desktop-entry.ps1',['-Action','create',...entryArgs],env);assert.equal(created.startupConfigured,true);assert(created.entries.every((e:any)=>e.owned&&e.windowStyle===7));assert(existsSync(join(shortcut,'打开工作台.lnk')));
    const auto=created.entries.find((e:any)=>e.kind==='startup');assert.equal(auto.target.toLowerCase(),shell.toLowerCase());
    assert(auto.arguments.includes(data),'UTF-8 management receipt must preserve actual Chinese data path');
    const first=await invoke(auto.target,tokens(auto.arguments),env);assert.equal(first.state,'ready');
    const open=created.entries.find((e:any)=>e.kind==='open');const opened=await invoke(open.target,[...tokens(open.arguments),'-NoBrowser'],env);assert.equal(opened.state,'ready');assert.equal(opened.browserRequested,false);assert.equal(opened.servicePid,first.servicePid);assert.equal(opened.url,base);
    const health=await(await fetch(base+'/api/health')).json();assert.equal(health.ready,true);assert.equal(health.pid,first.servicePid);assert(existsSync(join(data,'workbench.sqlite')),'stored command must launch into the actual configured data directory');
    const again=await command('scripts/desktop-entry.ps1',['-Action','create',...entryArgs],env);assert(again.entries.every((e:any)=>e.owned));assert.deepEqual(again.entries.map((e:any)=>e.path),created.entries.map((e:any)=>e.path));
  } finally {
    try { if(existsSync(resolve('.runtime',`supervisor-${name}.json`)))await command('scripts/supervise-service.ps1',['-Action','stop',...args],env); }
    finally { try { if(existsSync(resolve('.runtime',`local-service-${name}.json`)))await command('scripts/local-service.ps1',['-Action','stop',...args],env); }
      finally { await command('scripts/desktop-entry.ps1',['-Action','remove',...entryArgs],env); } }
  }
});

test('desktop entry refuses to overwrite or remove a foreign shortcut and preserves both destination files',{skip:process.platform!=='win32',timeout:30000},async()=>{
  const root=mkdtempSync(join(tmpdir(),'入口 归属 ')),shortcut=join(root,'入口'),startup=join(root,'启动');mkdirSync(shortcut);mkdirSync(startup);const env=safeEnv(),args=['-ShortcutDir',shortcut,'-StartupDir',startup,'-Name','ownership-fixture'];
  const created=await command('scripts/desktop-entry.ps1',['-Action','create',...args],env),open=created.entries.find((e:any)=>e.kind==='open'),auto=created.entries.find((e:any)=>e.kind==='startup'),owned=readFileSync(open.path),autoBytes=readFileSync(auto.path);
  const source=`$s=New-Object -ComObject WScript.Shell;$l=$s.CreateShortcut('${open.path.replaceAll("'","''")}');$l.Description='another application';$l.Save()`;
  try {
    await invoke(shell,['-NoProfile','-EncodedCommand',Buffer.from(source,'utf16le').toString('base64')],env,false);const foreign=readFileSync(open.path);
    for(const action of ['create','remove']){await assert.rejects(command('scripts/desktop-entry.ps1',['-Action',action,...args],env),/ownership mismatch/);assert.deepEqual(readFileSync(open.path),foreign);assert.deepEqual(readFileSync(auto.path),autoBytes);}
    const status=await command('scripts/desktop-entry.ps1',['-Action','status',...args],env);assert.equal(status.entries.find((e:any)=>e.kind==='open').owned,false);assert.equal(status.startupConfigured,true);
  } finally {writeFileSync(open.path,owned);const removed=await command('scripts/desktop-entry.ps1',['-Action','remove',...args],env);assert(removed.entries.every((e:any)=>!e.exists));}
});
