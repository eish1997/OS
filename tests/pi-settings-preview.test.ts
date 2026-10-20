import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { loadPi, workbenchResources } from '../server/pi-adapter.js';
import { importPiSettingsFile, previewPiSettingsFile } from '../server/pi-settings-preview.js';
import { PiSettings } from '../server/pi-settings.js';
import { AppError, Store } from '../server/store.js';
import type { ModelBinding } from '../shared/contracts.js';

test('an explicit settings file is explained without applying it or reading credentials', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pi-settings-preview-'));
  const project = join(root, 'project');
  const dir = join(project, '.pi');
  mkdirSync(join(dir, 'skills'), { recursive: true });
  const secret = 'preview-secret-token-value';
  const proxy = 'http://user:proxy-secret@example.invalid:8080';
  const packageUrl = 'https://user:package-secret@example.invalid/pkg.git';
  const settings = {
    sessionDir: 'sessions-outside',
    skills: ['skills/local'],
    prompts: ['prompts/review.md'],
    defaultTools: ['read', '+bash', '-write'],
    defaultThinkingLevel: 'high',
    defaultProjectTrust: 'always',
    packages: [packageUrl],
    httpProxy: proxy,
    shellCommandPrefix: 'echo injected',
    apiKey: secret,
    unknownFlag: true,
  };
  const file = join(dir, 'settings.json');
  const original = JSON.stringify(settings, null, 2);
  writeFileSync(file, original);
  writeFileSync(join(dir, 'auth.json'), JSON.stringify({ token: secret }));
  writeFileSync(join(project, 'AGENTS.md'), 'do not import this body');
  const preview = previewPiSettingsFile(file);
  const encoded = JSON.stringify(preview);
  assert.equal(preview.applied, false);
  assert.equal(preview.kind, 'project');
  assert.equal(preview.sessionDir, 'sessions-outside');
  assert.deepEqual(preview.skills, ['skills/local']);
  assert.deepEqual(preview.prompts, ['prompts/review.md']);
  assert.deepEqual(preview.defaultTools, ['read', '+bash', '-write']);
  assert.equal(preview.defaultThinkingLevel, 'high');
  assert.equal(preview.packageCount, 1);
  assert.equal(preview.contextFiles.includes('项目目录/AGENTS.md'), true);
  assert.equal(preview.resourceDirectories.includes('设置目录/skills'), true);
  assert.equal(encoded.includes(secret), false);
  assert.equal(encoded.includes(proxy), false);
  assert.equal(encoded.includes(packageUrl), false);
  assert.equal(encoded.includes('echo injected'), false);
  assert.equal(encoded.includes('do not import this body'), false);
  assert.equal(readFileSync(file, 'utf8'), original);
  assert.throws(() => previewPiSettingsFile(join(dir, 'auth.json')), (error: unknown) => error instanceof AppError && error.status === 400);
  try {
    const linkedDir = join(root, 'linked');
    mkdirSync(linkedDir);
    const link = join(linkedDir, 'settings.json');
    symlinkSync(file, link);
    assert.throws(() => previewPiSettingsFile(link), (error: unknown) => error instanceof AppError && error.status === 400);
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || (error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
  }
});

test('import writes the thinking level and a same-provider model, leaving the source file and credentials untouched', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pi-settings-import-'));
  const file = join(root, 'settings.json');
  const secret = 'import-secret-token-value';
  const binding: ModelBinding = { kind: 'api', provider: 'openai', model: 'gpt-5.6-sol' };
  const store = new Store(join(root, 'workbench.sqlite'));
  try {
    const settings = new PiSettings(store);
    const catalog = await settings.snapshot(binding);
    let otherId = '';
    for (const model of catalog.availableModels ?? []) {
      if (model.id === 'gpt-5.6-sol') continue;
      const probe = await settings.snapshot({ ...binding, model: model.id });
      if (probe.model?.supportedThinkingLevels.includes('high')) { otherId = model.id; break; }
    }
    assert.ok(otherId);
    const original = JSON.stringify({ defaultThinkingLevel: 'high', defaultProvider: 'openai', defaultModel: otherId, sessionDir: 'elsewhere', defaultTools: ['+bash'], packages: ['https://user:package-secret@example.invalid/pkg.git'], apiKey: secret, compaction: { enabled: false } });
    writeFileSync(file, original);
    const imported = await importPiSettingsFile(file, settings, binding, 0);
    assert.equal(imported.appliedThinkingLevel, 'high');
    assert.equal(imported.appliedModel, otherId);
    assert.equal(imported.snapshot.configuration.thinkingLevel, 'high');
    assert.equal(imported.snapshot.configuration.apiModel, otherId);
    assert.equal(readFileSync(file, 'utf8'), original);
    assert.equal(JSON.stringify(imported).includes(secret), false);
    assert.equal(JSON.stringify(store.events(0)).includes(secret), false);
    assert.equal(imported.refused.some(item => item.includes('defaultTools')), true);
    assert.equal(imported.refused.some(item => item.includes('sessionDir')), true);
    assert.equal(imported.refused.some(item => item.includes('凭据')), true);
    const mismatch = JSON.stringify({ defaultThinkingLevel: 'low', defaultProvider: 'anthropic', defaultModel: 'claude-secret-model' });
    writeFileSync(file, mismatch);
    const kept = await importPiSettingsFile(file, settings, binding, imported.snapshot.configuration.revision);
    assert.equal(kept.appliedModel, undefined);
    assert.equal(kept.snapshot.configuration.apiModel, otherId);
    assert.equal(kept.refused.some(item => item.includes('没有切换提供商')), true);
    assert.equal(settings.configuration().apiModel, otherId);
  } finally { store.close(); }
});

