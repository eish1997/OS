import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
const input=JSON.parse(readFileSync('output/dev-evidence/search-performance.json','utf8'));const p=input.profiles.find(p=>p.profile==='full');assert(p.ownedChildExited);assert.equal(await fetch(p.base+'/api/health',{signal:AbortSignal.timeout(3000)}).then(()=>false).catch(e=>e.cause?.code==='ECONNREFUSED'),true);
const db=new DatabaseSync(join(p.source,'workbench.sqlite'),{readOnly:true});
const regex=q=>new RegExp(Buffer.from(q).toString('latin1').replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i');
const results=[];
try{for(const query of ['CAPACITY_SMALL_NEEDLE','CAPACITY_LARGE_NEEDLE']){
 const pattern='%'+query+'%',rx=regex(query);db.function('probe_contains',{deterministic:true},value=>{const bytes=Buffer.from(value.buffer,value.byteOffset,value.byteLength);const nul=bytes.indexOf(0);return Number(rx.test((nul<0?bytes:bytes.subarray(0,nul)).toString('latin1')));});
 const where="FROM asset_search x JOIN entities e ON e.id=x.asset_id AND e.kind='asset' WHERE x.project_id=? AND e.project_id=? AND json_extract(e.body,'$.status')='ready' AND e.revision=x.revision AND (x.name LIKE ? ESCAPE '\\' OR x.tags LIKE ? ESCAPE '\\' OR ";
 let expected;for(const mode of ['like','blob-regex'])for(let i=0;i<3;i++){const sql='SELECT x.asset_id '+where+(mode==='like'?"x.content LIKE ? ESCAPE '\\')":"probe_contains(CAST(x.content AS BLOB)))")+' ORDER BY e.rowid DESC';const at=performance.now();const rows=db.prepare(sql).all(p.projectId,p.projectId,pattern,pattern,...(mode==='like'?[pattern]:[]));const elapsed=performance.now()-at;const ids=rows.map(v=>v.asset_id);if(mode==='like')expected=ids;else assert.deepEqual(ids,expected);const r={query,mode,ms:elapsed,items:rows.length};results.push(r);console.log(JSON.stringify(r));}
}}finally{db.close();}
writeFileSync('output/dev-evidence/search-match-fast-diagnosis.json',JSON.stringify({at:new Date().toISOString(),modelRequests:0,status:'measured',results},null,2));
