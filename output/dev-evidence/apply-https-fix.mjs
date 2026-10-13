import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const verification=JSON.parse(readFileSync('output/dev-evidence/verification/report.json','utf8'));
assert.equal(verification.status,'passed');for(const [file,hash] of Object.entries(verification.baseline))assert.equal(sha(readFileSync(file)),hash,file);
const beforeEnv=sha(readFileSync('.env'));
const shell=join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
async function command(script,action){
 const child=spawn(shell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',resolve('scripts/'+script),'-Action',action],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
 const exit=await new Promise((done,reject)=>{child.once('error',reject);child.once('exit',code=>{child.stdout.destroy();child.stderr.destroy();done(code);});});assert.equal(exit,0,'Owned manager command failed: '+script+' '+action+' '+stderr);return JSON.parse(stdout.trim().replace(/^\uFEFF/,''));
}
const report={at:new Date().toISOString(),status:'running',modelRequests:0};const save=()=>writeFileSync('output/dev-evidence/https-fix-application.json',JSON.stringify(report,null,2));save();
try {
 report.supervisorBefore=await command('supervise-service.ps1','status');report.serviceBefore=await command('local-service.ps1','status');save();
 report.supervisorStop=await command('supervise-service.ps1','stop');save();
 report.serviceStop=await command('local-service.ps1','stop');save();
 report.supervisorStart=await command('supervise-service.ps1','start');save();
 report.serviceAfter=await command('local-service.ps1','status');assert.equal(report.serviceAfter.state,'ready');assert.notEqual(report.serviceAfter.instanceId,report.serviceBefore.instanceId);
 assert.equal(sha(readFileSync('.env')),beforeEnv);report.mainEnvUnchanged=true;
 const failure='output/dev-evidence/private/HTTPS 中文 c86f9368-41d7-408e-89fc-25629dc5b894/previous-report.json';copyFileSync(failure,'output/dev-evidence/https-first-failure.json');
 report.status='passed';report.at=new Date().toISOString();save();console.log(JSON.stringify({status:report.status,service:report.serviceAfter,mainEnvUnchanged:true,modelRequests:0}));
}catch(error){report.status='failed';report.reason=error.message;save();throw error;}