test('import keeps per-model thinking and narrows the model list for the current provider', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pi-settings-per-model-'));
  const file = join(root, 'settings.json');
  const secret = 'per-model-secret-value';
  const binding: ModelBinding = { kind: 'api', provider: 'openai', model: 'gpt-5.6-sol' };
  const store = new Store(join(root, 'workbench.sqlite'));
  try {
    const settings = new PiSettings(store);
    const catalog = await settings.snapshot(binding);
    let otherId = '';
    for (const model of catalog.availableModels ?? []) {
      if (model.id === 'gpt-5.6-sol') continue;
      const probe = await settings.snapshot({ ...binding, model: model.id });
      if (probe.model?.supportedThinkingLevels.includes('low')) { otherId = model.id; break; }
    }
    assert.ok(otherId);
    const outside = (catalog.availableModels ?? []).find(model => model.id !== 'gpt-5.6-sol' && model.id !== otherId);
    const original = JSON.stringify({ defaultThinkingLevel: 'medium', modelThinkingLevels: { 'openai/gpt-5.6-sol': 'high', [`openai/${otherId}`]: 'low', 'openai/apiKey-secret': secret }, enabledModels: ['openai/gpt-5.6-sol', `openai/${otherId}`] });
    writeFileSync(file, original);
    const imported = await importPiSettingsFile(file, settings, binding, 0);
    assert.equal(imported.appliedThinkingLevel, 'high');
    assert.equal(readFileSync(file, 'utf8'), original);
    assert.equal(JSON.stringify(imported).includes(secret), false);
    assert.equal(settings.configuration().modelThinkingLevels?.['openai/gpt-5.6-sol'], 'high');
    assert.equal(settings.configuration().modelThinkingLevels?.[`openai/${otherId}`], 'low');
    assert.equal((await settings.freeze(binding)).requestedThinkingLevel, 'high');
    assert.equal((await settings.freeze({ ...binding, model: otherId })).requestedThinkingLevel, 'low');
    const narrowed = await settings.snapshot(binding);
    assert.equal(narrowed.availableModels?.some(model => model.id === 'gpt-5.6-sol'), true);
    assert.equal(narrowed.availableModels?.some(model => model.id === otherId), true);
    if (outside) assert.equal(narrowed.availableModels?.some(model => model.id === outside.id), false);
    const saved = await settings.update(settings.configuration().revision, 'off', binding);
    assert.equal(saved.configuration.modelThinkingLevels?.['openai/gpt-5.6-sol'], 'off');
    assert.equal(saved.configuration.modelThinkingLevels?.[`openai/${otherId}`], 'low');
    writeFileSync(file, JSON.stringify({ enabledModels: ['anthropic/*'] }));
    const skipped = await importPiSettingsFile(file, settings, binding, saved.configuration.revision);
    assert.equal(skipped.refused.some(item => item.includes('没有收窄')), true);
    assert.deepEqual(settings.configuration().enabledModelPatterns, ['openai/gpt-5.6-sol', `openai/${otherId}`]);
  } finally { store.close(); }
});

