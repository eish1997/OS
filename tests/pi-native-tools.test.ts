import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPi, workbenchResources } from '../server/pi-adapter.js';
import { nativePiTools } from '../shared/pi-tools.js';
import { Type, InMemoryCredentialStore } from '@earendil-works/pi-ai';

async function setup() {
  const root = mkdtempSync(join(tmpdir(), 'native-pi-')); const agentDir = join(root, '.host-pi'); mkdirSync(agentDir);
  const skills = join(root, '.pi', 'skills', 'fixture'); mkdirSync(skills, { recursive: true });
  writeFileSync(join(skills, 'SKILL.md'), '---\nname: fixture\ndescription: Local fixture skill\n---\nUse the fixture only for local testing.');
  const extensions = join(root, '.pi', 'extensions'); mkdirSync(extensions, { recursive: true });
  writeFileSync(join(extensions, 'must-not-run.js'), 'throw new Error("Unreviewed executable extension loaded");');
  const pi = await loadPi(); const resources = await workbenchResources(pi, root, agentDir, 'Workbench-specific instructions');
  const runtime = await pi.ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null, allowModelNetwork: false });
  const model = runtime.getModel('openai', 'gpt-5.6-sol'); assert(model);
  const { session } = await pi.createAgentSession({ cwd: root, agentDir, modelRuntime: runtime, model, sessionManager: pi.SessionManager.inMemory(root), settingsManager: resources.settings, resourceLoader: resources.loader, tools: [...nativePiTools, 'workbench_fixture'], customTools: [{ name: 'workbench_fixture', label: 'Fixture', description: 'Workspace tool', parameters: Type.Object({}), execute: async () => ({ content: [{ type: 'text', text: 'host tool' }], details: {} }) }] });
  const execute = (name: string, args: any, signal?: AbortSignal) => { const tool = session.agent.state.tools.find(t => t.name === name); assert(tool, name); return tool.execute(`fixture-${name}`, args, signal); };
  return { root, session, resources, execute };
}
test('native Pi tools coexist with host tools and use real files; skills load but executable extensions do not', async () => {
  const f = await setup();
  try {
    assert.deepEqual(new Set(f.session.getActiveToolNames()), new Set([...nativePiTools, 'workbench_fixture']));
    assert(f.resources.loader.getSkills().skills.some(s => s.name === 'fixture'));
    assert.equal(f.resources.loader.getExtensions().extensions.length, 0);
    assert.equal(f.resources.loader.getSystemPrompt(), undefined);
    assert(f.resources.loader.getAppendSystemPrompt().includes('Workbench-specific instructions'));
    await f.execute('write', { path: 'result.txt', content: 'before' });
    await f.execute('edit', { path: 'result.txt', edits: [{ oldText: 'before', newText: 'after' }] });
    assert.equal(readFileSync(join(f.root, 'result.txt'), 'utf8'), 'after');
    const result = await f.execute('read', { path: 'result.txt' }); assert(JSON.stringify(result).includes('after'));
    assert(JSON.stringify(await f.execute('ls', { path: '.' })).includes('result.txt'));
    assert(JSON.stringify(await f.execute('workbench_fixture', {})).includes('host tool'));
    await assert.rejects(f.execute('edit', { path: 'result.txt', edits: [{ oldText: 'missing', newText: 'no' }] }));
    assert.equal(readFileSync(join(f.root, 'result.txt'), 'utf8'), 'after');
  } finally { f.session.dispose(); }
});
test('native command executes in project cwd and cancellation reaches the shell', { skip: process.platform !== 'win32' }, async () => {
  const f = await setup();
  try {
    await f.execute('powershell', { command: "Set-Content -LiteralPath 'shell-result.txt' -Value 'native-shell-ok'", timeout: 10 });
    assert(existsSync(join(f.root, 'shell-result.txt'))); assert.match(readFileSync(join(f.root, 'shell-result.txt'), 'utf8'), /native-shell-ok/);
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 300);
    const started = Date.now();
    try { await assert.rejects(f.execute('powershell', { command: 'Start-Sleep -Seconds 30', timeout: 40 }, controller.signal)); }
    finally { clearTimeout(timer); }
    assert(Date.now() - started < 10000, 'cancelled command must stop promptly');
  } finally { f.session.dispose(); }
});

test('one offline pass covers read write edit search command and cancel without leftover half writes', { skip: process.platform !== 'win32', timeout: 30000 }, async () => {
  const f = await setup();
  const evidence = 'output/dev-evidence/pi-parity/loop-156';
  mkdirSync(evidence, { recursive: true });
  try {
    await f.execute('write', { path: 'notes/alpha.txt', content: 'FINDME-ALPHA' });
    await f.execute('edit', { path: 'notes/alpha.txt', edits: [{ oldText: 'FINDME-ALPHA', newText: 'FINDME-BETA' }] });
    assert.equal(readFileSync(join(f.root, 'notes', 'alpha.txt'), 'utf8'), 'FINDME-BETA');
    assert(JSON.stringify(await f.execute('read', { path: 'notes/alpha.txt' })).includes('FINDME-BETA'));
    assert(JSON.stringify(await f.execute('grep', { pattern: 'FINDME-BETA', path: '.' })).includes('alpha.txt'));
    assert(JSON.stringify(await f.execute('find', { pattern: 'alpha.txt', path: '.' })).includes('alpha.txt'));
    await f.execute('powershell', { command: "Set-Content -LiteralPath 'notes/cmd.txt' -Value 'CMD-OK'", timeout: 10 });
    assert.equal(readFileSync(join(f.root, 'notes', 'cmd.txt'), 'utf8').trim(), 'CMD-OK');
    const before = readFileSync(join(f.root, 'notes', 'alpha.txt'), 'utf8');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 300);
    try { await assert.rejects(f.execute('powershell', { command: 'Start-Sleep -Seconds 30', timeout: 40 }, controller.signal)); }
    finally { clearTimeout(timer); }
    assert.equal(readFileSync(join(f.root, 'notes', 'alpha.txt'), 'utf8'), before);
    writeFileSync(join(evidence, 'report.json'), JSON.stringify({
      closed: '同一离线会话完成读、写、编辑、搜索、命令与取消；取消后已有文件内容不变',
      steps: ['write', 'edit', 'read', 'grep', 'find', 'powershell', 'cancel'],
      realModels: 0,
      note: '不是真实模型驱动的六步任务样本；PIV-16 仍需授权后对照',
    }, null, 2));
  } finally { f.session.dispose(); }
});
