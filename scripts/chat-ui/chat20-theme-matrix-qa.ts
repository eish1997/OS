/**
 * CHV-20 remainder: theme × lineWidth matrix applies CSS vars without breaking chat pane.
 */
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { blockedExternalConnects } from './block-external.ts';
import { createApp } from '../../server/app.js';
import { config } from '../../server/config.js';
import { appearanceThemes } from '../../shared/workbench-appearance.js';

const evidence = resolve(process.env.CHAT_UI_EVIDENCE || 'output/dev-evidence/chat-ui/loop-001');
const staticDir = process.env.CHAT_UI_STATIC || 'output/chat-ui-build';
fs.mkdirSync(evidence, { recursive: true });
assert.equal(process.env.WORKBENCH_SKIP_DOTENV, '1');

Object.assign(config, {
  apiKey: 'offline-chat-ui-only',
  provider: 'openai',
  model: 'gpt-5.6-sol',
  maxCalls: 4,
  budgetUsd: 4,
  reservePerCallUsd: 1,
});

const dataDir = fs.mkdtempSync(join(tmpdir(), 'chat-ui-chat20-'));
const app = createApp({ dataDir, staticDir, password: 'chat-ui-offline', schedule: false });
const project = app.service.createProject('CHV-20 主题线宽（离线）');

await new Promise<void>((done) => app.server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
config.origin = base;

const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ headless: true, executablePath: chrome });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(20000);
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
const report: Record<string, unknown> = {
  at: new Date().toISOString(),
  staticDir,
  realModelRequests: 0,
  blockedExternalConnectsBefore: blockedExternalConnects(),
  cells: [] as unknown[],
};

const lineWidths = [0.5, 1, 1.5, 2, 2.5, 3];

try {
  await context.request.post(base + '/api/login', { data: { password: 'chat-ui-offline' } });
  await page.goto(base);
  await page.getByLabel('当前项目', { exact: true }).click();
  await page.locator(`[role=option][data-value="${project.id}"]`).click();
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  await page.getByRole('button', { name: /Pi 对话/ }).click();
  await page.getByRole('button', { name: '新建对话', exact: true }).click();
  await page.locator('.wb-chat-pane').waitFor();

  await page.getByLabel('设置', { exact: true }).click();
  await page.getByRole('dialog').waitFor();

  for (const theme of appearanceThemes) {
    await page.locator(`input[name="workbench-theme"][value="${theme}"]`).check();
    for (const width of lineWidths) {
      await page.locator('#wb-line-width').fill(String(width));
      const cell = await page.locator('.wb-root').evaluate((root, expected) => {
        const style = getComputedStyle(root);
        return {
          theme: expected.theme,
          lineWidth: expected.width,
          cssLineWidth: style.getPropertyValue('--line-width').trim(),
          hasChat: Boolean(root.querySelector('.wb-chat-pane')),
          bg: style.getPropertyValue('--bg-surface').trim() || style.backgroundColor,
        };
      }, { theme, width });
      assert.equal(cell.hasChat, true);
      assert.equal(cell.cssLineWidth, `${width}px`);
      (report.cells as unknown[]).push(cell);
    }
  }

  assert.equal((report.cells as unknown[]).length, appearanceThemes.length * lineWidths.length);
  assert.deepEqual(errors, []);
  report.blockedExternalConnectsAfter = blockedExternalConnects();
  report.passed = true;
  await page.screenshot({ path: join(evidence, 'chat20-theme-matrix.png'), fullPage: true });
  fs.writeFileSync(join(evidence, 'chat20-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, evidence: join(evidence, 'chat20-report.json'), cells: (report.cells as unknown[]).length }));
} catch (error) {
  report.passed = false;
  report.failure = String(error);
  report.pageErrors = errors;
  await page.screenshot({ path: join(evidence, 'chat20-failure.png') }).catch(() => {});
  fs.writeFileSync(join(evidence, 'chat20-report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
  await app.close();
}
