import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createApp} from '../server/app.js';
import {NativeImports} from '../server/native-imports.js';
import {defaultStorageLimits} from '../server/storage.js';

test('two HTTP previews share the inspection slots while health stays responsive',{timeout:180000},async()=>{
  const root=mkdtempSync(join(tmpdir(),'import-preview-pair-'));const app=createApp({dataDir:root,password:'preview-pair',schedule:false});
  assert.equal(app.store.capacity!.limits.sessionsBytes,defaultStorageLimits.sessionsBytes);
  await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;
  try{
    const project=app.service.createProject('Preview pair');const imports=new NativeImports(app.store,root);const timestamp=new Date().toISOString();
    const records=[];
    for(const [name,mark] of [['one.jsonl','PREVIEW_ONE'],['two.jsonl','PREVIEW_TWO']] as const){
      const bytes=Buffer.from([JSON.stringify({type:'session',version:3,id:mark,cwd:'Z:/ignored',timestamp}),JSON.stringify({type:'message',id:'a',parentId:null,timestamp,message:{role:'user',content:mark+' '+ 'x'.repeat(40*1024*1024),timestamp:1}})].join('\n')+'\n');
      const sha256=createHash('sha256').update(bytes).digest('hex');const record=imports.begin(project.id,name,bytes.length,sha256,name);
      for(let offset=0;offset<bytes.length;offset+=1024*1024)imports.write(project.id,record.id,offset,bytes.subarray(offset,Math.min(bytes.length,offset+1024*1024)));
      records.push({id:record.id,sha256,bytes:bytes.length});
    }
    const login=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({password:'preview-pair'})});const headers={cookie:login.headers.get('set-cookie')!.split(';')[0]};
    let complete=false;const healthMs:number[]=[];
    const previews=Promise.all(records.map(async record=>{
      const response=await fetch(base+`/api/native-imports/${record.id}/preview?projectId=${project.id}`,{headers});
      assert.equal(response.status,200,await response.clone().text());const body=await response.json();
      assert.equal(body.preview.sha256,record.sha256);assert.equal(body.preview.messageCount,1);return body;
    })).finally(()=>{complete=true;});
    const health=(async()=>{while(!complete){const started=performance.now();const reply=await fetch(base+'/api/health',{signal:AbortSignal.timeout(5000)});assert.equal(reply.status,200);await reply.text();healthMs.push(Math.round(performance.now()-started));await new Promise(resolve=>setTimeout(resolve,25));}})();
    await Promise.all([previews,health]);
    assert(healthMs.length>1,`expected overlapping health samples, got ${healthMs.length}`);
    const maxHealthMs=Math.max(...healthMs);assert(maxHealthMs<1000,`health stalled ${maxHealthMs}ms`);
    assert.equal(app.store.list('run').length,0);assert.equal(app.store.list('task').length,0);
    const sessionBytes=app.store.capacity!.usage().groups.sessions.bytes;assert.equal(sessionBytes,records[0].bytes+records[1].bytes);
    const output='output/dev-evidence/pi-parity/import-preview-pair';mkdirSync(output,{recursive:true});
    writeFileSync(join(output,'report.json'),JSON.stringify({sessionsLimit:defaultStorageLimits.sessionsBytes,files:records.map(record=>record.bytes),sessionBytes,healthSamples:healthMs.length,maxHealthMs,runs:0},null,2));
  }finally{await app.close();}
});
