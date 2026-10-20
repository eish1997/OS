import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import type { Policy, Run } from '../shared/contracts.js';
import { nativePiTools } from '../shared/pi-tools.js';
import { inspectPlugin } from '../server/plugin-packages.js';

test('production Pi worker binds plugins, holds the environment through exit and rejects changed continuation', { timeout: 45000 }, async () => {
  const before = { ...config };
  Object.assign(config, { apiKey: 'offline-plugin-probe', provider: 'openai', model: 'gpt-5.6-sol', maxCalls: 1, budgetUsd: 1, reservePerCallUsd: .1 });
  const root = mkdtempSync(join(tmpdir(), 'plugin execution ')); const source = join(root, 'source'); mkdirSync(source);
  writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'command-probe', pi: { extensions: ['command.mjs'] } }));
  writeFileSync(join(source, 'command.mjs'), `import {writeFileSync,existsSync} from 'node:fs'; import {join} from 'node:path';
export default pi=>{
 pi.on('session_start',()=>pi.registerTool({name:'dynamic_probe',label:'Probe',description:'Probe',parameters:{type:'object',properties:{}},execute:async()=>({content:[{type:'text',text:'ok'}],details:{}})}));
 pi.registerCommand('probe',{description:'Write exact arguments',handler:async(args,ctx)=>{
   pi.registerTool({name:'late_probe',label:'Late probe',description:'Registered after initial catalog',parameters:{type:'object',properties:{}},execute:async()=>({content:[{type:'text',text:'late'}],details:{}})});
   writeFileSync(join(ctx.cwd,'plugin-args.txt'),args);
   if(args.startsWith('exact')){writeFileSync(join(ctx.cwd,'plugin-running'),'running');while(!existsSync(join(ctx.cwd,'plugin-release')))await new Promise(r=>setTimeout(r,30));}
 }});
 pi.on('session_shutdown',(_,ctx)=>writeFileSync(join(ctx.cwd,'plugin-shutdown.txt'),'clean'));
};`);
  const app = createApp({ dataDir: join(root, 'data'), password: 'plugin-execution-password', schedule: false });
  await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
  try {
    const state = app.plugins.state;
    const op = state.enqueue({ action: 'install', source, revision: state.configuration().revision, commandId: 'execution-install-001', trusted: true });
    const pkg = await inspectPlugin(source, app.plugins.agentDir); state.phase(op.id, 'committing', 'Test local inspection'); state.commit(op.id, [pkg]);
    state.configure(state.configuration().revision, pkg.id, true);
    const project = app.service.createProject('插件真实执行验证');
    const policy: Policy = { version: 8, projectId: project.id, toolNames: [...nativePiTools], allowModel: true, modelBinding: app.modelAccess.settings().binding, maxCalls: 1, maxCostUsd: 1, reservePerCallUsd: .1, maxOutputTokens: 64, timeoutMs: 12000 };
    const submitted = app.service.submit(project.id, '/probe exact user arguments', 'plugin-command-run', 'pi', policy, [], undefined, { view: 'project' }, null);
    const cwd = join(root, 'data', 'workspaces', project.id);
    const started=Date.now()+12000;
    while(!existsSync(join(cwd,'plugin-running'))&&Date.now()<started){app.scheduler.tick();await delay(50);}
    assert(existsSync(join(cwd,'plugin-running')),'real worker must hold an executing command');
    const beforeRevision=state.configuration().environmentRevision;
    const update=state.enqueue({action:'update',source,revision:state.configuration().revision,commandId:'execution-update-001',trusted:true});app.plugins.tick();
    assert.equal(state.operations().find(o=>o.id===update.id)?.phase,'waiting_for_environment');
    assert.equal(app.plugins.mutating,false);
    const queued=app.service.submit(project.id,'/probe next execution','plugin-command-queued','pi',policy,[],undefined,{view:'project'},null);
    app.scheduler.tick();assert.equal(app.store.get<Run>('run',queued.run.id).status,'queued');
    assert.equal(state.configuration().environmentRevision,beforeRevision);
    writeFileSync(join(cwd,'plugin-release'),'release');
    const waitRun = async (id: string) => {
      const deadline = Date.now() + 16000;
      while (Date.now() < deadline) {
        app.scheduler.tick(); const current = app.store.get<Run>('run', id);
        if (['completed', 'failed', 'interrupted'].includes(current.status) && !app.scheduler.pluginMaintenanceBlocked()) return current;
        await delay(80);
      }
      throw new Error('Pi worker did not reach terminal state and exit');
    };
    const run = await waitRun(submitted.run.id);
    assert.equal(run.status, 'completed', run.error ?? 'plugin run'); assert.equal(run.calls, 0);
    assert.equal(run.pluginManifest?.packages[0].id, pkg.id);
    assert(run.pluginTools?.some(t => t.name === 'dynamic_probe'));
    assert(run.pluginTools?.some(t => t.name === 'late_probe' && t.source === join(source,'command.mjs')));
    assert.equal(readFileSync(join(cwd, 'plugin-args.txt'), 'utf8'), 'exact user arguments');
    assert(existsSync(join(cwd, 'plugin-shutdown.txt')));
    assert.equal(state.snapshot().configuration.packages[0].lastLoad?.runId, run.id);
    const updateDeadline=Date.now()+15000;
    while(Date.now()<updateDeadline&&state.operations().find(o=>o.id===update.id)?.phase!=='completed') {app.plugins.tick();app.scheduler.tick();await delay(80);}
    assert.equal(state.operations().find(o=>o.id===update.id)?.phase,'completed');
    const subsequent=await waitRun(queued.run.id);assert.equal(subsequent.status,'completed');
    assert.equal(subsequent.pluginManifest?.environmentRevision,beforeRevision+1);
    assert.equal(app.store.get<Run>('run',run.id).pluginManifest?.environmentRevision,beforeRevision);
    state.configure(state.configuration().revision, pkg.id, false);
    const continued = app.service.submit(project.id, '/probe again', 'plugin-command-changed', 'pi', policy, [], undefined, { view: 'project' }, run.id);
    const rejected = await waitRun(continued.run.id);
    assert.equal(rejected.status, 'failed'); assert.match(rejected.error ?? '', /插件环境已变化/); assert.equal(rejected.calls, 0);
    writeFileSync(join(source,'command.mjs'),"export default pi=>pi.on('session_start',()=>{throw new Error('PLUGIN_LOAD_PROBE_FAILURE')})");
    state.configure(state.configuration().revision,pkg.id,true);
    const failed=app.service.submit(project.id,'/probe load failure','plugin-command-load-failure','pi',policy,[],undefined,{view:'project'},null);
    const failedRun=await waitRun(failed.run.id);assert.equal(failedRun.status,'failed');assert.equal(failedRun.calls,0);
    const load=state.snapshot().configuration.packages[0].lastLoad;assert.equal(load?.runId,failedRun.id);assert(load?.error);
  } finally { await app.close(); Object.assign(config, before); rmSync(root, { recursive: true, force: true }); }
});
