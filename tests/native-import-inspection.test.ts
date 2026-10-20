import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {loadPi} from '../server/pi-adapter.js';
import {inspectNativeImport} from '../server/native-import-inspection.js';
import {prepareNativeImport} from '../server/native-import-async.js';

test('import preview accepts pinned Pi branches, edits, and self-referencing compaction without modifying original',async()=>{
  const root=mkdtempSync(join(tmpdir(),'import-inspect-'));const projectId='owned';const dir=join(root,'sessions',projectId);mkdirSync(dir,{recursive:true});
  try{
    const pi=await loadPi();const manager=pi.SessionManager.create(root,dir);
    const first=manager.appendMessage({role:'user',content:'original',timestamp:Date.now()});
    manager.appendContextEdit(first,{content:'replacement'});
    manager.appendCompaction('summary',null,100);
    manager.branch(first);manager.appendMessage({role:'user',content:'sibling',timestamp:Date.now()});
    const path=manager.getSessionFile()!;const original=readFileSync(path);
    const preview=inspectNativeImport({root,projectId,path});
    assert.equal(preview.sessionId,manager.getSessionId());assert.equal(preview.entryCount,manager.getEntries().length);
    assert.equal(preview.contextEditCount,1);assert.equal(preview.compactionCount,1);assert.equal(preview.messageCount,2);
    assert.equal(preview.environmentVerified,false);assert.equal(preview.sha256,createHash('sha256').update(original).digest('hex'));
    assert.deepEqual(readFileSync(path),original);
    assert.deepEqual(await prepareNativeImport({root,projectId,path}),preview);
    const controller=new AbortController();controller.abort();await assert.rejects(prepareNativeImport({root,projectId,path},controller.signal));
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('import preview rejects invalid graph, incompatible records and malformed bytes',()=>{
  const root=mkdtempSync(join(tmpdir(),'import-invalid-'));const projectId='owned';const dir=join(root,'sessions',projectId);mkdirSync(dir,{recursive:true});const path=join(dir,'owned.jsonl');
  const timestamp=new Date().toISOString();const header={type:'session',version:3,id:'session',timestamp,cwd:'Z:/untrusted/path'};
  const user={type:'message',id:'a',parentId:null,timestamp,message:{role:'user',content:'a',timestamp:1}};
  const sibling={...user,id:'b'};
  const edit={type:'context_edit',id:'c',parentId:'b',timestamp,targetId:'a',replacement:{content:'replacement'}};
  const cases:unknown[][]=[
    [header,user,sibling,edit],
    [header,user,{...edit,parentId:'a',targetId:'missing'}],
    [header,user,{...edit,parentId:'a',targetId:'c'}],
    [header,user,{...user,id:'b',parentId:'missing'}],
    [header,user,user],
    [header,user,{...user,id:'b',type:'future_entry'}],
    [header,user,{...header,id:'b',parentId:'a'}],
    [header,{...user,message:{role:'user',content:[{type:'image',data:7}]}}],
    [{...header,version:2},user],
  ];
  try{
    for(const rows of cases){const bytes=Buffer.from(rows.map(row=>JSON.stringify(row)).join('\n')+'\n');writeFileSync(path,bytes);assert.throws(()=>inspectNativeImport({root,projectId,path}),{status:422});assert.deepEqual(readFileSync(path),bytes);}
    writeFileSync(path,Buffer.from([0xff,0xfe,0x0a]));assert.throws(()=>inspectNativeImport({root,projectId,path}),{status:422});
    writeFileSync(path,JSON.stringify(header)+'\n');assert.throws(()=>inspectNativeImport({root,projectId:'other',path}),{status:403});
  }finally{rmSync(root,{recursive:true,force:true});}
});
