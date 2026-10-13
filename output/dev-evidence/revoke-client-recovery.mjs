import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const info=JSON.parse(readFileSync('output/dev-evidence/private/client-recovery-after/info.json','utf8'));
const base='http://127.0.0.1:'+info.backendPort;let cookie='';
async function call(path,data){const res=await fetch(base+'/api'+path,{method:data===undefined?'GET':'POST',headers:{Cookie:cookie,Origin:info.base,'Content-Type':'application/json',Connection:'close'},...(data===undefined?{}:{body:JSON.stringify(data)})});assert(res.ok,path+' '+res.status);return res;}
try {
 const login=await call('/login',{password:info.password});cookie=login.headers.get('set-cookie').split(';')[0];
 const sessions=await (await call('/sessions')).json();const target=sessions.find(s=>!s.current);assert.equal(sessions.length,2);assert(target);await call('/sessions/revoke',{hash:target.hash});
 const snap=await (await call('/snapshot')).json();assert.equal(snap.runs.length,0);assert.equal(snap.drafts.length,2);
 await call('/logout',{});cookie='';
 const resume=await fetch(info.base+'/__fixture/resume',{method:'POST',headers:{Authorization:'Bearer '+info.controlToken,Connection:'close'}});assert(resume.ok);
 const status=await (await fetch(info.base+'/__fixture/status',{headers:{Authorization:'Bearer '+info.controlToken,Connection:'close'}})).json();
 assert.equal(status.writes,0);
 const report={at:new Date().toISOString(),status:'passed',revocationDuringRecovery:true,fixture:status,runs:0,drafts:2,modelRequests:0};writeFileSync('output/dev-evidence/client-recovery-revocation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{if(cookie)await call('/logout',{});}
