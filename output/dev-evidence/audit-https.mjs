import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const sha=b=>createHash('sha256').update(b).digest('hex');
const report=JSON.parse(readFileSync('output/dev-evidence/verification/report.json','utf8'));assert.equal(report.status,'passed');
for(const [file,hash] of Object.entries(report.baseline))assert.equal(sha(readFileSync(file)),hash,file);
for(const check of report.checks){assert.equal(check.exitCode,0);assert.equal(sha(readFileSync('output/dev-evidence/verification/'+check.name+'.log')),check.outputSha256);}
const testLog=readFileSync('output/dev-evidence/verification/integration-tests.log','utf8');assert(/tests 104\b/.test(testLog));assert(/pass 104\b/.test(testLog));
const previous='output/dev-evidence/verification/history/2026-10-06T15-43-07-620Z/report.json';assert.equal(sha(readFileSync(previous)),'eb24a3ca5723cb77fdb28664b2c56f59c79c2ef3c655a8a430b6dbff1092af4a');
const probe=JSON.parse(readFileSync('output/dev-evidence/https-proxy.json','utf8'));assert.equal(probe.status,'passed');assert(probe.sse.durationMs>=65000);assert.equal(probe.modelRequests,0);assert.equal(probe.primaryIdentityUnchanged,true);
const failure=JSON.parse(readFileSync('output/dev-evidence/https-first-failure.json','utf8'));assert.equal(failure.status,'failed');assert.equal(failure.lastOriginCheck.status,201);assert.equal(failure.cleanupBackend.code,0);assert.equal(failure.cleanupProxy.signal,'SIGTERM');
const product=JSON.parse(readFileSync('output/dev-evidence/https-production.json','utf8'));assert.equal(product.status,'passed');assert.equal(product.preservedUserSessions,31);assert.equal(product.ownLoginRetired,true);assert.equal(product.callCountersUnchanged,true);assert.equal(product.canonicalDraftPreserved,true);
const shell=join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
function status(file){const command=spawnSync(shell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',resolve('scripts/'+file),'-Action','status'],{encoding:'utf8',windowsHide:true,timeout:20000});assert.equal(command.status,0,command.stderr);return JSON.parse(command.stdout.trim().replace(/^\uFEFF/,''));}
const service=status('local-service.ps1'),supervisor=status('supervise-service.ps1');assert.equal(service.state,'ready');assert.equal(service.instanceId,product.service.instanceId);assert.equal(supervisor.state,'ready');assert.equal(supervisor.running,true);
const monitor=JSON.parse(readFileSync('.runtime/supervisor-workbench.json','utf8').replace(/^\uFEFF/,''));assert.equal(monitor.instance,supervisor.instance);assert.equal(monitor.servicePid,service.pid);assert(Date.now()-Date.parse(monitor.at)<40000,'Supervisor record must be fresh');
const docs=['README.md'];function walk(folder){for(const e of readdirSync(folder,{withFileTypes:true})){const file=join(folder,e.name);if(e.isDirectory())walk(file);else if(file.endsWith('.md'))docs.push(file);}}walk('doc');let links=0;
for(const file of docs)for(const match of readFileSync(file,'utf8').matchAll(/\]\(([^)]+)\)/g)){let path=match[1].trim();if(/^(https?:|app:|codex:|#)/.test(path))continue;path=path.replace(/^<|>$/g,'').split('#')[0];if(!path)continue;assert(existsSync(resolve(dirname(file),path)),'Missing document link: '+file+' -> '+path);links++;}
const result={at:new Date().toISOString(),status:'passed',engineeringFiles:Object.keys(report.baseline).length,tests:104,checks:report.checks.length,verificationSha256:sha(readFileSync('output/dev-evidence/verification/report.json')),previous103Sha256:sha(readFileSync(previous)),actualHttpsAndFailurePreserved:true,localDocLinks:links,service,supervisor,modelRequests:0,preservedUserSessions:31,remaining:probe.remaining};
writeFileSync('output/dev-evidence/https-final-audit.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
