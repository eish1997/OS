import {readFileSync,writeFileSync} from 'node:fs';
const lines=readFileSync('.env','utf8').split(/\r?\n/);
const password=lines.find(l=>l.startsWith('WORKBENCH_PASSWORD=')).slice('WORKBENCH_PASSWORD='.length).replace(/^['"]|['"]$/g,'');
const base='http://127.0.0.1:4310';let cookie;
async function request(path,method='GET',data){const r=await fetch(base+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(method==='POST'?{'Content-Type':'application/json',Origin:base}:{})},body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(60000)});if(path==='/api/login'&&r.ok)cookie=r.headers.get('set-cookie').split(';')[0];const body=await r.json();if(!r.ok)throw Error(path+': HTTP '+r.status+' '+String(body.error||'request failed'));return body;}
const report={at:new Date().toISOString()};
try{
 report.health=await request('/api/health');
 await request('/api/login','POST',{password});report.login=true;
 const snapshot=await request('/api/snapshot');report.counts=Object.fromEntries(['projects','assets','drafts','tasks','runs'].map(k=>[k,snapshot[k].length]));
 const status=await request('/api/chatgpt/status');report.modelConnection={connected:status.connected,enabled:status.enabled,model:status.model,limitScope:status.limitScope};
 if(process.argv.includes('--catalog')){try{const models=await request('/api/chatgpt/models','POST',{});report.catalog={ok:true,count:Array.isArray(models)?models.length:models.models?.length};}catch(e){report.catalog={ok:false,error:e.message};}}
 report.backup=await request('/api/backup/status');
 const page=await fetch(base);report.page={status:page.status,html:(await page.text()).includes('/assets/')};
}finally{if(cookie){await request('/api/logout','POST',{});report.temporarySessionRevoked=true;}writeFileSync('output/dev-evidence/migration-058-http.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
