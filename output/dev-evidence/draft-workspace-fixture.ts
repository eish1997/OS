import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createApp} from '../../server/app.js';
import {config} from '../../server/config.js';
import type {Draft} from '../../shared/contracts.js';
// Synthetic local-only UI fixture. No user's credentials, data, or model calls.
config.apiKey='';config.model='';config.maxCalls=0;config.budgetUsd=0;config.backupDir=undefined;config.offsite=undefined;
const directory=mkdtempSync(join(tmpdir(),'工作台 草稿046 '));
const app=createApp({dataDir:directory,password:'synthetic-draft-046-password',schedule:false});
const a=app.service.createProject('草稿工作区验证 A','仅非敏感合成输入，用于编辑与恢复验证');
const b=app.service.createProject('草稿工作区验证 B','验证独立草稿选择');
const source=app.assets.write(a.id,'来源046.md','text/markdown','固定来源\r\n合计60，平均15。\r\n');
const first=app.service.draft(a.id,'第一篇046','原文一',[source.id]);
await new Promise(r=>setTimeout(r,5));
const second=app.service.draft(a.id,'第二篇046','原文二',[source.id]);
app.service.draft(b.id,'B项目046','B原文',[]);
let hold=false;let pending:(()=>void)|undefined;
const original=app.server.listeners('request')[0] as (...args:any[])=>void;
app.server.removeAllListeners('request');
app.server.on('request',(req,res)=>{
 if(hold&&req.method==='PATCH'&&req.url===`/api/drafts/${first.id}`){hold=false;pending=()=>original.call(app.server,req,res);console.log('held-first-save');return;}
 original.call(app.server,req,res);
});
await new Promise<void>(r=>app.server.listen(0,'localhost',r));
// Separate cookie host so test login cannot replace the user's production login.
const origin=`http://localhost:${(app.server.address() as {port:number}).port}`;config.origin=origin;
const manifest={at:new Date().toISOString(),pid:process.pid,origin,directory,a:a.id,b:b.id,first:first.id,second:second.id,source:source.id,modelRequests:0};
writeFileSync('output/dev-evidence/draft-workspace-fixture.json',JSON.stringify(manifest,null,2));
console.log(JSON.stringify({status:'ready',...manifest}));
let seq=0;
writeFileSync('output/dev-evidence/draft-workspace-control.json',JSON.stringify({seq,command:''}));
const monitor=setInterval(()=>{
 let instruction:{seq:number;command:string};try{instruction=JSON.parse(readFileSync('output/dev-evidence/draft-workspace-control.json','utf8'));}catch{return;}
 if(instruction.seq<=seq)return;seq=instruction.seq;const command=instruction.command;
 if(command==='hold'){hold=true;console.log('hold-ready');}
 if(command==='release'){pending?.();pending=undefined;console.log('released');}
 if(command==='conflict'){const d=app.store.get<Draft>('draft',first.id);app.service.updateDraft(d.id,d.revision,d.title,'外部版本046');console.log('conflict-created');}
 if(command==='inspect'){console.log(JSON.stringify({drafts:app.store.list<Draft>('draft').map(d=>({id:d.id,title:d.title,body:d.body,revision:d.revision})),models:app.store.list('run').length}));}
 if(command==='stop'){clearInterval(monitor);pending?.();void app.close().then(()=>{console.log('fixture-stopped');process.exit(0);});}
},100);
