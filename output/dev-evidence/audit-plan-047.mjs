import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve('.');
const auditPath='output/dev-evidence/plan-update-047-audit.json';
writeFileSync(auditPath,JSON.stringify({at:new Date().toISOString(),status:'pending'})+'\n');
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const read=p=>readFileSync(p,'utf8').replace(/^\uFEFF/,'');
const walk=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(p,e.name)):e.name.endsWith('.md')?[join(p,e.name)]:[]);
const reportPath='output/dev-evidence/verification/report.json';
const report=JSON.parse(read(reportPath));
assert.equal(report.status,'passed');
for(const [p,h] of Object.entries(report.baseline))assert.equal(hash(p),h,p);
const changed=['doc/主开发文档.md','doc/开发执行文档.md','doc/dev/current.md','doc/dev/backlog.md','doc/dev/acceptance.md','doc/README.md','doc/dev/iterations/046-draft-workspace.md','doc/dev/iterations/047-local-plan-update.md'];
const main=read(changed[0]),execution=read(changed[1]);
assert(main.includes('版本：0.8'));assert(execution.includes('版本：0.8'));
for(const id of ['L-01a','L-01b','L-01c'])assert(execution.includes(id)&&read('doc/dev/backlog.md').includes(id),id);
assert(main.includes('不作为当前交付前置'));
assert(execution.includes('M1 仍依赖本地 M0 通过'));
assert(execution.includes('R-01至04为用户延期'));
assert(read('doc/dev/current.md').includes('144文件'));
const files=walk(join(root,'doc'));
let links=0;const failures=[];
for(const file of files){
  for(const match of read(file).matchAll(/!?\[[^\]\n]*\]\(([^)\n]+)\)/g)){
    let target=match[1].trim();
    if(target.startsWith('<'))target=target.slice(1,target.indexOf('>'));
    else target=target.replace(/\s+["'][\s\S]*$/,'');
    if(/^[a-z][a-z0-9+.-]*:/i.test(target)||target.startsWith('#'))continue;
    target=decodeURIComponent(target.split('#')[0].split('?')[0]);
    if(!target)continue;links++;
    if(!existsSync(resolve(dirname(file),target)))failures.push({file,target});
  }
}
assert.deepEqual(failures,[],'Broken local documentation links');
const result={at:new Date().toISOString(),status:'passed',scope:'Documentation update only; local desktop first',changedDocuments:Object.fromEntries(changed.map(p=>[p,hash(p)])),documentsScanned:files.length,localDocumentLinks:links,engineeringBaselineUnchanged:true,engineeringFiles:Object.keys(report.baseline).length,verificationSha256:hash(reportPath),freshEngineeringTestsRun:false,sourceEditedByThisUpdate:false,serviceRestartedByThisUpdate:false,modelRequestsByThisUpdate:0,m0Accepted:false,m1Started:false,remoteStage:'Deferred by user'};
writeFileSync(auditPath,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,documents:files.length,links,engineeringFiles:result.engineeringFiles}));
