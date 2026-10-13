import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const read=p=>readFileSync(p,'utf8').replace(/^\uFEFF/,'');
const json=p=>JSON.parse(read(p));
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const base='output/dev-evidence/';
const report=json(base+'verification/report.json');
assert.equal(report.status,'passed');
for(const [p,h] of Object.entries(report.baseline))assert.equal(hash(p),h,`Engineering baseline ${p}`);
for(const c of report.checks){assert.equal(c.exitCode,0);assert.equal(hash(base+'verification/'+c.name+'.log'),c.outputSha256);}
const prior=json(base+'auth-lock-final-audit.json');
assert.equal(hash(base+'verification/report.json'),prior.verificationSha256);
const environment=json(base+'deployment-route-environment.json');
assert.equal(environment.service.ready,true);assert.equal(environment.service.actualProcessExists,true);
assert.equal(environment.service.instanceId,prior.service.instanceId);
const health=await (await fetch('http://127.0.0.1:4310/api/health')).json();
assert.equal(health.ready,true);assert.equal(health.pid,environment.service.pid);assert.equal(health.instanceId,environment.service.instanceId);
const changed=['doc/dev/无现成资源落地路线.md','doc/dev/iterations/044-deployment-route.md','doc/dev/部署准备方案.md','doc/dev/云资源候选与费用.md','doc/dev/current.md','doc/dev/backlog.md','doc/dev/acceptance.md','doc/README.md','doc/deployment.md','doc/存储与多设备架构.md'];
const docs=['README.md'];
const walk=p=>{for(const e of readdirSync(p,{withFileTypes:true})){const file=join(p,e.name);if(e.isDirectory())walk(file);else if(file.endsWith('.md'))docs.push(file);}};
walk('doc');walk('deployment');
const target=base+'deployment-route-audit.json';assert(!existsSync(target));
writeFileSync(target,JSON.stringify({status:'auditing'}));
let links=0;
for(const p of docs)for(const m of read(p).matchAll(/\]\(([^)]+)\)/g)){
 let ref=m[1].trim();if(/^(https?:|app:|codex:|#)/.test(ref))continue;
 ref=ref.replace(/^<|>$/g,'').split('#')[0];if(ref){assert(existsSync(resolve(dirname(p),ref)),`${p} -> ${ref}`);links++;}
}
const result={at:new Date().toISOString(),status:'passed',scope:'Deployment plan and read-only condition audit',documents:Object.fromEntries(changed.map(p=>[p,hash(p)])),environmentSha256:hash(base+'deployment-route-environment.json'),engineeringBaselineUnchanged:true,engineeringFiles:Object.keys(report.baseline).length,existingPassedTests:prior.tests,verificationSha256:hash(base+'verification/report.json'),freshTestsRun:false,localDocumentLinks:links,productionService:health,productionRestarted:false,sourceEdited:false,networkConfigured:false,clientInstalled:false,vmBooted:false,cloudPurchased:false,modelRequestsByThisTurn:0,goalComplete:false,remaining:['Actual Linux runtime and deployment','Private network client/account and real phone','Cloud resources/authorization/migration/offsite restore','Tencent isolated comparison and model budget','Existing M0/M1 acceptance and user feedback']};
writeFileSync(target,JSON.stringify(result,null,2));
console.log(JSON.stringify({status:result.status,documents:changed.length,localDocumentLinks:links,engineeringBaselineUnchanged:true,servicePid:health.pid,existingPassedTests:prior.tests,freshTestsRun:false,goalComplete:false}));