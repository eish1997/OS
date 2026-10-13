// Measure real HTTP availability during synchronous maintenance in a separate
// owned process. Synthetic data only; no model calls or production data access.
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.js';

if (process.argv[2] === '--owned-child') {
  const id = process.argv[3]; assert(/^[-a-f0-9]{36}$/.test(id)); assert.equal(process.platform, 'win32');
  const source = resolve('output/dev-evidence/private/performance-' + id);
  const root = join(process.env.USERPROFILE!, 'AI-OS-Backups', 'performance-probes', id);
  assert.equal(source[0].toUpperCase(), 'E'); assert.equal(root[0].toUpperCase(), 'C');
  const password=randomUUID();let clock=Date.now();
  const app = createApp({ dataDir: source, password, schedule: false, backup: { root,retainCount:2,now:()=>clock } });
  const project = app.service.createProject('合成容量维护测量');
  const buffer = Buffer.alloc(8 * 1024 ** 2, 0x71);
  for (let index = 0; index < 48; index++) {
    buffer.writeUInt32LE(index, 0);
    const upload = app.assets.begin(project.id, `synthetic-${index}.bin`, 'application/octet-stream');
    app.assets.commit(upload.id, buffer);
  }
  await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
  // Validate location and permissions without racing the scheduled first tick.
  await app.automaticBackup.start(); await app.automaticBackup.stop(); assert(app.automaticBackup.status().enabled);
  app.scheduler.start();let step=0;
  process.on('message', async message => {
    if (message === 'backup' && step<3) {
      if(step)clock+=86400001;step++;const start = performance.now(); await app.automaticBackup.tick();
      const status = app.automaticBackup.status();
      assert(status.lastSuccessAt && status.restoreCheckedAt && !status.error);
      process.send!({ kind: 'done',step,backupMs: performance.now() - start,status,httpProcessMaxRssKiB:process.resourceUsage().maxRSS });
    } else if (message === 'close') { await app.close(); process.disconnect!(); }
  });
  process.send!({ kind: 'ready',base:`http://127.0.0.1:${(app.server.address() as {port:number}).port}`,source,root,assets:48,assetBytes:48*buffer.length,projectId:project.id,password });
} else {
  const file = 'output/dev-evidence/backup-performance.json'; mkdirSync('output/dev-evidence', { recursive: true });
  if (existsSync(file)) { mkdirSync('output/dev-evidence/performance-history', { recursive: true }); copyFileSync(file, `output/dev-evidence/performance-history/${Date.now()}.json`); }
  const report: Record<string, unknown> = { status: 'running', at: new Date().toISOString(), modelRequests: 0, scope: 'Own 384 MiB binary assets on E, actual independent C backup, actual child HTTP; production unchanged', interpretation: 'A measured workload, not full capacity/production acceptance' };
  const save = () => writeFileSync(file, JSON.stringify(report, null, 2)); save();
  const child = fork(fileURLToPath(import.meta.url), ['--owned-child', randomUUID()], { execArgv: ['--import', 'tsx'], windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  let exited = false; let errorOutput = ''; child.stderr!.on('data', chunk => { errorOutput = (errorOutput + String(chunk)).slice(-2000); });
  const exit = new Promise<void>((done, reject) => child.once('exit', code => { exited = true; code === 0 ? done() : reject(new Error('Owned benchmark child failed: ' + code + ' ' + errorOutput)); }));
  void exit.catch(() => {});
  function message(kind: string): Promise<any> {
    return new Promise((done, reject) => {
      const timer = setTimeout(() => finish(new Error('Owned benchmark observation timeout; no restart')), 180000);
      const receive = (value: any) => { if (value?.kind === kind) finish(undefined, value); };
      const failed = (code: number | null) => finish(new Error('Owned child exited before ' + kind + ': ' + code));
      function finish(error?: Error, value?: unknown) { clearTimeout(timer); child.off('message', receive); child.off('exit', failed); error ? reject(error) : done(value); }
      child.on('message', receive); child.on('exit', failed);
    });
  }
  try {
    const {password,...ready}=await message('ready');Object.assign(report,ready);delete report.kind;save();
    const login=await fetch(ready.base+'/api/login',{method:'POST',headers:{Connection:'close','Content-Type':'application/json'},body:JSON.stringify({password})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie')!.split(';')[0];
    const request = async () => { const start = performance.now(); const response = await fetch(ready.base + '/api/snapshot', { headers: { Connection: 'close',Cookie:cookie }, signal: AbortSignal.timeout(150000) }); assert.equal(response.status, 200);await response.arrayBuffer();return performance.now()-start; };
    const baseline: number[] = []; for (let index = 0; index < 10; index++) baseline.push(await request());
    const phases:any[]=[];let ownRunId='';
    for(let step=1;step<=3;step++){
      let finished=false;let result:any;const completion=message('done').then(value=>{result=value;finished=true;});child.send('backup');const during:number[]=[];
      if(step===1){
        const deadline=Date.now()+10000;let running=false;while(Date.now()<deadline){const status=await fetch(ready.base+'/api/backup/status',{headers:{Cookie:cookie,Connection:'close'}});assert.equal(status.status,200);if((await status.json() as {running?:boolean}).running){running=true;break;}await new Promise(done=>setTimeout(done,5));}assert(running);
        const response=await fetch(ready.base+'/api/tasks',{method:'POST',headers:{Cookie:cookie,Connection:'close','Content-Type':'application/json'},body:JSON.stringify({projectId:ready.projectId,mode:'fixture',commandId:randomUUID(),requestedTools:['write_asset','create_draft'],goal:'运行固定资料计算，保存报告、图表和文章草稿'})});assert.equal(response.status,202);const accepted=await response.json() as {run:{id:string;status:string}};assert.equal(accepted.run.status,'queued');ownRunId=accepted.run.id;report.taskQueuedDuringMaintenance=true;
      }
      do{during.push(await request());if(!finished)await new Promise(done=>setTimeout(done,10));}while(!finished);await completion;assert(during.length>0);
      phases.push({step,backupMs:result.backupMs,requests:during.length,maxHttpMs:Math.max(...during),httpMs:during,status:result.status,httpProcessMaxRssKiB:result.httpProcessMaxRssKiB});
      if(step===1){const deadline=Date.now()+15000;let complete=false;while(Date.now()<deadline){const response=await fetch(ready.base+'/api/snapshot',{headers:{Cookie:cookie,Connection:'close'}});assert.equal(response.status,200);const value=await response.json() as {runs:{id:string;status:string;calls:number;workerPid?:number}[]};const run=value.runs.find(r=>r.id===ownRunId)!;if(run.status==='completed'){assert.equal(run.calls,0);assert(run.workerPid);try{process.kill(run.workerPid,0);}catch(error){assert(error instanceof Error&&'code'in error&&error.code==='ESRCH');complete=true;break;}}else assert(['queued','running'].includes(run.status));await new Promise(done=>setTimeout(done,25));}assert(complete);await new Promise(done=>setTimeout(done,100));report.queuedTaskCompletedAfterMaintenance=true;}
    }
    assert.equal(phases[2].status.retained,2);assert.equal(phases[2].status.pruned,1);
    report.baselineHttpMs=baseline;report.phases=phases;report.maxBaselineMs=Math.max(...baseline);report.maxMaintenanceMs=Math.max(...phases.map(p=>p.maxHttpMs));report.httpStallObserved=Number(report.maxMaintenanceMs)>Math.max(500,Math.max(...baseline)*5);
    report.endpoint='/api/snapshot';report.mainProcessRssExcludesBackupWorker=true;report.retentionUsesControlledDailyDueTimes=true;
    report.status = 'measured'; report.at = new Date().toISOString(); save();
    child.send('close'); await exit; report.ownedChildExited = true; save(); console.log(JSON.stringify({status:report.status,maxMaintenanceMs:report.maxMaintenanceMs,httpStallObserved:report.httpStallObserved,phases:phases.map(({httpMs,...phase})=>phase),taskQueuedDuringMaintenance:report.taskQueuedDuringMaintenance,queuedTaskCompletedAfterMaintenance:report.queuedTaskCompletedAfterMaintenance,ownedChildExited:report.ownedChildExited}));
  } catch (error) { report.status = 'failed'; report.reason = error instanceof Error ? error.message : 'Benchmark failed'; save(); throw error; }
  finally { if (!exited) { child.kill(); await exit.catch(() => {}); } }
}
