import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const info=JSON.parse(readFileSync('output/dev-evidence/private/client-recovery-after/info.json','utf8'));
const base='http://127.0.0.1:'+info.backendPort;let cookie='';
async function call(path,data){const res=await fetch(base+'/api'+path,{method:data===undefined?'GET':'POST',headers:{Cookie:cookie,Origin:info.base,'Content-Type':'application/json',Connection:'close'},...(data===undefined?{}:{body:JSON.stringify(data)})});assert(res.ok,path+' '+res.status);return res;}
try {
 const login=await call('/login',{password:info.password});cookie=login.headers.get('set-cookie').split(';')[0];
 const before=await (await call('/snapshot')).json();assert.equal(before.runs.length,0);const project=before.projects.find(p=>p.name==='断线恢复验证');assert(project);
 const draft=await (await call('/drafts',{projectId:project.id,title:'断线期间保存的草稿',body:'服务端新内容应在重新连接后出现。',sourceIds:[]})).json();
 const after=await (await call('/snapshot')).json();assert.equal(after.drafts.length,1);assert.equal(after.runs.length,0);
 const report={at:new Date().toISOString(),status:'passed',projectId:project.id,draftId:draft.id,modelRequests:0,runs:0,scope:'Own synthetic backend, separate temporary session, no browser cookie reuse'};
 await call('/logout',{});cookie='';
 const resume=await fetch(info.base+'/__fixture/resume',{method:'POST',headers:{Authorization:'Bearer '+info.controlToken,Connection:'close'}});assert(resume.ok);
 writeFileSync('output/dev-evidence/client-recovery-backend-seed.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{if(cookie)await call('/logout',{});}