test('a model-list thinking suffix is saved for each matched model', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pi-settings-pattern-thinking-'));
  const file = join(root, 'settings.json');
  const binding: ModelBinding = { kind: 'api', provider: 'openai', model: 'gpt-5.6-sol' };
  const store = new Store(join(root, 'workbench.sqlite'));
  try {
    const settings = new PiSettings(store);
    const catalog = await settings.snapshot(binding);
    let otherId = '';
    for (const model of catalog.availableModels ?? []) {
      if (model.id === 'gpt-5.6-sol') continue;
      const probe = await settings.snapshot({ ...binding, model: model.id });
      if (probe.model) { otherId = model.id; break; }
    }
    assert.ok(otherId);
    const original = JSON.stringify({ defaultThinkingLevel: 'medium', enabledModels: [`openai/${otherId}:low`] });
    writeFileSync(file, original);
    const imported = await importPiSettingsFile(file, settings, binding, 0);
    assert.equal(readFileSync(file, 'utf8'), original);
    assert.equal(imported.snapshot.configuration.modelThinkingLevels?.[`openai/${otherId}`], 'low');
    assert.equal((await settings.freeze({ ...binding, model: otherId })).requestedThinkingLevel, 'low');
    assert.equal((await settings.freeze(binding)).requestedThinkingLevel, 'medium');
  } finally { store.close(); }
});

test('import registers an existing local skill and prompt without loading packages or extensions', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pi-settings-skills-'));
  const skillDir = join(root, 'skills', 'demo');
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, 'SKILL.md'), '---\nname: imported-demo\ndescription: Local\n---\nDemo skill body');
  mkdirSync(join(root, 'prompts'));
  writeFileSync(join(root, 'prompts', 'review.md'), '---\ndescription: Review\n---\nReview the diff');
  mkdirSync(join(root, 'extensions'));
  writeFileSync(join(root, 'extensions', 'bad.js'), 'throw new Error("do not load")');
  const file = join(root, 'settings.json');
  const original = JSON.stringify({ skills: ['skills/demo', 'skills/missing', '!skills/demo'], prompts: ['prompts/review.md'], extensions: ['extensions/bad.js'], packages: ['npm:do-not-install-this'] });
  writeFileSync(file, original);
  const binding: ModelBinding = { kind: 'api', provider: 'openai', model: 'gpt-5.6-sol' };
  const store = new Store(join(root, 'workbench.sqlite'));
  try {
    const settings = new PiSettings(store);
    const imported = await importPiSettingsFile(file, settings, binding, 0);
    assert.equal(readFileSync(file, 'utf8'), original);
    const skills = imported.snapshot.configuration.importedSkillPaths ?? [];
    const prompts = imported.snapshot.configuration.importedPromptPaths ?? [];
    assert.equal(skills.length, 1);
    assert.equal(skills[0].endsWith('SKILL.md'), true);
    assert.equal(imported.refused.some(item => item.includes('没有登记')), true);
    assert.equal(prompts.length, 1);
    assert.equal(prompts[0].endsWith('review.md'), true);
    assert.equal(JSON.stringify(imported).includes('do-not-install-this'), false);
    assert.equal(JSON.stringify(imported).includes('do not load'), false);
    const agentDir = join(root, '.host-pi');
    mkdirSync(agentDir);
    const pi = await loadPi();
    const resources = await workbenchResources(pi, root, agentDir, 'host', { skills, prompts });
    assert.equal(resources.loader.getSkills().skills.some(skill => skill.name === 'imported-demo'), true);
    assert.equal(resources.loader.getPrompts().prompts.some(prompt => prompt.filePath.endsWith('review.md')), true);
    assert.equal(resources.loader.getExtensions().extensions.length, 0);
  } finally { store.close(); }
});

