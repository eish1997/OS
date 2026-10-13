import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const read=p=>readFileSync(p,'utf8').replace(/^\uFEFF/,'');
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const walk=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(p,e.name)):e.name.endsWith('.md')?[join(p,e.name)]:[]);
const report=JSON.parse(read('output/dev-evidence/verification/report.json'));assert.equal(report.status,'passed');
for(const [p,h] of Object.entries(report.baseline))assert.equal(hash(p),h,p);
const files=walk('doc'),broken=[];let links=0;
for(const file of files)for(const match of read(file).matchAll(/!?\[[^\]\n]*\]\(([^)\n]+)\)/g)){
 let target=match[1].trim();target=target.startsWith('<')?target.slice(1,target.indexOf('>')):target.replace(/\s+["'][\s\S]*$/,'');
 if(/^[a-z][a-z0-9+.-]*:/i.test(target)||target.startsWith('#'))continue;
 target=decodeURIComponent(target.split('#')[0].split('?')[0]);if(!target)continue;links++;if(!existsSync(resolve(dirname(file),target)))broken.push({file,target});
}
assert.deepEqual(broken,[]);
assert(read('doc/dev/backlog.md').includes('| L-02a WAL容量恢复 | done |'));
assert(read('doc/dev/backlog.md').includes('| L-01b 资料与成果阅读 | verifying |'));
assert(read('doc/dev/current.md').includes('137项、147文件'));
const audit=JSON.parse(read('output/dev-evidence/wal-049-audit.json'));assert.equal(audit.verificationSha256,hash('output/dev-evidence/verification/report.json'));assert.equal(audit.goalComplete,false);
writeFileSync('output/dev-evidence/wal-049-doc-audit.json',JSON.stringify({at:new Date().toISOString(),status:'passed',documents:files.length,localLinks:links,engineeringFiles:Object.keys(report.baseline).length,baselineVerified:true,walAuditSha256:hash('output/dev-evidence/wal-049-audit.json'),remainingBrowserAndOsAcceptance:true,userFeedback:'pending',goalComplete:false},null,2)+'\n');
console.log(JSON.stringify({status:'passed',documents:files.length,links,engineeringFiles:Object.keys(report.baseline).length}));
