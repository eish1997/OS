import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const read=p=>readFileSync(p,'utf8').replace(/^\uFEFF/,'');
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const walk=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(p,e.name)):e.name.endsWith('.md')?[join(p,e.name)]:[]);
const current=JSON.parse(read('output/dev-evidence/verification/report.json'));assert.equal(current.status,'passed');
for(const [p,h] of Object.entries(current.baseline))assert.equal(hash(p),h,p);
const old=JSON.parse(read('output/dev-evidence/verification/history/2026-10-07T05-27-10-832Z/report.json'));
const backend=Object.keys(old.baseline).filter(p=>p.startsWith('server/')||p.startsWith('shared/'));
for(const p of backend)assert.equal(hash(p),old.baseline[p],p);
const files=walk('doc');let links=0;const broken=[];
for(const file of files)for(const match of read(file).matchAll(/!?\[[^\]\n]*\]\(([^)\n]+)\)/g)){
  let target=match[1].trim();target=target.startsWith('<')?target.slice(1,target.indexOf('>')):target.replace(/\s+["'][\s\S]*$/,'');
  if(/^[a-z][a-z0-9+.-]*:/i.test(target)||target.startsWith('#'))continue;
  target=decodeURIComponent(target.split('#')[0].split('?')[0]);if(!target)continue;links++;
  if(!existsSync(resolve(dirname(file),target)))broken.push({file,target});
}
assert.deepEqual(broken,[]);
assert(read('doc/dev/backlog.md').includes('| L-01b 资料与成果阅读 | verifying |'));
const reader=JSON.parse(read('output/dev-evidence/reader-048-audit.json'));assert.equal(reader.status,'passed');
assert.equal(reader.verificationSha256,hash('output/dev-evidence/verification/report.json'));
assert.equal(reader.browserAcceptance.status,'pending');assert.equal(reader.m0Accepted,false);
writeFileSync('output/dev-evidence/reader-048-doc-audit.json',JSON.stringify({at:new Date().toISOString(),status:'passed',documents:files.length,localLinks:links,engineeringFiles:Object.keys(current.baseline).length,baselineVerified:true,backendFilesUnchanged:backend.length,readerAuditSha256:hash('output/dev-evidence/reader-048-audit.json'),browserAcceptance:'pending',userFeedback:'pending',goalComplete:false},null,2)+'\n');
console.log(JSON.stringify({status:'passed',documents:files.length,links,backendFilesUnchanged:backend.length}));