test('a skill directory registers each nested skill and a prompt directory registers its files', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pi-settings-nested-'));
  mkdirSync(join(root, 'skills', 'one'), { recursive: true });
  mkdirSync(join(root, 'skills', 'two'), { recursive: true });
  mkdirSync(join(root, 'skills', 'node_modules', 'skip'), { recursive: true });
  writeFileSync(join(root, 'skills', 'one', 'SKILL.md'), '---\nname: nested-one\ndescription: One\n---\nOne');
  writeFileSync(join(root, 'skills', 'two', 'SKILL.md'), '---\nname: nested-two\ndescription: Two\n---\nTwo');
  writeFileSync(join(root, 'skills', 'node_modules', 'skip', 'SKILL.md'), '---\nname: nested-skip\ndescription: Skip\n---\nSkip');
  mkdirSync(join(root, 'prompts'));
  writeFileSync(join(root, 'prompts', 'a.md'), '---\ndescription: A\n---\nA');
  writeFileSync(join(root, 'prompts', 'b.md'), '---\ndescription: B\n---\nB');
  writeFileSync(join(root, 'prompts', 'notes.txt'), 'not a prompt');
  const file = join(root, 'settings.json');
  writeFileSync(file, JSON.stringify({ skills: ['skills'], prompts: ['prompts'] }));
  const binding: ModelBinding = { kind: 'api', provider: 'openai', model: 'gpt-5.6-sol' };
  const store = new Store(join(root, 'workbench.sqlite'));
  try {
    const imported = await importPiSettingsFile(file, new PiSettings(store), binding, 0);
    const skills = imported.snapshot.configuration.importedSkillPaths ?? [];
    const prompts = imported.snapshot.configuration.importedPromptPaths ?? [];
    assert.equal(skills.length, 2);
    assert.equal(skills.some(path => path.endsWith(`${join('one', 'SKILL.md')}`)), true);
    assert.equal(skills.some(path => path.endsWith(`${join('two', 'SKILL.md')}`)), true);
    assert.equal(skills.some(path => path.includes('node_modules')), false);
    assert.equal(prompts.length, 2);
    assert.equal(prompts.every(path => path.endsWith('.md')), true);
    const agentDir = join(root, '.host-pi');
    mkdirSync(agentDir);
    const pi = await loadPi();
    const resources = await workbenchResources(pi, root, agentDir, 'host', { skills, prompts });
    const names = resources.loader.getSkills().skills.map(skill => skill.name);
    assert.equal(names.includes('nested-one'), true);
    assert.equal(names.includes('nested-two'), true);
    assert.equal(names.includes('nested-skip'), false);
    assert.equal(resources.loader.getPrompts().prompts.length, 2);
  } finally { store.close(); }
});

test('settings preview requires login and does not change stored execution settings', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pi-settings-preview-http-'));
  const file = join(root, 'settings.json');
  writeFileSync(file, JSON.stringify({ defaultThinkingLevel: 'low', sessionDir: 'elsewhere' }));
  const app = createApp({ dataDir: join(root, 'data'), password: 'preview-password', schedule: false });
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  try {
    assert.equal((await fetch(base + '/api/pi/settings/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: file }) })).status, 401);
    const login = await fetch(base + '/api/login', { method: 'POST', body: JSON.stringify({ password: 'preview-password' }) });
    const headers = { Cookie: login.headers.get('set-cookie')!.split(';')[0], 'Content-Type': 'application/json' };
    const before = await (await fetch(base + '/api/pi/settings', { headers })).json();
    assert.equal((await fetch(base + '/api/pi/settings/preview', { method: 'POST', headers: { ...headers, Origin: 'https://foreign.invalid' }, body: JSON.stringify({ path: file }) })).status, 403);
    const response = await fetch(base + '/api/pi/settings/preview', { method: 'POST', headers, body: JSON.stringify({ path: file }) });
    assert.equal(response.status, 200);
    const preview = await response.json();
    assert.equal(preview.applied, false);
    assert.equal(preview.kind, 'agent-directory');
    assert.equal(preview.defaultThinkingLevel, 'low');
    const after = await (await fetch(base + '/api/pi/settings', { headers })).json();
    assert.equal(after.configuration.revision, before.configuration.revision);
    assert.equal(after.configuration.thinkingLevel, before.configuration.thinkingLevel);
    assert.equal((await fetch(base + '/api/pi/settings/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: file, revision: before.configuration.revision }) })).status, 401);
    const foreign = await fetch(base + '/api/pi/settings/import', { method: 'POST', headers: { ...headers, Origin: 'https://foreign.invalid' }, body: JSON.stringify({ path: file, revision: before.configuration.revision }) });
    assert.equal(foreign.status, 403);
    const stale = await fetch(base + '/api/pi/settings/import', { method: 'POST', headers, body: JSON.stringify({ path: file, revision: before.configuration.revision + 1 }) });
    assert.equal(stale.status, 409);
    const imported = await fetch(base + '/api/pi/settings/import', { method: 'POST', headers, body: JSON.stringify({ path: file, revision: before.configuration.revision }) });
    assert.equal(imported.status, 200);
    const body = await imported.json();
    assert.equal(body.appliedThinkingLevel, 'low');
    assert.equal(body.snapshot.configuration.thinkingLevel, 'low');
    assert.equal(readFileSync(file, 'utf8').includes('elsewhere'), true);
  } finally { await app.close(); }
});
