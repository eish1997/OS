import { chromium } from 'playwright-core';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import { PiTextStream } from '../server/pi-text-stream.js';
import { PiToolStream } from '../server/pi-tool-stream.js';
import { persistTextChunk } from '../server/run-stream.js';
import { persistToolProgress, toolExecutions } from '../server/tool-progress.js';
import type { Run } from '../shared/contracts.js';
import type { ToolProgress } from '../shared/run-stream.js';

const evidence = 'output/dev-evidence/pi-parity/loop-152';
mkdirSync(evidence, { recursive: true });
Object.assign(config, { apiKey: 'offline-ui-only', provider: 'openai', model: 'gpt-5.6-sol', maxCalls: 4, budgetUsd: 4, reservePerCallUsd: 1 });
const dataDir = mkdtempSync(join(tmpdir(), 'pi-stream-ui-'));
const app = createApp({ dataDir, staticDir: 'output/pi-parity-build', password: 'stream-ui-password', schedule: false });
const project = app.service.createProject('流式页面验收');
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
  await context.request.post(base + '/api/login', { data: { password: 'stream-ui-password' } });
  await page.goto(base);
  await page.getByLabel('当前项目', { exact: true }).click();
  await page.locator(`[role=option][data-value="${project.id}"]`).click();
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  await page.getByRole('button', { name: /Pi 对话/ }).click();
  await page.getByRole('button', { name: '新建对话', exact: true }).click();
  await page.getByLabel('对话输入').fill('流式后缀与工具预览');
  await page.getByRole('button', { name: '发送 ↑', exact: true }).click();
  const run = app.store.list<Run>('run')[0];
  app.service.transition(run.id, 'running', { startedAt: new Date().toISOString() });

  const text = new PiTextStream(async chunk => persistTextChunk(app.store, run.id, chunk), error => { throw error; });
  text.observe({ type: 'message_start', message: { role: 'assistant' } } as never);
  text.observe({ type: 'message_update', message: { role: 'assistant' }, assistantMessageEvent: { type: 'text_delta', delta: '可见前缀' } } as never);
  await page.getByText('可见前缀', { exact: true }).waitFor();
  text.observe({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: '可见前缀加上后缀' }], stopReason: 'stop' } } as never);
  await text.finish();
  await page.getByText('可见前缀加上后缀', { exact: true }).waitFor();
  await page.reload();
  await page.getByText('可见前缀加上后缀', { exact: true }).waitFor();
  assert.equal(await page.getByText('可见前缀加上后缀', { exact: true }).count(), 1);
  await page.screenshot({ path: join(evidence, 'stream-suffix.png') });

  const tools = new PiToolStream(run.id, () => '工作台/原生工具', async (type, value) => {
    if (type === 'tool_progress') persistToolProgress(app.store, run.id, value as ToolProgress);
  }, () => { throw new Error('tool stream failed'); });
  tools.observe({ type: 'tool_execution_start', toolCallId: 'preview-call', toolName: 'read', args: {} } as never);
  await page.getByText('模型请求 · 0 次', { exact: true }).click();
  await page.getByText('实际工具调用', { exact: true }).click();
  await page.getByText('开始执行', { exact: true }).waitFor();
  tools.observe({ type: 'tool_execution_update', toolCallId: 'preview-call', partialResult: { content: [{ type: 'text', text: '收尾前预览' }] } } as never);
  await tools.finish();
  await page.getByText('收尾前预览', { exact: true }).waitFor();
  const saved = toolExecutions(app.store, run.id).items.find(item => item.callId === 'preview-call');
  assert.equal(saved?.phase, 'running');
  assert.equal(saved?.preview, '收尾前预览');
  await page.reload();
  await page.getByText('模型请求 · 0 次', { exact: true }).click();
  await page.getByText('实际工具调用', { exact: true }).click();
  await page.getByText('收尾前预览', { exact: true }).waitFor();
  await page.screenshot({ path: join(evidence, 'tool-preview.png') });
  assert.deepEqual(errors, []);
  writeFileSync(join(evidence, 'report.json'), JSON.stringify({
    closed: '页面能看到最终回复后缀，刷新后仍是同一条；工具面板能看到收尾前补上的预览，刷新后仍在',
    browserClicked: true,
    streamSuffixVisible: true,
    streamSuffixAfterReload: true,
    toolPreviewFlushedOnFinish: true,
    toolPreviewAfterReload: true,
    realModels: 0,
    delivery: false,
    pivMatrix: false,
  }, null, 2));
} finally {
  await browser.close();
  await app.close();
}
