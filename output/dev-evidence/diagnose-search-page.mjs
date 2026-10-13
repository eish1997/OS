import {readFileSync,lstatSync,realpathSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const input=JSON.parse(readFileSync('output/dev-evidence/search-performance.json','utf8'));const profile=input.profiles.find(p=>p.profile==='full');assert(profile.ownedChildExited);
assert.equal(await fetch(profile.base+'/api/health',{signal:AbortSignal.timeout(3000)}).then(()=>false).catch(e=>e.cause?.code==='ECONNREFUSED'),true);
const root=resolve(profile.source);assert.equal(realpathSync(root),root);assert(root.startsWith(resolve('output/dev-evidence/private/mixed-')));
const db=new DatabaseSync(join(root,'workbench.sqlite'),{readOnly:true});const query='CAPACITY_LARGE_NEEDLE';
const rows=db.prepare("SELECT e.body FROM asset_search x JOIN entities e ON e.id=x.asset_id AND e.kind='asset' WHERE x.project_id=? AND e.project_id=? AND json_extract(e.body,'$.status')='ready' AND e.revision=x.revision AND (x.name LIKE ? OR x.tags LIKE ? OR x.content LIKE ?) ORDER BY e.rowid DESC");
const results=[];
try{for(const mode of ['text','blob']){for(let run=0;run<3;run++){
 const totalAt=performance.now(),measure={mode,run,matchMs:0,readMs:0,hashMs:0,decodeMs:0,indexMs:0,compareMs:0,foldMs:0,totalMs:0};let at=performance.now();const matched=rows.all(profile.projectId,profile.projectId,...Array(3).fill('%'+query+'%'));measure.matchMs=performance.now()-at;assert.equal(matched.length,119);
 const get=db.prepare(mode==='text'?'SELECT content FROM asset_search WHERE asset_id=?':'SELECT CAST(content AS BLOB) content FROM asset_search WHERE asset_id=?');
 for(const row of matched.slice(0,50)){const a=JSON.parse(row.body);const path=join(root,'assets',a.locator);assert(!lstatSync(path).isSymbolicLink());at=performance.now();const bytes=readFileSync(path);measure.readMs+=performance.now()-at;
 at=performance.now();assert.equal(createHash('sha256').update(bytes).digest('hex'),a.hash);measure.hashMs+=performance.now()-at;
 at=performance.now();const content=new TextDecoder('utf-8',{fatal:true}).decode(bytes);measure.decodeMs+=performance.now()-at;
 at=performance.now();const indexed=get.get(a.id).content;measure.indexMs+=performance.now()-at;
 at=performance.now();assert(mode==='text'?content===indexed:bytes.equals(indexed));measure.compareMs+=performance.now()-at;
 at=performance.now();assert(content.toLowerCase().indexOf(query.toLowerCase())>=0);measure.foldMs+=performance.now()-at;
 }measure.totalMs=performance.now()-totalAt;results.push(measure);console.log(JSON.stringify(measure));
}}}finally{db.close();}
writeFileSync('output/dev-evidence/search-page-diagnosis.json',JSON.stringify({at:new Date().toISOString(),modelRequests:0,encoding:'UTF-8',projectId:profile.projectId,items:50,results},null,2));
