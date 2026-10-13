import {spawn} from 'node:child_process';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {probeChatGPTTransferCrash} from '../../scripts/probe-chatgpt-transfer-crash.ts';
const privateRoot=resolve('output/dev-evidence/private');mkdirSync(privateRoot,{recursive:true});
const root=mkdtempSync(join(privateRoot,'transfer-lock-diagnosis-')),events:any[]=[],pending=new Set<Promise<void>>(),attempts:any[]=[];
const env=Object.fromEntries(['SystemRoot','PATH','TEMP','TMP','USERPROFILE'].filter(k=>process.env[k]).map(k=>[k,process.env[k]!]));let stopping=false;
const churn=()=>{
 if(stopping)return;const child=spawn(process.execPath,['--eval','setTimeout(()=>{},250)'],{env,windowsHide:true,stdio:'ignore'});
 let terminal:Promise<void>;terminal=new Promise<void>((done,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>{events.push({pid:child.pid,code,signal,at:new Date().toISOString()});done();});});pending.add(terminal);
 void terminal.then(()=>{pending.delete(terminal);churn();});
};
for(let i=0;i<4;i++)churn();
try{for(let i=1;i<=5;i++){
 const directory=join(root,'attempt-'+i);mkdirSync(directory);
 try{const report=await probeChatGPTTransferCrash(directory);attempts.push({attempt:i,status:'passed',report});console.log('attempt '+i+': passed');}
 catch(error){attempts.push({attempt:i,status:'failed',message:error instanceof Error?error.message:'unknown',diagnostic:(error as any)?.diagnostic});console.log('attempt '+i+': failed; diagnosis preserved');break;}
}}finally{stopping=true;await Promise.all([...pending]);}
const failed=attempts.some(a=>a.status==='failed'),result={at:new Date().toISOString(),status:failed?'failure-reproduced':'not-reproduced',attempts,churnProcesses:events.length,churnEvents:events,allChurnProcessesTerminal:true,syntheticProviderOnly:true,modelRequests:0};
writeFileSync(resolve('output/dev-evidence/transfer-lock-diagnosis.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,attempts:attempts.length,churnProcesses:events.length,allChurnProcessesTerminal:true}));
