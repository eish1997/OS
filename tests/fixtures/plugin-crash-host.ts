import { writeFileSync } from 'node:fs';
import { Store } from '../../server/store.js';
import { Plugins } from '../../server/plugins.js';
import { inspectPlugin } from '../../server/plugin-packages.js';
import type { PluginAction } from '../../shared/plugins.js';

const [database, source, boundary, marker, registry, requestedAction] = process.argv.slice(2);
const store = new Store(database); const plugins = new Plugins(store, undefined, undefined, { registry });
const action=(requestedAction||'install') as PluginAction;
if(action!=='install') {
  const seed=plugins.state.enqueue({action:'install',source,trusted:true,revision:plugins.state.configuration().revision,commandId:'crash-seed-001'});
  const pkg=await inspectPlugin(source,plugins.agentDir);plugins.state.phase(seed.id,'committing','fixture existing local registration');plugins.state.commit(seed.id,[pkg]);
}
let operationId: string;
const pause = () => {
  writeFileSync(marker, JSON.stringify({ pid: process.pid, boundary, operationId }));
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
};
const phase = plugins.state.phase.bind(plugins.state);
plugins.state.phase = (...args) => {
  const value = phase(...args);
  if (boundary !== 'completed' && args[1] === boundary) pause();
  return value;
};
const commit = plugins.state.commit.bind(plugins.state);
plugins.state.commit = (...args) => {
  const value = commit(...args);
  if (boundary === 'completed') pause();
  return value;
};
operationId=plugins.state.enqueue({ action, source, trusted: true, revision: plugins.state.configuration().revision, commandId: 'crash-install-001' }).id;
plugins.start();
// The test parent kills this host at a durable checkpoint. Keep it alive while
// the unref'd coordinator waits; no production failure injection is required.
setInterval(() => {}, 1000);
