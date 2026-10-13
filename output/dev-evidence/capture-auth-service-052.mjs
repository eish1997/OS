import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const phase=process.argv[2];assert(['before','after'].includes(phase));
const root='output/dev-evidence/private/auth-release-052';mkdirSync(root,{recursive:true});
const db=new DatabaseSync('data/workbench.sqlite',{readOnly:true});
const entities=db.prepare('SELECT kind,id,body FROM entities ORDER BY id').all();
const runs=entities.filter(e=>e.kind==='run').map(e=>JSON.parse(e.body));
const active=runs.filter(r=>['running','queued','waiting_user','waiting_node'].includes(r.status));assert.equal(active.length,0,'Leave active user tasks running; do not deploy');
const assets=entities.filter(e=>e.kind==='asset').map(e=>JSON.parse(e.body)).filter(a=>a.status==='ready');
for(const a of assets){assert(/^[a-zA-Z0-9-]+$/.test(a.locator));assert.equal(hash('data/assets/'+a.locator),a.hash);}
const sessions=db.prepare('SELECT hash,created,expires FROM sessions WHERE expires>? ORDER BY hash').all(Date.now());db.close();
const healthResponse=await fetch('http://127.0.0.1:4310/api/health');assert(healthResponse.ok);const health=await healthResponse.json();assert(health.ready);
const configurationHashes=Object.fromEntries(['.env','data/private-model/host.json','data/private-model/chatgpt.json'].filter(existsSync).map(p=>[p,hash(p)]));
const value={at:new Date().toISOString(),phase,health,activeRuns:active.length,counts:{projects:entities.filter(e=>e.kind==='project').length,entities:entities.length,readyAssets:assets.length,sessions:sessions.length},entityHashes:Object.fromEntries(entities.map(e=>[e.id,digest(e.body)])),sessionDigest:digest(sessions),configurationHashes,assetHashesValid:true,modelCalls:runs.reduce((sum,r)=>sum+(r.calls||0),0)};
if(phase==='before')for(const file of ['workbench.stdout.log','workbench.stderr.log'])if(existsSync('.runtime/'+file))writeFileSync(root+'/'+file,readFileSync('.runtime/'+file));
if(phase==='after'){
  const before=JSON.parse(readFileSync(root+'/before.json','utf8'));
  assert.notEqual(value.health.instanceId,before.health.instanceId);
  assert.deepEqual(value.entityHashes,before.entityHashes);assert.deepEqual(value.configurationHashes,before.configurationHashes);assert.equal(value.sessionDigest,before.sessionDigest);assert.equal(value.modelCalls,before.modelCalls);
}
writeFileSync(root+'/'+phase+'.json',JSON.stringify(value,null,2)+'\n');
console.log(JSON.stringify({phase,health,activeRuns:active.length,counts:value.counts,preserved:phase==='after'}));

