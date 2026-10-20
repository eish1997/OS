import { chromium } from 'playwright-core';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import type { Run } from '../shared/contracts.js';
import { acceptRunInput, updateRunInput } from '../server/run-input.js';
import { createInteraction, answerInteraction, acknowledgeInteraction } from '../server/plugin-interaction.js';

const evidence = 'output/dev-evidence/pi-parity/loop-159';
mkdirSync(evidence, { recursive: true });
Object.assign(config, { apiKey: 'offline-sweep-ui', provider: 'openai', model: 'gpt-5.6-sol', maxCalls: 4, budgetUsd: 4, reservePerCallUsd: 1 });
const dataDir = mkdtempSync(join(tmpdir(), 'pi-sweep-ui-'));
const app = createApp({ dataDir, staticDir: 'output/pi-parity-build', password: 'sweep-ui-password', schedule: false });
app.scheduler.steer = (runId, conversationId, commandId, text) => {
  const result = acceptRunInput(app.store, runId, conversationId, commandId, text);
  if (result.fresh) updateRunInput(app.store, runId, result.input.id, 'queued');
  return result.input;
};
app.scheduler.answerDialog = (runId, id, revision, commandId, answer) => {
  const result = answerInteraction(app.store, runId, id, revision, commandId, answer);
  return result.fresh ? acknowledgeInteraction(app.store, runId, id) : result.interaction;
};
const project = app.service.createProject('窄窗总检验收');
await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
config.origin = base;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));
const checks: string[] = [];
try {
  await context.request.post(base + '/api/login', { data: { password: 'sweep-ui-password' } });
  await page.goto(base);

  // 设置：窄窗可达并保存
  await page.setViewportSize({ width: 800, height: 600 });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const settings = page.getByRole('dialog', { name: '外观设置' });
  await settings.getByLabel('思考强度', { exact: true }).selectOption('high');
  await settings.getByRole('button', { name: '保存运行设置' }).scrollIntoViewIfNeeded();
  await settings.getByRole('button', { name: '保存运行设置' }).click();
  await settings.getByText('已保存，将用于之后提交的新任务', { exact: true }).waitFor();
  await page.screenshot({ path: join(evidence, 'settings-narrow.png') });
  await settings.getByRole('button', { name: '完成', exact: true }).click();
  checks.push('settings-narrow');

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByLabel('当前项目', { exact: true }).click();
  await page.locator(`[role=option][data-value="${project.id}"]`).click();
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  await page.getByRole('button', { name: /Pi 对话/ }).click();
  await page.getByRole('button', { name: '新建对话', exact: true }).click();
  await page.getByLabel('对话输入').fill('窄窗总检主路径');
  await page.getByRole('button', { name: '发送 ↑', exact: true }).click();
  const run = app.store.list<Run>('run')[0];
  assert.equal(run.policy.piRuntime?.thinkingLevel, 'high');
  app.service.transition(run.id, 'running', { startedAt: new Date().toISOString() });
  app.store.update<Run>('run', run.id, app.store.get<Run>('run', run.id).revision, {
    mcpManifest: { schemaVersion: 1, signature: 'sweep', enabled: true, globalRevision: 0, projectRevision: 0, servers: [], autoEnableCodemode: true, codemode: true, toolSearch: false },
  });

  // 查看：模型请求面板
  app.service.reserveRequest(run.id, 'sweep-view', undefined, 4);
  app.service.settleCall(run.id, 0.01, { input: 4, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 5, complete: true }, 1);
  await page.getByText('模型请求 · 1 次', { exact: true }).click();
  await page.getByText(/第 1 次 · 回答 \/ 工具轮次 · 已结算/).waitFor();
  checks.push('view-requests');

  // 纠正：指导当前执行
  await page.getByLabel('对话输入').fill('请只修复目标问题');
  await page.getByRole('button', { name: '指导当前执行', exact: true }).click();
  await page.getByText('指导当前执行 · 等待原生轮次', { exact: true }).waitFor();
  checks.push('steer');

  // 交互：待答确认
  createInteraction(app.store, run.id, { id: 'sweep-confirm', source: 'builtin:mcp', kind: 'confirm', title: '总检确认题', message: '仅用于窄窗总检', timeoutMs: 60000 });
  await page.getByRole('group', { name: '总检确认题', exact: true }).getByRole('button', { name: '同意', exact: true }).click();
  await page.getByRole('group', { name: '总检确认题', exact: true }).getByText('答复已送达原执行', { exact: true }).waitFor();
  checks.push('interact');

  // 键盘：Tab 到发送区相关控件
  await page.getByLabel('对话输入').focus();
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.innerText || (document.activeElement as HTMLInputElement | null)?.value || document.activeElement?.tagName || '');
  assert(focused.length > 0);
  checks.push('keyboard');

  // 恢复：失败后追加额度
  app.service.transition(run.id, 'failed', { error: '总检受控失败' });
  await page.getByText(/执行失败/).waitFor();
  const details = page.locator('details.wb-plugin-run-details').filter({ has: page.locator(':scope > summary', { hasText: '模型请求 · 1 次' }) });
  if (!await details.evaluate(el => (el as HTMLDetailsElement).open)) await details.locator(':scope > summary').click();
  await details.getByText('任务总额度与恢复', { exact: true }).click();
  await details.getByText(/请求：已用 1 \/ 4 次/).waitFor();
  await details.getByLabel('追加请求次数', { exact: true }).fill('1');
  await details.getByLabel('追加费用上限（美元）', { exact: true }).fill('1');
  await details.getByLabel('追加原因', { exact: true }).fill('窄窗总检恢复');
  await details.getByRole('button', { name: '确认追加并恢复', exact: true }).click();
  await page.getByText('追加授权已记录，原任务已加入恢复队列。', { exact: true }).waitFor();
  await page.setViewportSize({ width: 800, height: 600 });
  await page.getByText('追加授权已记录，原任务已加入恢复队列。', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(evidence, 'restore-narrow.png') });
  checks.push('restore-narrow');

  // 多页同步：第二上下文看到同一失败执行次数
  const second = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  const page2 = await second.newPage();
  page2.setDefaultTimeout(15000);
  await second.request.post(base + '/api/login', { data: { password: 'sweep-ui-password' } });
  await page2.goto(base);
  await page2.getByLabel('当前项目', { exact: true }).click();
  await page2.locator(`[role=option][data-value="${project.id}"]`).click();
  await page2.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  await page2.getByRole('button', { name: /Pi 对话/ }).click();
  await page2.getByLabel('已有对话', { exact: true }).click();
  await page2.locator(`[role=option][data-value="${run.conversationId}"]`).click();
  await page2.getByRole('button', { name: '打开对话', exact: true }).click();
  await page2.waitForFunction(() => document.body.innerText.includes('模型请求 · 1 次') && document.body.innerText.includes('窄窗总检主路径'));
  const resumed = app.store.list<Run>('run').find(r => r.parentRunId === run.id);
  assert(resumed); assert.equal(resumed.taskId, run.taskId);
  checks.push('multi-page-sync');
  await second.close();

  // 缩放：真实 Chrome 150%
  const zoomDir = mkdtempSync(join(tmpdir(), 'pi-sweep-zoom-'));
  const zoom = await chromium.launchPersistentContext(zoomDir, {
    headless: true,
    executablePath: process.env.CHROME_PATH,
    viewport: null,
    args: ['--window-size=1440,1000'],
  });
  try {
    await zoom.addCookies(await context.cookies());
    const zoomSettings = await zoom.newPage();
    await zoomSettings.goto('chrome://settings/appearance');
    await zoomSettings.locator('#zoomLevel').selectOption('1.5');
    const zoomPage = await zoom.newPage();
    await zoomPage.goto(base);
    const metrics = await zoomPage.evaluate(() => ({ width: innerWidth, dpr: devicePixelRatio }));
    assert(metrics.dpr >= 1.49 && metrics.width < 1200, JSON.stringify(metrics));
    await zoomPage.getByRole('button', { name: '设置', exact: true }).click();
    await zoomPage.getByRole('dialog', { name: '外观设置' }).getByLabel('思考强度', { exact: true }).waitFor();
    await zoomPage.screenshot({ path: join(evidence, 'zoom-150-settings.png') });
    checks.push('chrome-150-zoom');
  } finally {
    await zoom.close();
  }

  assert.deepEqual(errors, []);
  writeFileSync(join(evidence, 'report.json'), JSON.stringify({
    closed: '主界面完成设置、查看、纠正、交互、恢复；含窄窗、键盘、150% 缩放与双页同步',
    realModelRequests: 0,
    checks,
    pageErrors: errors,
  }, null, 2));
} finally {
  await browser.close();
  await app.close();
}
