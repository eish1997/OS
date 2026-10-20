import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { CanvasService } from '../server/canvas-service.js';

const entry=resolve('apps/canvas/local/desktop-entry.mjs');
const options=(directory:string)=>({entry,directory,origin:'http://canvas-private.invalid',startupMs:5000});

test('supervisor coalesces start, rejects competing owner and restarts after clean stop',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'canvas-supervisor-'));
  const first=new CanvasService(options(directory)),second=new CanvasService(options(directory));
  try {
    const [a,b]=await Promise.all([first.start(),first.start()]);assert.equal(a,b);
    assert.equal(first.state,'ready');assert(first.processId);
    await assert.rejects(second.start(),/did not become ready/);
    await second.stop();await first.stop();assert.equal(first.processId,undefined);
    await second.start();assert.equal(second.state,'ready');
  } finally {await first.stop();await second.stop();}
});

test('startup timeout reaps child and permits explicit retry without retaining its token',async()=>{
  const root=mkdtempSync(join(tmpdir(),'canvas-timeout-')),file=join(root,'unready.mjs');
  writeFileSync(file,'setInterval(()=>{},1000)');
  const service=new CanvasService({...options(join(root,'data')),entry:file,startupMs:150});
  try {await assert.rejects(service.start(),/did not become ready/);await service.stop();assert.equal(service.processId,undefined);}
  finally {await service.stop();}
});

test('explicit restart has a two-attempt bound and coalesces simultaneous requests',async()=>{
  const root=mkdtempSync(join(tmpdir(),'canvas-retry-')),file=join(root,'failure.mjs'),count=join(root,'attempts');
  writeFileSync(file,`import {readFileSync,writeFileSync,existsSync} from 'node:fs';const path=${JSON.stringify(count)};writeFileSync(path,String((existsSync(path)?Number(readFileSync(path,'utf8')):0)+1));process.exit(1);`);
  const service=new CanvasService({...options(join(root,'data')),entry:file});
  try {
    const a=service.restart(),b=service.restart();assert.equal(a,b);
    await assert.rejects(a,/retry limit/);assert.equal(Number(readFileSync(count,'utf8')),2);
    assert.equal(service.processId,undefined);assert.equal(service.state,'failed');
  } finally {await service.stop();}
});

test('host disposal cancels a pending restart and forbids later child resurrection',async()=>{
  const root=mkdtempSync(join(tmpdir(),'canvas-dispose-')),file=join(root,'unready.mjs');
  writeFileSync(file,'setInterval(()=>{},1000)');
  const service=new CanvasService({...options(join(root,'data')),entry:file,startupMs:200});
  const restarting=service.restart();
  const rejected=assert.rejects(restarting);
  await service.dispose();await rejected;
  assert.equal(service.processId,undefined);assert.equal(service.state,'stopped');
  await assert.rejects(service.start(),/disposed/);
});

test('real host death closes private pipe and releases child management ownership', {timeout:20000},async()=>{
  const directory=mkdtempSync(join(tmpdir(),'canvas-host-death-'));
  const parent=spawn(process.execPath,['--import','tsx',resolve('tests/fixtures/canvas-crash-host.ts'),entry,directory],{stdio:['ignore','pipe','pipe'],windowsHide:true});
  let childPid:number|undefined;
  const replacement=new CanvasService(options(directory));
  try {
    const line=await new Promise<string>((accept,reject)=>{
      let value='';const timer=setTimeout(()=>reject(new Error('Host did not start')),6000);
      parent.stdout.on('data',data=>{value+=data.toString();if(value.includes('\n')){clearTimeout(timer);accept(value.split('\n')[0]);}});
      parent.once('error',error=>{clearTimeout(timer);reject(error);});
      parent.once('exit',()=>{clearTimeout(timer);reject(new Error('Host exited before ready'));});
    });
    childPid=JSON.parse(line).childPid;assert(childPid);
    const ended=once(parent,'exit');parent.kill();await ended;
    let gone=false;
    for(let attempt=0;attempt<100;attempt++) {
      try {process.kill(childPid,0);} catch {gone=true;break;}
      await delay(50);
    }
    assert(gone,'canvas child must exit when private host pipe closes');
    await replacement.start();assert.equal(replacement.state,'ready');
  } finally {
    await replacement.stop();
    if(parent.exitCode===null&&parent.signalCode===null){const ended=once(parent,'exit');parent.kill();await ended;}
  }
});

test('second workbench host cannot claim the same canvas management directory',{timeout:30000},async()=>{
  const root=mkdtempSync(join(tmpdir(),'canvas-dual-host-'));
  const packageDir=resolve('.runtime/canvas-workbench-package-090');
  const {createApp}=await import('../server/app.js');
  const first=createApp({dataDir:join(root,'host'),canvasPackageDir:packageDir,password:'dual-lease',schedule:false});
  const second=createApp({dataDir:join(root,'host'),canvasPackageDir:packageDir,password:'dual-lease',schedule:false});
  try{
    await first.canvasService!.start();
    assert.equal(first.canvasService!.state,'ready');
    await assert.rejects(second.canvasService!.start(),/did not become ready/);
    assert.notEqual(second.canvasService!.state,'ready');
    await first.close();
    await second.canvasService!.start();
    assert.equal(second.canvasService!.state,'ready');
  }finally{await first.close().catch(()=>{});await second.close().catch(()=>{});}
});
