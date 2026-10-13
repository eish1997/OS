import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
const verification=JSON.parse(readFileSync('output/dev-evidence/verification/report.json','utf8'));assert.equal(verification.status,'passed');for(const [file,hash] of Object.entries(verification.baseline))assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),hash,file);
const shell=join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
async function command(file,action){const child=spawn(shell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',resolve('scripts/'+file),'-Action',action],{cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);const code=await new Promise((done,reject)=>{child.once('error',reject);child.once('exit',code=>{child.stdout.destroy();child.stderr.destroy();done(code);});});assert.equal(code,0,stderr);return JSON.parse(stdout.trim().replace(/^\uFEFF/,''));}
const before={service:await command('local-service.ps1','status'),supervisor:await command('supervise-service.ps1','status')};assert.equal(before.service.state,'stopped');assert.equal(before.supervisor.running,false);
const start=await command('supervise-service.ps1','start');const after=await command('local-service.ps1','status');assert.equal(after.state,'ready');
const report={at:new Date().toISOString(),status:'passed',reason:'Actual owned service and monitor absent after browser/tool transport ended; no live handle or listener',before,start,after,modelRequests:0};writeFileSync('output/dev-evidence/client-recovery-service-restoration.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
