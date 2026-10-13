import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';
import assert from 'node:assert/strict';
const base='output/dev-evidence/',read=f=>readFileSync(f,'utf8').replace(/^\uFEFF/,''),json=f=>JSON.parse(read(f)),sha=b=>createHash('sha256').update(b).digest('hex');
const target=base+'linux-preparation-final-audit.json';assert(!existsSync(target),'Do not duplicate documentation updates');
const report=json(base+'verification/report.json');assert.equal(report.status,'passed');assert.equal(Object.keys(report.baseline).length,120);
for(const [file,hash] of Object.entries(report.baseline))assert.equal(sha(readFileSync(file)),hash,file);
for(const check of report.checks){assert.equal(check.exitCode,0);assert.equal(sha(readFileSync(base+'verification/'+check.name+'.log')),check.outputSha256);}
const log=read(base+'verification/integration-tests.log');for(const re of [/tests 109\b/,/pass 109\b/,/fail 0\b/,/cancelled 0\b/,/skipped 0\b/])assert(re.test(log));
const install=json(base+'linux-install.json');assert.equal(install.status,'passed');assert.equal(install.linuxExecuted,false);assert.equal(install.windowsCleanBuildPassed,true);assert.equal(install.oldHostInstallExitCode,0);assert.equal(install.oldRequiredBindingLinuxCheck,'EBADPLATFORM');
for(const check of install.checks){assert.equal(check.exitCode,0);assert.equal(sha(readFileSync(join(install.fixture,check.name+'.log'))),check.outputSha256);}
assert.equal(sha(readFileSync(join(install.fixture,'app/node_modules/@rolldown/binding-linux-x64-gnu/rolldown-binding.linux-x64-gnu.node'))),install.installedLinuxBindingSha256);
for(const [file,hash] of Object.entries(install.afterHashes))assert.equal(sha(readFileSync(file)),hash);
const versions=json(base+'linux-lock-versions.json');assert.equal(versions.status,'passed');assert.equal(versions.lockedPackages,216);assert.equal(versions.versionsResolvedAndIntegrityPreserved,true);
const product=json(base+'linux-preparation-production.json');assert.equal(product.status,'passed');assert.equal(product.preservedUserSessions,31);assert.equal(product.sessionFingerprintPreserved,true);assert.equal(product.currentBrowserSessionReplaced,false);assert.equal(product.callCountersUnchanged,true);assert.equal(product.canonicalDraftPreserved,true);assert.equal(product.ownLoginRetired,true);
const previous=json(base+'local-permissions-final-audit.json');const historical='verification/history/2026-10-06T17-28-25-236Z/report.json';assert.equal(sha(readFileSync(base+historical)),previous.verificationSha256);
const oldProduct=json(base+'local-permissions-production.json');assert.equal(product.service.instanceId,oldProduct.service.instanceId);assert.equal(product.service.pid,oldProduct.service.pid);assert.equal(product.service.creationUtc,oldProduct.service.creationUtc);
// Freeze historical evidence references before making the new baseline current.
const iteration='doc/dev/iterations/034-local-permissions.md';writeFileSync(iteration,read(iteration).replaceAll('../../../output/dev-evidence/verification/report.json','../../../output/dev-evidence/'+historical));
oldProduct.verification=historical;writeFileSync(base+'local-permissions-production.json',JSON.stringify(oldProduct,null,2));
previous.historicalVerification=historical;writeFileSync(base+'local-permissions-final-audit.json',JSON.stringify(previous,null,2));
let index=read('doc/README.md').replace('[109项工程基线](../output/dev-evidence/verification/report.json)',`[当时109项工程基线](../output/dev-evidence/${historical})`);
index=index.replace('[真实环境](../output/dev-evidence/deployment-environment.json)','[当时环境](../output/dev-evidence/deployment-environment-before-permissions.json)');writeFileSync('doc/README.md',index);
const lead='035：[Linux部署准备](iterations/035-linux-deployment-files.md)修复必装Windows原生依赖，216包版本保持；实际npm Linux目标安装与干净Windows安装/构建通过。新增服务、环境模板、只读前置检查和版本锁。109项完整工程通过、120文件哈希，原实例/自动ChatGPT/文章/31登录/用量及备份保持，零模型请求。未执行Linux或公网部署，远程/隔离/恢复/腾讯及M1门槛保持。';
function prepend(f,s){const value=read(f),p=value.indexOf('\n');writeFileSync(f,value.slice(0,p+1)+'\n'+s+'\n'+value.slice(p+1));}
for(const f of ['doc/dev/current.md','doc/dev/backlog.md','doc/dev/acceptance.md'])prepend(f,lead);
prepend('doc/README.md','最新执行：[035Linux部署准备](dev/iterations/035-linux-deployment-files.md)、[后台服务文件](../deployment/linux/README.md)、[实际依赖安装](../output/dev-evidence/linux-install.json)、[收尾审计](../output/dev-evidence/linux-preparation-final-audit.json)。真实Linux、公网/手机及完整目标保持未验收。');
prepend('doc/deployment.md','035新增[Linux服务与配置文件](../deployment/linux/README.md)，修复平台安装依赖；实际Linux目标选择与干净Windows构建、109项工程通过。真实Linux系统服务及公网仍待验收，详见[迭代035](dev/iterations/035-linux-deployment-files.md)。');
prepend('doc/dev/部署准备方案.md','035已准备[Linux后台服务文件](../../deployment/linux/README.md)，修复依赖平台选择，补齐Node/Caddy版本锁与备份挂载前置。真实主机/手机和授权桥接仍待验收；没有购买或公开服务。独立备份卷只是同机落地点，另需异地转存与恢复。');
prepend('doc/dev/接入与上线解决计划.md','035已补齐[Linux服务文件与平台安装准备](iterations/035-linux-deployment-files.md)。远程OAuth桥接、资源、手机及生产存储/腾讯仍待落实；自动ChatGPT与现有产品保持。');
prepend('README.md','云端准备：[Linux后台服务与配置](deployment/linux/README.md)已落盘，依赖按平台选择；真实云主机、手机访问和远程授权仍待验收。用户日常使用不需要填写部署参数。');
writeFileSync(target,JSON.stringify({status:'auditing'}));
const docs=['README.md'];function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const file=join(dir,entry.name);if(entry.isDirectory())walk(file);else if(file.endsWith('.md'))docs.push(file);}}walk('doc');walk('deployment');let links=0;
for(const file of docs)for(const match of read(file).matchAll(/\]\(([^)]+)\)/g)){let p=match[1].trim();if(/^(https?:|app:|codex:|#)/.test(p))continue;p=p.replace(/^<|>$/g,'').split('#')[0];if(!p)continue;assert(existsSync(resolve(dirname(file),p)),file+' -> '+p);links++;}
const result={at:new Date().toISOString(),status:'passed',engineeringFiles:120,tests:109,checks:report.checks.length,verificationSha256:sha(readFileSync(base+'verification/report.json')),priorVerification:historical,priorVerificationSha256:previous.verificationSha256,lockedPackageVersionsPreserved:216,linuxTargetInstallPassed:true,linuxExecuted:false,windowsCleanBuildPassed:true,systemdExecuted:false,modelRequests:0,mainServiceUnchanged:true,preservedUserSessions:31,sessionFingerprintPreserved:true,localDocLinks:links,goalStatus:'active',remaining:['Real Linux install/build/systemd and production permissions','Remote resource/HTTPS/phone and OAuth bridge','Filesystem quota/WAL and offsite restore','OS sleep/wake','Tencent isolated comparison and user feedback','M1 gate']};writeFileSync(target,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
