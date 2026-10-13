import {readdirSync,statSync,readFileSync,existsSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const verification=JSON.parse(readFileSync('output/dev-evidence/verification/report.json','utf8'));
assert.equal(verification.status,'failed');
const start=Date.parse(verification.at),root=tmpdir();
const roots=readdirSync(root).filter(name=>name.startsWith('订阅迁移 QA ')).map(name=>join(root,name)).filter(path=>statSync(path).isDirectory()&&statSync(path).mtimeMs>=start-1000);
const read=path=>JSON.parse(readFileSync(path,'utf8'));
const incoming=roots.flatMap(path=>{const file=join(path,'private-model','transfer-incoming.json');return existsSync(file)?[{root:path,value:read(file)}]:[];});
const results=roots.flatMap(path=>{
 const file=join(path,'private-model','transfer-offer.json');if(!existsSync(file))return [];
 const bundle=read(file);const accepted=incoming.find(r=>r.value.header.id===bundle.header.id&&r.value.phase==='active');
 const unchanged=('A'+bundle.ciphertext.slice(1))===bundle.ciphertext;
 return [{syntheticRoot:path,firstCharacter:bundle.ciphertext[0],oldMutationUnchanged:unchanged,matchingDestinationActive:Boolean(accepted)}];
});
assert(results.some(r=>r.oldMutationUnchanged&&r.matchingDestinationActive),'Actual failed fixture must confirm unchanged mutation');
const report={at:new Date().toISOString(),status:'confirmed',verificationAt:verification.at,scope:'Only test-owned temporary folders with the known fixture prefix; no credential contents read or printed',results,conclusion:'Fixed A replacement did not change actual failing ciphertext; legitimate unchanged bundle was accepted',modelRequests:0};
writeFileSync('output/dev-evidence/auth-release-052-initial-failure.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:'confirmed',scannedFixtures:roots.length,matched:results.filter(r=>r.oldMutationUnchanged&&r.matchingDestinationActive)}));
