import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import {config} from '../../server/config.ts';
const root=process.cwd(),base='http://127.0.0.1:4310',sha=(v:any)=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex');
const sessions=()=>{const db=new DatabaseSync(join(config.dataDir,'workbench.sqlite'),{readOnly:true});try{const rows=db.prepare('SELECT hash,created,expires FROM sessions ORDER BY hash').all();return {count:rows.length,fingerprint:sha(rows)};}finally{db.close();}};
const manifest=()=>JSON.parse(readFileSync(join(root,'.runtime/local-service-workbench.json'),'utf8').replace(/^\uFEFF/,''));
let cookie='';
const request=async(path:string,method='GET',body?:any)=>{const res=await fetch(base+path,{method,headers:{Cookie:cookie,Connection:'close',Origin:base,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});if(!res.ok)throw new Error(`Local observation ${path}: ${res.status}`);return res;};
const json=async(path:string)=> (await request(path)).json();
const beforeFile=join(root,'output/dev-evidence/automatic-offsite-production-before.json');
const after=process.argv.includes('--after');
const original=sessions();
try{
 const login=await request('/api/login','POST',{password:config.password});cookie=login.headers.get('set-cookie')!.split(';')[0];
 const health=await json('/api/health');const m=manifest();assert.equal(health.pid,m.pid);assert.equal(health.launchId,m.launchId);assert.equal(health.ready,true);
 const snapshot=await json('/api/snapshot');assert.equal(snapshot.runs.filter((r:any)=>['queued','running','waiting_user','waiting_node'].includes(r.status)||(r.status==='interrupted'&&!r.error?.includes('已对账'))).length,0);assert.equal(snapshot.operations.filter((o:any)=>['started','unknown'].includes(o.state)).length,0);
 const c=await json('/api/chatgpt/status');const connection=Object.fromEntries(['connected','enabled','model','limitsMode','welcomePending'].map(k=>[k,c[k]]));assert.equal(c.connected,true);assert.equal(c.enabled,true);assert.equal(c.limitsMode,'automatic');
 let backup=await json('/api/backup/status');for(let i=0;backup.checking&&i<100;i++){await new Promise(r=>setTimeout(r,100));backup=await json('/api/backup/status');}assert.equal(backup.checking,false);assert.equal(Boolean(backup.running),false);assert.equal(backup.enabled,true);
 const bytes=Buffer.from(await (await request('/api/drafts/48caf074-0b65-49d6-8d90-348a0ee6edad/export')).arrayBuffer());assert.equal(bytes.equals(readFileSync(join(root,'output/dev-evidence/content-final-draft.md'))),true);
 const runs=JSON.parse(JSON.stringify(snapshot.runs.map((r:any)=>({id:r.id,calls:r.calls,settled:r.modelCallsSettled,reported:r.modelCallsReported,usage:r.usage})).sort((a:any,b:any)=>a.id.localeCompare(b.id))));
 const report:any={status:after?'passed':'preflight-passed',at:new Date().toISOString(),modelRequests:0,health,connection,backup,sessions:original,runs,canonicalDraftSha256:sha(bytes),service:{...health,creationUtc:m.creationUtc,owner:m.owner,url:m.url,workspace:m.workspace}};
 if(after){const before=JSON.parse(readFileSync(beforeFile,'utf8'));assert.deepEqual(connection,before.connection);assert.deepEqual(runs,before.runs);const rotation=JSON.parse(readFileSync(join(root,'output/dev-evidence/private/browser-session-rotation.json'),'utf8'));const expected=[...rotation.otherSessions,rotation.replacement].sort((a:any,b:any)=>a.hash.localeCompare(b.hash));assert.equal(original.count,31);assert.equal(original.fingerprint,sha(expected));assert.deepEqual(original,before.sessions);report.currentBrowserSessionReplaced=false;report.preservedUserSessions=31;report.preservedOtherUserSessions=rotation.otherSessions.length;for(const k of ['lastSuccessAt','restoreCheckedAt','nextDueAt','intervalHours','retainCount','retained','pruned'])assert.deepEqual(backup[k],before.backup[k]);report.canonicalDraftPreserved=true;report.callCountersUnchanged=true;report.sessionFingerprintPreserved=true;report.totalUserSessions=original.count;report.verification='verification/report.json';delete report.runs;}
 await request('/api/logout','POST',{});cookie='';assert.deepEqual(sessions(),original);report.ownLoginRetired=true;
 writeFileSync(after?join(root,'output/dev-evidence/automatic-offsite-production.json'):beforeFile,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,modelRequests:0,userSessions:original.count,automatic:c.limitsMode==='automatic',service:report.service}));
}finally{if(cookie)await request('/api/logout','POST',{});}







