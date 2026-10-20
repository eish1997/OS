import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, AppError } from '../server/store.js';
import { PiSettings } from '../server/pi-settings.js';
import { Service } from '../server/service.js';
import { Assets } from '../server/assets.js';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import type { ModelBinding, Policy, Run } from '../shared/contracts.js';

const binding: ModelBinding = { kind: 'api', provider: 'openai', model: 'gpt-5.6-sol' };
const status = (code: number) => (error: unknown) => error instanceof AppError && error.status === code;

test('thinking configuration freezes new runs and retries retain their original profile across reopen', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pi-settings-'));
  let store = new Store(join(root, 'workbench.sqlite'));
  try {
    const settings = new PiSettings(store);
    const cursor = store.cursor();
    const snapshot = await settings.snapshot(binding);
    assert.equal(snapshot.configuration.revision, 0);
    assert.equal(snapshot.configuration.userWaitTimeoutMs,300000);
    assert.equal(snapshot.model?.effectiveThinkingLevel, 'medium');
    assert.equal(store.cursor(), cursor);
    assert.equal(store.list('pi_execution_config').length, 0);
    const service = new Service(store, new Assets(store, root));
    const project = service.createProject('thinking fixture');
    const policy: Policy = { version: 8, projectId: project.id, toolNames: [], allowModel: true, maxCalls: 2, maxCostUsd: 2, reservePerCallUsd: 1, maxOutputTokens: 100, timeoutMs: 10000, modelBinding: binding, piRuntime: await settings.freeze(binding) };
    const first = service.submit(project.id, 'first', 'first', 'pi', policy, [], undefined, { view: 'project' }, null).run;
    service.transition(first.id, 'running');
    service.transition(first.id, 'failed');
    const updated = await settings.update(0, 'high', binding,undefined,undefined,600000);
    assert.equal(updated.configuration.revision, 1);
    assert.equal((await settings.freeze(binding)).thinkingLevel, 'high');
    assert.equal((await settings.freeze(binding)).userWaitTimeoutMs,600000);
    const retry = service.retry(first.id, 'retry');
    assert.deepEqual(retry.policy, policy);
    assert.equal(store.get<Run>('run', first.id).policy.piRuntime?.thinkingLevel, 'medium');
    assert.equal(store.get<Run>('run', first.id).policy.piRuntime?.userWaitTimeoutMs,300000);
    const legacy = { ...policy }; delete legacy.piRuntime;
    const old = service.submit(project.id, 'old', 'old', 'pi', legacy, [], undefined, { view: 'project' }, null).run;
    service.transition(old.id, 'running'); service.transition(old.id, 'failed');
    assert.equal(service.retry(old.id, 'old-retry').policy.piRuntime, undefined);
    await assert.rejects(settings.update(0, 'low', binding), status(409));
    await assert.rejects(settings.update(1, 'invented', binding), status(400));
    store.close(); store = new Store(join(root, 'workbench.sqlite'));
    assert.equal((await new PiSettings(store).freeze(binding)).thinkingLevel, 'high');
    assert.equal((await new PiSettings(store).freeze(binding)).userWaitTimeoutMs,600000);
    assert.deepEqual(store.get<Run>('run', retry.id).policy.piRuntime, policy.piRuntime);
  } finally { store.close(); }
});

test('API output token limit is editable and subscription bindings cannot set it here', async () => {
  const store = new Store(join(mkdtempSync(join(tmpdir(), 'pi-output-limit-')), 'workbench.sqlite'));
  try {
    const settings = new PiSettings(store);
    assert.equal((await settings.snapshot(binding)).configuration.maxOutputTokens, config.maxOutputTokens);
    assert.equal((await settings.snapshot(binding)).authKind, 'api');
    const next = await settings.update(0, 'medium', binding, undefined, undefined, undefined, 768);
    assert.equal(next.configuration.maxOutputTokens, 768);
    await assert.rejects(settings.update(1, 'medium', { kind: 'chatgpt', provider: 'openai', model: 'gpt-5.6-sol', connectionId: 'offline' }, undefined, undefined, undefined, 1024), status(400));
    assert.equal(settings.configuration().maxOutputTokens, 768);
  } finally { store.close(); }
});

