import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const base='output/dev-evidence/';
const read=p=>readFileSync(p,'utf8').replace(/^\uFEFF/,'');
const json=p=>JSON.parse(read(p));
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const report=json(base+'verification/report.json');
assert.equal(report.status,'passed');
for(const [p,h] of Object.entries(report.baseline))assert.equal(hash(p),h,`Engineering baseline ${p}`);
for(const c of report.checks){assert.equal(c.exitCode,0);assert.equal(hash(base+'verification/'+c.name+'.log'),c.outputSha256);}
const changes=json(base+'local-scope-changes.json');
for(const c of changes.changes){
  if(c.before)assert.equal(hash(base+'local-scope-before/'+c.path.replaceAll('/','__')+'.txt'),c.before,`Before snapshot ${c.path}`);
  c.after=hash(c.path);
}
const target=base+'local-scope-audit.json';assert(!existsSync(target));
writeFileSync(target,JSON.stringify({status:'auditing'}));
const docs=['README.md'];
const walk=p=>{for(const e of readdirSync(p,{withFileTypes:true})){const file=join(p,e.name);if(e.isDirectory())walk(file);else if(file.endsWith('.md'))docs.push(file);}};
walk('doc');walk('deployment');
let links=0;
for(const p of docs)for(const m of read(p).matchAll(/\]\(([^)]+)\)/g)){
  let ref=m[1].trim();if(/^(https?:|app:|codex:|#)/.test(ref))continue;
  ref=ref.replace(/^<|>$/g,'').split('#')[0];if(ref){assert(existsSync(resolve(dirname(p),ref)),`${p} -> ${ref}`);links++;}
}
const health=await(await fetch('http://127.0.0.1:4310/api/health')).json();
assert.equal(health.ready,true);assert.equal(health.pid,52144);assert.equal(health.instanceId,'975f5a08-dbd3-44a0-b088-179895604ffa');
const backlog=read('doc/dev/backlog.md');
for(const id of ['R-01','R-02','R-03','R-04'])assert(backlog.split('\n').some(l=>l.startsWith('| '+id)&&l.includes('| todo |')));
assert(backlog.split('\n').some(l=>l.startsWith('| MEM-01')&&l.includes('| blocked |')));
assert(backlog.split('\n').some(l=>l.startsWith('| L-01')&&l.includes('| ready |')));
const manifestTarget=base+'local-scope-changes.json';
writeFileSync(manifestTarget,JSON.stringify(changes,null,2)+'\n');
const result={at:new Date().toISOString(),status:'passed',scope:'User-directed local desktop first; remote requirements deferred, not passed',documents:changes.changes.length,localDocumentLinks:links,originalSnapshotsVerified:true,manifestSha256:hash(manifestTarget),engineeringBaselineUnchanged:true,engineeringFiles:Object.keys(report.baseline).length,verificationSha256:hash(base+'verification/report.json'),existingPassedTests:128,freshTestsRun:false,productionService:health,productionRestarted:false,sourceEdited:false,modelRequestsByThisTurn:0,cloudPurchased:false,networkConfigured:false,vmBooted:false,tencentExecuted:false,privateGpgAgentStopped:true,goalComplete:false,remainingLocal:['L-01 actual desktop user path','Windows login/default browser/sleep wake','Local disk/WAL and sustained usage boundaries','Real user task and feedback','M1 controlled subagents and plugin'],deferred:['R-01 real phone/private or cloud HTTPS','R-02 remote computer node','R-03 migration/offsite restore','R-04 real Linux deployment'],separateBlocked:'MEM-01 Tencent isolated experiment'};
writeFileSync(target,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,documents:result.documents,localDocumentLinks:links,engineeringFiles:result.engineeringFiles,baselineUnchanged:true,servicePid:health.pid,goalComplete:false}));
