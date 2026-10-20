import { chromium } from 'playwright-core';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import type { Run } from '../shared/contracts.js';

Object.assign(config, { apiKey: 'offline-ui-only', provider: 'openai', model: 'gpt-5.6-sol', maxCalls: 4, budgetUsd: 4, reservePerCallUsd: 1 });

const evidence = 'output/dev-evidence/pi-parity/loop-155';
mkdirSync(evidence, { recursive: true });
const root = mkdtempSync(join(tmpdir(), 'pi-settings-ui-'));
mkdirSync(join(root, 'skills', 'one'), { recursive: true });
mkdirSync(join(root, 'skills', 'two'), { recursive: true });
writeFileSync(join(root, 'skills', 'one', 'SKILL.md'), '---\nname: nested-one\ndescription: One\n---\nOne');
writeFileSync(join(root, 'skills', 'two', 'SKILL.md'), '---\nname: nested-two\ndescription: Two\n---\nTwo');
mkdirSync(join(root, 'prompts'));
writeFileSync(join(root, 'prompts', 'review.md'), '---\ndescription: Review\n---\nReview');
const settingsFile = join(root, 'settings.json');
const original = JSON.stringify({
  defaultThinkingLevel: 'high',
  skills: ['skills'],
  prompts: ['prompts/review.md'],
  extensions: ['extensions/do-not-load.js'],
  packages: ['npm:do-not-install-this'],
});
writeFileSync(settingsFile, original);
const app = createApp({ dataDir: join(root, 'data'), staticDir: 'output/pi-parity-build', password: 'settings-ui-password', schedule: false });
await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
config.origin = base;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await context.request.post(base + '/api/login', { data: { password: 'settings-ui-password' } });
  const project = app.service.createProject('设置导入验收');
  const beforeImport = await (await context.request.post(base + '/api/tasks', {
    data: { projectId: project.id, goal: 'before import', mode: 'pi', commandId: 'before-import', continueFromRunId: null },
  })).json() as { run: Run };
  assert.equal(beforeImport.run.policy.piRuntime?.thinkingLevel, 'medium');

  await page.goto(base);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '外观设置' });
  await dialog.getByLabel('原版设置路径').fill(settingsFile);
  await dialog.getByRole('button', { name: '预览原版设置', exact: true }).click();
  await dialog.getByLabel('原版设置预览').getByText('未应用', { exact: false }).waitFor();
  await dialog.getByText('skills：skills', { exact: true }).waitFor();
  await dialog.getByText('prompts：prompts/review.md', { exact: true }).waitFor();
  assert.equal(await dialog.getByLabel('思考强度', { exact: true }).inputValue(), 'medium');
  await dialog.getByRole('button', { name: '导入可保存项', exact: true }).click();
  const imported = dialog.getByLabel('原版设置导入结果');
  await imported.getByText('已写入之后的新任务 · 思考 high', { exact: true }).waitFor();
  await imported.getByText('已登记本地技能 2 个、模板 1 个。之后的新任务会加载这些文件。', { exact: true }).waitFor();
  await page.waitForFunction(() => (document.querySelector('[aria-label="思考强度"]') as HTMLSelectElement)?.value === 'high');
  const stored = await (await context.request.get(base + '/api/pi/settings')).json();
  assert.equal(stored.configuration.thinkingLevel, 'high');
  assert.equal(stored.configuration.importedSkillPaths.length, 2);
  assert.equal(stored.configuration.importedPromptPaths.length, 1);
  assert.equal(stored.configuration.importedSkillPaths.every((path: string) => path.endsWith('SKILL.md')), true);
  assert.equal(JSON.stringify(stored).includes('do-not-install-this'), false);
  assert.equal(readFileSync(settingsFile, 'utf8'), original);

  const afterImport = await (await context.request.post(base + '/api/tasks', {
    data: { projectId: project.id, goal: 'after import', mode: 'pi', commandId: 'after-import', continueFromRunId: null },
  })).json() as { run: Run };
  assert.equal(afterImport.run.policy.piRuntime?.thinkingLevel, 'high');
  assert.equal(afterImport.run.policy.piRuntime?.requestedThinkingLevel, 'high');
  assert.equal(app.store.get<Run>('run', beforeImport.run.id).policy.piRuntime?.thinkingLevel, 'medium');

  await page.screenshot({ path: join(evidence, 'settings-import.png'), fullPage: true });
  await page.reload();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await dialog.getByLabel('Pi运行设置').getByText('已登记本地技能 2 个、模板 1 个。之后的新任务会加载这些文件。', { exact: true }).waitFor();
  assert.equal(await dialog.getByLabel('思考强度', { exact: true }).inputValue(), 'high');
  assert.deepEqual(errors, []);
  writeFileSync(join(evidence, 'report.json'), JSON.stringify({
    closed: '导入后的思考档位进入之后的新任务 policy；导入前已提交的任务保持原档位；设置页显示导入结果',
    browserClicked: true,
    sourceFileUnchanged: true,
    beforeImportThinking: 'medium',
    afterImportThinking: 'high',
    oldTaskUnchanged: true,
    skills: 2,
    prompts: 1,
    extensionsNotLoaded: true,
    packageNotInstalled: true,
    realModels: 0,
    delivery: false,
    pivMatrix: false,
  }, null, 2));
} finally {
  await browser.close();
  await app.close();
}