test('API model selection lists fixed Pi models and freezes into later task bindings', async () => {
  const previous = { ...config };
  Object.assign(config, { provider: 'openai', model: 'gpt-5.6-sol', apiKey: 'offline-model-select', maxCalls: 2, budgetUsd: 2, reservePerCallUsd: 1 });
  const app = createApp({ dataDir: mkdtempSync(join(tmpdir(), 'pi-api-model-')), password: 'api-model-password', schedule: false });
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  try {
    const login = await fetch(base + '/api/login', { method: 'POST', body: JSON.stringify({ password: 'api-model-password' }) });
    const headers = { Cookie: login.headers.get('set-cookie')!.split(';')[0], 'Content-Type': 'application/json' };
    const initial = await (await fetch(base + '/api/pi/settings', { headers })).json();
    assert.equal(initial.authKind, 'api');
    assert(initial.availableModels?.some((model: { id: string }) => model.id === 'gpt-5.6-sol'));
    const other = initial.availableModels.find((model: { id: string }) => model.id !== 'gpt-5.6-sol' && model.id.startsWith('gpt-'));
    assert(other, 'need another openai model in the fixed catalog');
    const saved = await (await fetch(base + '/api/pi/settings', { method: 'PUT', headers, body: JSON.stringify({ revision: initial.configuration.revision, thinkingLevel: 'off', executionMode: 'standard', networkIdleTimeoutMs: 180000, userWaitTimeoutMs: 300000, maxOutputTokens: initial.configuration.maxOutputTokens, apiModel: other.id }) })).json();
    assert.equal(saved.configuration.apiModel, other.id);
    assert.equal(saved.model.id, other.id);
    assert.equal(app.modelAccess.settings().binding.model, other.id);
    const project = await (await fetch(base + '/api/projects', { method: 'POST', headers, body: JSON.stringify({ name: 'api model' }) })).json();
    const submitted = await (await fetch(base + '/api/tasks', { method: 'POST', headers, body: JSON.stringify({ projectId: project.id, goal: 'use selected model', mode: 'pi', commandId: 'api-model-task', continueFromRunId: null }) })).json();
    assert.equal(submitted.run.policy.modelBinding?.model, other.id);
    assert.equal(submitted.run.policy.piRuntime.thinkingLevel, 'off');
  } finally { await app.close(); Object.assign(config, previous); }
});

test('non-reasoning and unknown models are explicit without silently rewriting preferences', async () => {
  const store = new Store(join(mkdtempSync(join(tmpdir(), 'pi-model-capability-')), 'workbench.sqlite'));
  try {
    const settings = new PiSettings(store);
    const simple: ModelBinding = { ...binding, model: 'gpt-4o' };
    const snapshot = await settings.snapshot(simple);
    assert.deepEqual(snapshot.model?.supportedThinkingLevels, ['off']);
    assert.equal(snapshot.model?.effectiveThinkingLevel, 'off');
    assert.equal(snapshot.configuration.thinkingLevel, 'medium');
    await assert.rejects(settings.update(0, 'high', simple), status(400));
    assert.equal(settings.configuration().revision, 0);
    await assert.rejects(settings.freeze({ ...binding, model: 'missing-fixture-model' }), status(400));
    assert.equal((await settings.snapshot()).model, null);
  } finally { store.close(); }
});

