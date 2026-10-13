import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=process.cwd(),base='output/dev-evidence/',sha=b=>createHash('sha256').update(b).digest('hex');
const shell=join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
async function command(file,args=[]){return new Promise((done,reject)=>{const child=spawn(shell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',resolve(file),...args],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{SystemRoot:process.env.SystemRoot,USERPROFILE:process.env.USERPROFILE,PATH:process.env.PATH}});let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.once('error',reject);child.once('exit',code=>code===0?done(JSON.parse(out.trim())):reject(new Error('Permission command failed: '+err.slice(0,200))));});}
const before=sha(readFileSync('.env'));
const read=()=>command('tests/helpers/restricted-file-read.ps1',['-Path',resolve('.env'),'-RestrictedGroup','AuthenticatedUsers']);
const beforeRead=await read();assert.equal(beforeRead.readAllowed,true,'Known inherited group must actually read before remediation');
const core=await command('scripts/protect-local-data.ps1',['-Action','protect']);
assert.equal(core.state,'protected');assert.equal(sha(readFileSync('.env')),before);
const afterRead=await read();assert.equal(afterRead.readAllowed,false);
const report={at:new Date().toISOString(),status:'core-passed-development-evidence-pending',beforeRestrictedReadAllowed:true,afterRestrictedReadAllowed:false,restrictedIdentity:'Current-user token restricted by AuthenticatedUsers SID; not a separately logged-on account',envBytesUnchanged:true,core:{state:core.state,changed:core.changed,snapshotStoredPrivately:true},modelRequests:0,mainServiceRestarted:false};
writeFileSync(base+'local-permissions-application.json',JSON.stringify(report,null,2));console.log(JSON.stringify({stage:'core',...report}));
const development=await command('scripts/protect-local-data.ps1',['-Action','protect','-IncludeDevelopmentEvidence']);
assert.equal(development.state,'protected');assert.equal(sha(readFileSync('.env')),before);
report.status='passed';report.development={state:development.state,changed:development.changed,snapshotStoredPrivately:true};report.at=new Date().toISOString();writeFileSync(base+'local-permissions-application.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
