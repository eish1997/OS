import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,resolve,join} from 'node:path';
import assert from 'node:assert/strict';
const base='output/dev-evidence/',read=f=>readFileSync(f,'utf8').replace(/^\uFEFF/,''),json=f=>JSON.parse(read(f)),sha=v=>createHash('sha256').update(v).digest('hex');
const lead='032：[真实节点断线恢复](iterations/032-node-reconnect.md)补齐实际CLI离线等待、提交后丢回复去重、提交前断线/真实租约到期/回执对账及后续排队继续。同一节点进程、3任务/3资产、原字节保持，零模型请求；原107工程文件/108测试基线保持，新探针类型与实际运行通过。主产品原实例和自动ChatGPT保持。远程主机/真手机、OS睡眠、生产/异地、腾讯和反馈门槛仍待验收。';
function prepend(f,text){let s=read(f);const p=s.indexOf('\n');writeFileSync(f,s.slice(0,p+1)+'\n'+text+'\n'+s.slice(p+1));}
for(const file of ['doc/dev/current.md','doc/dev/backlog.md','doc/dev/acceptance.md'])prepend(file,lead);
let backlog=read('doc/dev/backlog.md');backlog=backlog.replace('远程失联重连、睡眠唤醒及部署联调','032本机真实CLI失联重连/回执对账/排队已通过；远程HTTPS联调与真实睡眠唤醒仍待验证');writeFileSync('doc/dev/backlog.md',backlog);
prepend('doc/README.md','最新执行：[032节点恢复](dev/iterations/032-node-reconnect.md)、[真实故障结果](../output/dev-evidence/node-reconnect.json)、[新增探针验证](../output/dev-evidence/node-reconnect-verification.json)、[主产品观察](../output/dev-evidence/node-reconnect-production.json)。现有工程108项基线保持，新探针独立验证；不把本机断线算作远程/睡眠验收。');
prepend('doc/dev/接入与上线解决计划.md','032已验证[实际节点断线与对账](iterations/032-node-reconnect.md)，暂时失联后同一进程自动补交原成果，去重后继续队列。无需新增用户设置；真实远程HTTPS和OS唤醒仍需独立证据。');
const report=json(base+'verification/report.json');assert.equal(report.status,'passed');
for(const [file,hash] of Object.entries(report.baseline))assert.equal(sha(readFileSync(file)),hash,file);
for(const check of report.checks){assert.equal(check.exitCode,0);assert.equal(sha(readFileSync(base+'verification/'+check.name+'.log')),check.outputSha256);}
const verification=json(base+'node-reconnect-verification.json');assert.equal(verification.newProbeSha256,sha(readFileSync(verification.newProbe)));assert.equal(verification.actualProbeSha256,sha(readFileSync(base+'node-reconnect.json')));assert.equal(verification.typecheck.exitCode,0);
const actual=json(base+'node-reconnect.json');assert.equal(actual.status,'passed');assert.equal(actual.modelRequests,0);assert.equal(actual.checks.length,3);assert.equal(actual.nodeExit.signal,'SIGTERM');
const product=json(base+'node-reconnect-production.json');assert.equal(product.status,'passed');assert.equal(product.service.instanceId,json(base+'client-recovery-production.json').service.instanceId);assert.equal(product.connection.limitsMode,'automatic');assert.equal(product.connection.connected,true);assert.equal(product.totalUserSessions,31);assert.equal(product.preservedOtherUserSessions,30);assert.equal(product.callCountersUnchanged,true);assert.equal(product.canonicalDraftPreserved,true);
const target=base+'node-reconnect-final-audit.json';writeFileSync(target,JSON.stringify({status:'auditing'}));
const docs=['README.md'];function walk(folder){for(const entry of readdirSync(folder,{withFileTypes:true})){const file=join(folder,entry.name);if(entry.isDirectory())walk(file);else if(file.endsWith('.md'))docs.push(file);}}walk('doc');let links=0;
for(const file of docs)for(const match of read(file).matchAll(/\]\(([^)]+)\)/g)){let path=match[1].trim();if(/^(https?:|app:|codex:|#)/.test(path))continue;path=path.replace(/^<|>$/g,'').split('#')[0];if(!path)continue;assert(existsSync(resolve(dirname(file),path)),file+' -> '+path);links++;}
const result={status:'passed',at:new Date().toISOString(),previousGoalTurn:'progress',goalStatus:'active',unchangedEngineeringFiles:107,unchangedTestBaseline:108,newProbeVerified:true,actualNodeChecks:3,childExitAwaited:actual.nodeExit,mainServiceUnchanged:true,modelRequests:0,localDocLinks:links,remaining:['Actual remote HTTPS/phone','OS sleep/wake','Production permissions/filesystem quota/WAL','Offsite independent-machine restore','Tencent isolation/comparison and user feedback','M1 depends on full M0 acceptance']};writeFileSync(target,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