test('settings HTTP enforces login, origin, validation and concurrent update conflicts', async () => {
  const previous = { ...config };
  Object.assign(config, { provider: binding.provider, model: binding.model, apiKey: 'offline-unused-fixture', maxCalls: 2, budgetUsd: 2, reservePerCallUsd: 1 });
  const app = createApp({ dataDir: mkdtempSync(join(tmpdir(), 'pi-settings-http-')), password: 'isolated-settings-password', schedule: false });
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  try {
    assert.equal((await fetch(base + '/api/pi/settings')).status, 401);
    const login = await fetch(base + '/api/login', { method: 'POST', body: JSON.stringify({ password: 'isolated-settings-password' }) });
    const headers = { Cookie: login.headers.get('set-cookie')!.split(';')[0], 'Content-Type': 'application/json' };
    const read = await fetch(base + '/api/pi/settings', { headers });
    assert.equal(read.status, 200);
    const initial = await read.json();
    const projectResponse = await fetch(base + '/api/projects', { method: 'POST', headers, body: JSON.stringify({ name: 'freeze HTTP fixture' }) });
    const project = await projectResponse.json();
    const inputTask = { projectId: project.id, goal: 'never execute this offline fixture', mode: 'pi', commandId: 'frozen-http-task', continueFromRunId: null };
    const submit = (data: unknown) => fetch(base + '/api/tasks', { method: 'POST', headers, body: JSON.stringify(data) });
    const firstResponse = await submit(inputTask);
    assert.equal(firstResponse.status, 202);
    const first = await firstResponse.json();
    assert.equal(first.run.policy.piRuntime.thinkingLevel, 'medium');
    const put = (value: unknown, extra = {}) => fetch(base + '/api/pi/settings', { method: 'PUT', headers: { ...headers, ...extra }, body: JSON.stringify(value) });
    const input = { revision: initial.configuration.revision, thinkingLevel: 'off', executionMode: 'long', networkIdleTimeoutMs: 600000,userWaitTimeoutMs:900000,maxOutputTokens:512 };
    assert.equal((await put(input, { Origin: 'https://foreign.invalid' })).status, 403);
    assert.equal((await put({ ...input, thinkingLevel: 'invalid' })).status, 400);
    assert.equal((await put({ ...input, executionMode: 'unlimited' })).status, 400);
    assert.equal((await put({ ...input, networkIdleTimeoutMs: 0 })).status, 400);
    for(const userWaitTimeoutMs of [0,999,86400001,1.5,'300000'])assert.equal((await put({...input,userWaitTimeoutMs})).status,400);
    for(const maxOutputTokens of [0,15,200001,1.5,'512'])assert.equal((await put({...input,maxOutputTokens})).status,400);
    assert.equal((await put(input)).status, 200);
    assert.equal((await put(input)).status, 409);
    const replay = await submit(inputTask);
    assert.equal(replay.status, 202);
    assert.deepEqual(await replay.json(), first);
    assert.equal((await submit({ ...inputTask, goal: 'different goal' })).status, 409);
    const secondResponse = await submit({ ...inputTask, commandId: 'new-http-task' });
    assert.equal(secondResponse.status, 202);
    const second = await secondResponse.json();
    assert.equal(second.run.policy.piRuntime.thinkingLevel, 'off');
    assert.equal(second.run.policy.piRuntime.executionMode, 'long');
    assert.equal(second.run.policy.timeoutMs, 30 * 60 * 1000);
    assert.equal(second.run.policy.piRuntime.networkIdleTimeoutMs, 600000);
    assert.equal(second.run.policy.piRuntime.userWaitTimeoutMs,900000);assert.equal(first.run.policy.piRuntime.userWaitTimeoutMs,300000);
    assert.equal(first.run.policy.piRuntime.networkIdleTimeoutMs, 180000);
    assert.equal(first.run.policy.maxOutputTokens, previous.maxOutputTokens);
    assert.equal(second.run.policy.maxOutputTokens, 512);
    assert.equal(second.run.policy.maxCalls, first.run.policy.maxCalls);
    assert.equal(second.run.policy.maxCostUsd, first.run.policy.maxCostUsd);
    assert.equal(first.run.policy.piRuntime.executionMode, 'standard');
    assert.equal(first.run.policy.timeoutMs, previous.timeoutMs);
    // Receipt retrieval must not require the old account to remain available.
    config.apiKey = '';
    assert.equal((await submit(inputTask)).status, 202);
  } finally { await app.close(); Object.assign(config, previous); }
});
