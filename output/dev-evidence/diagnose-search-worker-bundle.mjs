import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,realpathSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildSync} from 'esbuild';
const previous=JSON.parse(readFileSync('output/dev-evidence/search-performance.json','utf8'));
assert.equal(previous.status,'measured');const profile=previous.profiles.find(p=>p.profile==='full');assert(profile.ownedChildExited);
assert.equal(await fetch(profile.base+'/api/health',{signal:AbortSignal.timeout(3000)}).then(()=>false).catch(e=>e.cause?.code==='ECONNREFUSED'),true);
const source=resolve(profile.source);assert.equal(realpathSync(source),source);assert(source.startsWith(resolve('output/dev-evidence/private/mixed-')));
const root=resolve('output/dev-evidence/private/bundle-diagnosis-'+randomUUID());mkdirSync(root);const bundled=join(root,'search-worker.mjs');
buildSync({entryPoints:['server/search-worker.ts'],bundle:true,format:'esm',platform:'node',target:'node24',outfile:bundled,logLevel:'silent'});
const env=Object.fromEntries(['SystemRoot','USERPROFILE','TEMP','TMP','PATH','APPDATA','LOCALAPPDATA','HOME','LANG','TZ'].flatMap(k=>process.env[k]===undefined?[]:[[k,process.env[k]]]));
const primary=await(await fetch('http://127.0.0.1:4310/api/health')).json();const report={status:'running',at:new Date().toISOString(),modelRequests:0,profile:profile.profile,source,projectId:profile.projectId,primaryBefore:primary,root,bundleSha256:createHash('sha256').update(readFileSync(bundled)).digest('hex'),samples:[]};const file=resolve('output/dev-evidence/search-worker-bundle-diagnosis.json');const save=()=>writeFileSync(file,JSON.stringify(report,null,2));save();
let expected;
for(let index=0;index<6;index++){
 const mode=index%2?'bundle':'tsx',at=performance.now();let receipt,stderr='';
 const child=fork(mode==='bundle'?bundled:resolve('server/search-worker.ts'),[],{env,execArgv:mode==='bundle'?[]:['--import',pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href],windowsHide:true,stdio:['ignore','ignore','pipe','ipc']});
 const timer=setTimeout(()=>child.kill(),30000);child.stderr.on('data',v=>stderr=(stderr+String(v)).slice(-1000));child.on('message',v=>receipt=v);
 const exited=new Promise((done,reject)=>{child.once('exit',code=>{clearTimeout(timer);code===0?done():reject(new Error('Owned worker exited '+code+': '+stderr));});child.once('error',reject);});
 child.send({database:join(source,'workbench.sqlite'),projectId:profile.projectId,query:'CAPACITY_LARGE_NEEDLE',offset:0,limit:50});await exited;
 const ms=performance.now()-at;assert.equal(receipt.type,'completed');assert.equal(receipt.result.page.total,119);assert.equal(receipt.result.page.items.length,50);assert.equal(receipt.result.page.issues.length,0);assert.equal(receipt.result.repairs.length,0);
 if(!expected)expected=receipt.result;else assert.deepEqual(receipt.result,expected);
 report.samples.push({index,mode,ms,total:119,items:50,exactReceiptMatched:true,ownedChildExited:true});save();console.log(JSON.stringify(report.samples.at(-1)));
}
report.primaryAfter=await(await fetch('http://127.0.0.1:4310/api/health')).json();assert.deepEqual(report.primaryAfter,primary);report.primaryIdentityUnchanged=true;report.status='measured';save();
