import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {config} from '../server/config.js';
const mode=process.argv[2];if(!['before','after'].includes(mode))throw new Error('Pass before or after');
const base='http://127.0.0.1:4310';
const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:config.password})});if(!login.ok)throw new Error('Local authentication failed');const cookie=login.headers.get('set-cookie')!.split(';')[0];
try{
  const response=await fetch(base+'/api/snapshot',{headers:{Cookie:cookie}});if(!response.ok)throw new Error('Snapshot unavailable');const snapshot=await response.json();
  const active=snapshot.runs.filter((r:any)=>['queued','running','waiting_user','waiting_node'].includes(r.status));if(active.length)throw new Error(`${active.length} active runs; do not restart`);
  const fields=['projects','summaries','tasks','runs','assets','memories','drafts','inbox','nodes'];const digest=Object.fromEntries(fields.map(key=>[key,{count:snapshot[key].length,sha256:createHash('sha256').update(JSON.stringify(snapshot[key])).digest('hex')}]));
  const health=await(await fetch(base+'/api/health')).json();const report={at:new Date().toISOString(),health,digest,modelConfigured:snapshot.config.modelConfigured,model:snapshot.config.model,activeRuns:active.length};
  const root=(process.env.WORKBENCH_QA_ROOT||'output/dev-evidence/workbench')+'/deployment'+(process.argv[3]==='final'?'/final':'');mkdirSync(root,{recursive:true});writeFileSync(`${root}/${mode}.json`,JSON.stringify(report,null,2));
  if(mode==='after'){const before=JSON.parse(readFileSync(`${root}/before.json`,'utf8'));if(JSON.stringify(before.digest)!==JSON.stringify(digest))throw new Error('Business data digest changed; inspect evidence before continuing');}
  console.log(JSON.stringify({mode,health,counts:Object.fromEntries(fields.map(key=>[key,digest[key].count])),modelConfigured:report.modelConfigured,model:report.model,unchanged:mode==='after'?true:undefined}));
}finally{await fetch(base+'/api/logout',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:'{}'});}
