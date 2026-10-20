import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.js';
import { PluginEnvironmentGate, PluginState } from '../server/plugin-state.js';
import { assertPluginDestination, inspectPlugin, pluginSource } from '../server/plugin-packages.js';
import type { PluginPackage } from '../shared/plugins.js';

test('whole environment gate blocks new readers for waiting install and releases only the owner', () => {
  const gate = new PluginEnvironmentGate();
  assert(gate.acquireRead('run-a')); assert(gate.acquireRead('run-b'));
  assert.equal(gate.requestWrite('install'), false);
  assert.equal(gate.acquireRead('run-c'), false);
  gate.releaseRead('run-a'); assert.equal(gate.requestWrite('install'), false);
  gate.releaseRead('run-b'); assert(gate.requestWrite('install'));
  gate.releaseWrite('foreign'); assert.equal(gate.acquireRead('run-c'), false);
  gate.releaseWrite('install'); assert(gate.acquireRead('run-c'));
});

test('source identities unify versions and reject credentials and relative server paths', () => {
  assert.equal(pluginSource('npm:@example/pkg@1.0.0').id, pluginSource('npm:@example/pkg@2.0.0').id);
  assert.equal(pluginSource('git:github.com/example/pkg@v1').id, pluginSource('https://github.com/example/pkg.git@v2').id);
  assert.throws(() => pluginSource('https://token:secret@github.com/example/pkg'));
  assert.throws(() => pluginSource('./relative'));
  assert.throws(() => pluginSource('npm:probe@https://secret@example.invalid/package.tgz'));
  assert.throws(() => pluginSource('npm:probe@1.0.0;echo-bad'));
  assert.equal(pluginSource('npm:probe@^1.2.0').identity,'npm:probe');
});

test('destination conflicts are rejected even when a restored Git checkout is absent', () => {
  const agentDir = join(tmpdir(), 'missing plugin destination');
  const parsed = pluginSource('https://localhost:4000/group/plugin.git@one');
  const pkg: PluginPackage = { ...parsed, name:'existing', root:join(agentDir,'git','localhost','group','plugin'), enabled:false, resources:[], fingerprint:'', installedAt:'' };
  assert.throws(() => assertPluginDestination('https://localhost:5000/group/plugin.git@two', [pkg], agentDir), /重叠/);
  assert.throws(() => assertPluginDestination('https://localhost:5000/group/plugin/nested.git', [pkg], agentDir), /重叠/);
  assert.doesNotThrow(() => assertPluginDestination('https://localhost:4000/group/plugin.git@new', [pkg], agentDir));
  assert.doesNotThrow(() => assertPluginDestination('https://localhost:5000/group/plugin-other.git', [pkg], agentDir));
});

test('pasted npm install commands normalize to package specs without accepting shell commands or multiple packages', () => {
  for (const [input, source] of [
    ['npm install @mutmutco/pi-plugin', 'npm:@mutmutco/pi-plugin'],
    ['  npm i @scope/plugin@1.2.3  ', 'npm:@scope/plugin@1.2.3'],
    ['npm install example-plugin@latest', 'npm:example-plugin@latest'],
  ]) assert.deepEqual(pluginSource(input), pluginSource(source));
  for (const input of ['npm', 'npm install', 'npm install one two', 'npm install -g one', 'npm install one --save', 'npm install one;whoami', 'npm install one@1|whoami', 'npm install $(whoami)', 'npm install `whoami`', 'npm install one && whoami', 'npm install https://example.invalid/pkg.tgz']) {
    assert.throws(() => pluginSource(input), /npm/);
  }
});

test('real local package inspection, persisted config, idempotence, resource toggles and incompatible retries', async () => {
  const root = mkdtempSync(join(tmpdir(), 'plugin state ')); const source = join(root, 'local package'); mkdirSync(source);
  writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'local-probe', version: '1.0.0', pi: { extensions: ['tool.mjs'], skills: ['skills'], prompts: ['prompts'] } }));
  writeFileSync(join(source, 'tool.mjs'), 'export default ()=>{}');
  mkdirSync(join(source, 'skills', 'probe'), { recursive: true }); writeFileSync(join(source, 'skills', 'probe', 'SKILL.md'), '---\nname: probe\ndescription: Probe\n---\nProbe skill');
  mkdirSync(join(source, 'prompts')); writeFileSync(join(source, 'prompts', 'probe.md'), 'Probe $1');
  let store = new Store(join(root, 'data', 'workbench.sqlite'));
  try {
    let state = new PluginState(store); const before = state.configuration();
    const input = { action: 'install' as const, source, revision: before.revision, commandId: 'install-local-001', trusted: true };
    const op = state.enqueue(input); assert.equal(state.enqueue(input).id, op.id);
    assert.throws(() => state.enqueue({ ...input, trusted: false }), /幂等/);
    const pkg = await inspectPlugin(source, join(root, 'agent'));
    assert.equal(pkg.name, 'local-probe'); assert.equal(pkg.resources.length, 3);
    state.phase(op.id, 'committing', '提交'); state.commit(op.id, [pkg]);
    assert.equal(state.manifest().packages.length, 0);
    state.configure(state.configuration().revision, pkg.id, true);
    const enabled = state.manifest(); assert.equal(enabled.packages.length, 1);
    assert.throws(() => state.assertCompatible(undefined, enabled), /环境已变化/);
    state.assertCompatible(enabled, state.manifest());
    writeFileSync(join(source, 'tool.mjs'), 'export default ()=>{ /* changed locally */ }');
    assert.throws(() => state.assertCompatible(enabled, state.manifest()), /环境已变化/);
    store.close(); store = new Store(join(root, 'data', 'workbench.sqlite')); state = new PluginState(store);
    assert.equal(state.configuration().packages[0].enabled, true);
    assert.equal(state.operations()[0].phase, 'completed');
    assert.throws(() => state.configure(before.revision, pkg.id, false), /配置已更新/);
    state.configure(state.configuration().revision, pkg.id, false);
    const remove = state.enqueue({ ...input, action: 'remove', commandId: 'remove-local-001', revision: state.configuration().revision, trusted: false });
    state.phase(remove.id, 'committing', '移除登记'); state.commit(remove.id, []);
    assert(existsSync(source)); assert.equal(state.configuration().packages.length, 0);
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});
