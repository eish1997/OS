import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const sha=b=>createHash('sha256').update(b).digest('hex');
const read=f=>JSON.parse(readFileSync(f,'utf8').replace(/^\uFEFF/,''));
const base='output/dev-evidence/';
const report=read(base+'verification/report.json');assert.equal(report.status,'passed');assert.equal(Object.keys(report.baseline).length,107);
for(const [file,hash] of Object.entries(report.baseline))assert.equal(sha(readFileSync(file)),hash,file);
for(const check of report.checks){assert.equal(check.exitCode,0);assert.equal(sha(readFileSync(base+'verification/'+check.name+'.log')),check.outputSha256);}
const log=readFileSync(base+'verification/integration-tests.log','utf8');for(const pattern of [/tests 108\b/,/pass 108\b/,/fail 0\b/,/cancelled 0\b/,/skipped 0\b/])assert(pattern.test(log));
const old=base+'verification/history/2026-10-06T16-11-07-701Z/report.json';assert.equal(sha(readFileSync(old)),'75981efd4bbda7f73ad27b611c4d5798b8989849ac8d54cff4b6f274e6d7f88a');
const evidence=read(base+'client-recovery.json');assert.equal(evidence.modelRequests,0);assert.equal(evidence.checks.automaticWritesDuringRecovery,0);assert.equal(evidence.fixture.databaseCounts.runs,0);assert.equal(evidence.fixture.databaseCounts.inbox,0);
for(const picture of evidence.screenshots)assert.equal(sha(readFileSync(base+picture.file)),picture.sha256);
const prod=read(base+'client-recovery-production.json');for(const key of ['canonicalDraftPreserved','callCountersUnchanged','currentBrowserSessionReplaced','ownLoginRetired'])assert.equal(prod[key],true);assert.equal(prod.preservedOtherUserSessions,30);assert.equal(prod.totalUserSessions,31);assert.equal(prod.connection.limitsMode,'automatic');assert.equal(prod.connection.enabled,true);assert.equal(prod.connection.connected,true);
const shell=join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
function status(file){const result=spawnSync(shell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',resolve('scripts/'+file),'-Action','status'],{encoding:'utf8',windowsHide:true,timeout:20000});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout.trim().replace(/^\uFEFF/,''));}
const service=status('local-service.ps1'),supervisor=status('supervise-service.ps1');assert.equal(service.state,'ready');assert.equal(service.instanceId,prod.service.instanceId);assert.equal(service.pid,prod.service.pid);assert.equal(supervisor.running,true);assert.equal(supervisor.state,'ready');
const monitor=read('.runtime/supervisor-workbench.json');assert.equal(monitor.instance,supervisor.instance);assert.equal(monitor.servicePid,service.pid);assert(Date.now()-Date.parse(monitor.at)<40000);
const alive=spawnSync(shell,['-NoProfile','-NonInteractive','-Command','if (Get-CimInstance Win32_Process -Filter "ProcessId=23056") {exit 1} else {exit 0}'],{encoding:'utf8',windowsHide:true,timeout:20000});assert.equal(alive.status,0,'Fixture process must be absent');
const docs=['README.md'];function walk(folder){for(const item of readdirSync(folder,{withFileTypes:true})){const file=join(folder,item.name);if(item.isDirectory())walk(file);else if(file.endsWith('.md'))docs.push(file);}}walk('doc');let links=0;
// Create the audit target so the already-authored self-reference is checked too.
const target=base+'client-recovery-final-audit.json';writeFileSync(target,JSON.stringify({status:'auditing'}));
for(const file of docs)for(const match of readFileSync(file,'utf8').matchAll(/\]\(([^)]+)\)/g)){let path=match[1].trim();if(/^(https?:|app:|codex:|#)/.test(path))continue;path=path.replace(/^<|>$/g,'').split('#')[0];if(!path)continue;assert(existsSync(resolve(dirname(file),path)),'Missing link: '+file+' -> '+path);links++;}
const result={at:new Date().toISOString(),status:'passed',engineeringFiles:107,tests:108,checks:report.checks.length,verificationSha256:sha(readFileSync(base+'verification/report.json')),historical104Sha256:sha(readFileSync(old)),localDocLinks:links,screenshots:evidence.screenshots.length,service,supervisor,modelRequests:0,totalUserSessions:31,preservedOtherUserSessions:30,currentBrowserSessionReplaced:true,fixturePidAbsent:true,remaining:evidence.limitations};writeFileSync(target,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
