import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,realpathSync,lstatSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
const prior=JSON.parse(readFileSync('output/dev-evidence/search-performance.json','utf8')),p=prior.profiles.find(p=>p.profile==='full');assert(p.ownedChildExited);
assert.equal(await fetch(p.base+'/api/health',{signal:AbortSignal.timeout(3000)}).then(()=>false).catch(e=>e.cause?.code==='ECONNREFUSED'),true);
const root=resolve(p.source);assert(root.startsWith(resolve('output/dev-evidence/private/mixed-')));assert.equal(realpathSync(root),root);
const report={status:'running',at:new Date().toISOString(),modelRequests:0,source:root,samples:[]};const file='output/dev-evidence/search-sql-compare-diagnosis.json',save=()=>writeFileSync(file,JSON.stringify(report,null,2));save();
for(let run=0;run<6;run++){
 const mode=run%2?'sql-compare':'blob-js',db=new DatabaseSync(join(root,'workbench.sqlite'),{readOnly:true});db.exec('PRAGMA mmap_size=1073741824');
 try{
 const query='CAPACITY_LARGE_NEEDLE',start=performance.now();const rows=db.prepare("SELECT x.asset_id,e.body FROM asset_search x JOIN entities e ON e.id=x.asset_id AND e.kind='asset' WHERE x.project_id=? AND e.project_id=? AND json_extract(e.body,'$.status')='ready' AND e.revision=x.revision AND (x.name LIKE ? ESCAPE '\\' OR x.tags LIKE ? ESCAPE '\\' OR x.content LIKE ? ESCAPE '\\') ORDER BY e.rowid DESC").all(p.projectId,p.projectId,...Array(3).fill('%'+query+'%'));
 assert.equal(rows.length,119);const matchMs=performance.now()-start,get=db.prepare(mode==='blob-js'?'SELECT CAST(content AS BLOB) content FROM asset_search WHERE asset_id=?':'SELECT CAST(content AS BLOB)=? same FROM asset_search WHERE asset_id=?');let indexCompareMs=0;
 for(const row of rows.slice(0,50)){
 const asset=JSON.parse(row.body);assert.equal(asset.projectId,p.projectId);assert(/^[a-zA-Z0-9-]+$/.test(asset.locator));const path=join(root,'assets',asset.locator);assert(!lstatSync(path).isSymbolicLink());const bytes=readFileSync(path);assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.hash);
 const content=new TextDecoder('utf-8',{fatal:true}).decode(bytes),at=performance.now();assert(mode==='blob-js'?bytes.equals(get.get(asset.id).content):get.get(bytes,asset.id).same===1);indexCompareMs+=performance.now()-at;assert(content.toLowerCase().indexOf(query.toLowerCase())>=0);
 }const sample={run,mode,totalMs:performance.now()-start,matchMs,indexCompareMs,items:50,hashesVerified:50,exactIndexedBytesVerified:true,maxRssKiB:process.resourceUsage().maxRSS};report.samples.push(sample);save();console.log(JSON.stringify(sample));
 }finally{db.close();}
}
report.status='measured';save();
