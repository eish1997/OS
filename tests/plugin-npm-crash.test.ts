import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fork, execFile } from 'node:child_process';
import { once } from 'node:events';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Store } from '../server/store.js';
import { PluginState } from '../server/plugin-state.js';
import { originalProcessGone, processBirth, type ProcessBirth } from '../server/process-birth.js';

function tar(files: Record<string,string>) {
  const chunks:Buffer[]=[];
  for(const [name,content] of Object.entries(files)) {
    const bytes=Buffer.from(content);const header=Buffer.alloc(512);
    header.write(`package/${name}`);header.write('0000644\0',100);header.write('0000000\0',108);header.write('0000000\0',116);
    header.write(bytes.length.toString(8).padStart(11,'0')+'\0',124);header.write('00000000000\0',136);header.fill(32,148,156);header.write('0',156);header.write('ustar\0',257);header.write('00',263);
    header.write(header.reduce((sum,value)=>sum+value,0).toString(8).padStart(6,'0')+'\0 ',148);
    chunks.push(header,bytes,Buffer.alloc((512-bytes.length%512)%512));
  }
  return gzipSync(Buffer.concat([...chunks,Buffer.alloc(1024)]));
}

test('killing the host during an actual npm install terminates the worker and lifecycle descendant', {timeout:45000}, async()=>{
  const root=mkdtempSync(join(tmpdir(),'plugin npm host death '));const marker=join(root,'install-pid.json');const heartbeat=join(root,'heartbeat');
  const name='workbench-plugin-crash-probe';
  const bytes=tar({
    'package.json':JSON.stringify({name,version:'1.0.0',scripts:{postinstall:'node install.cjs'},pi:{extensions:['tool.js']}}),
    'tool.js':'exports.default=()=>{}',
    'install.cjs':`const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(marker)},JSON.stringify({pid:process.pid}));setInterval(()=>fs.appendFileSync(${JSON.stringify(heartbeat)},'.'),100);setTimeout(()=>process.exit(0),30000);`
  });
  let base='';const registry=createServer((req,res)=>{
    if(req.url==='/package.tgz'){res.end(bytes);return;}
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({name,'dist-tags':{latest:'1.0.0'},versions:{'1.0.0':{name,version:'1.0.0',scripts:{postinstall:'node install.cjs'},dist:{tarball:base+'/package.tgz',integrity:'sha512-'+createHash('sha512').update(bytes).digest('base64')}}}}));
  });
  await new Promise<void>(done=>registry.listen(0,'127.0.0.1',done));base=`http://127.0.0.1:${(registry.address() as {port:number}).port}`;
  const database=join(root,'data','workbench.sqlite');
  const child=fork(resolve('tests/fixtures/plugin-crash-host.ts'),[database,`npm:${name}@1.0.0`,'during-install',join(root,'unused'),base],{execArgv:['--import','tsx'],stdio:'ignore'});
  let descendant:number|undefined;let birth:ProcessBirth|undefined;let worker:number|undefined;let workerBirth:ProcessBirth|undefined;
  try {
    const deadline=Date.now()+20000;
    while((!existsSync(marker)||!existsSync(heartbeat))&&Date.now()<deadline&&child.exitCode===null) await delay(100);
    assert(existsSync(marker)&&existsSync(heartbeat),'actual lifecycle script must be running before killing host');
    descendant=JSON.parse(readFileSync(marker,'utf8')).pid;birth=processBirth(descendant!);assert(birth);
    const store=new Store(database);
    try{const op=new PluginState(store).operations()[0];assert.equal(op.phase,'applying');worker=op.workerPid;workerBirth=JSON.parse(op.workerBirth!);assert(worker);}finally{store.close();}
    assert.equal(originalProcessGone(descendant!,birth),false);
    const exit=once(child,'exit');child.kill('SIGKILL');await exit;
    const stopped=Date.now()+10000;
    while(Date.now()<stopped && (!originalProcessGone(descendant!,birth)||!originalProcessGone(worker!,workerBirth))) await delay(200);
    const record=join(root,'data','plugins','worker-recovery.json');
    assert(originalProcessGone(descendant!,birth),`npm lifecycle descendant must exit after host death; workerGone=${originalProcessGone(worker!,workerBirth)}, heartbeatBytes=${readFileSync(heartbeat).length}, recovery=${existsSync(record)?readFileSync(record,'utf8'):'absent'}`);
    assert(originalProcessGone(worker!,workerBirth),'management worker must exit after host death');
    const before=readFileSync(heartbeat,'utf8');await delay(400);assert.equal(readFileSync(heartbeat,'utf8'),before);
  } finally {
    if(child.exitCode===null&&child.signalCode===null){const exit=once(child,'exit');child.kill('SIGKILL');await exit;}
    for(const [pid,identity] of [[worker,workerBirth],[descendant,birth]] as const) if(pid&&identity&&!originalProcessGone(pid,identity)) {
      if(process.platform==='win32') await new Promise<void>(done=>execFile('taskkill',['/PID',String(pid),'/T','/F'],{windowsHide:true},()=>done()));
      else try{process.kill(pid,'SIGKILL');}catch{}
    }
    await new Promise<void>(done=>registry.close(()=>done()));rmSync(root,{recursive:true,force:true});
  }
});
