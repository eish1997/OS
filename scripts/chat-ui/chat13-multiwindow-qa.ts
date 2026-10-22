/**
 * CHAT-13 / CHV-17,18,20: multi-window via toolbar「＋ 窗口」user path (no layout fixture),
 * float/focus, narrow viewport, IME composition guard. System OS IME/clipboard: capability note.
 */
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { blockedExternalConnects } from './block-external.ts';
import { createApp } from '../../server/app.js';
import { config } from '../../server/config.js';
import type { Conversation, Run } from '../../shared/contracts.js';
import { CHAT_UI_DESIGN } from '../../shared/chat-ui-design.js';

const evidence = resolve(process.env.CHAT_UI_EVIDENCE || 'output/dev-evidence/chat-ui/loop-001');
const staticDir = process.env.CHAT_UI_STATIC || 'output/chat-ui-build';
fs.mkdirSync(evidence, { recursive: true });
assert.equal(process.env.WORKBENCH_SKIP_DOTENV, '1');

Object.assign(config, {
  apiKey: 'offline-chat-ui-only',
  provider: 'openai',
  model: 'gpt-5.6-sol',
  maxCalls: 8,
  budgetUsd: 8,
  reservePerCallUsd: 1,
});

const dataDir = fs.mkdtempSync(join(tmpdir(), 'chat-ui-chat13-'));
const app = createApp({ dataDir, staticDir, password: 'chat-ui-offline', schedule: false });
const projectA = app.service.createProject('CHAT-13 项目A');
const projectB = app.service.createProject('CHAT-13 项目B');
const topicA1 = app.service.createConversation(projectA.id, 'CHAT-13 话题甲', crypto.randomUUID());
const topicA2 = app.service.createConversation(projectA.id, 'CHAT-13 话题乙', crypto.randomUUID());
const topicB = app.service.createConversation(projectB.id, 'CHAT-13 他项目话题', crypto.randomUUID());

await new Promise<void>((done) => app.server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
config.origin = base;

const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ headless: true, executablePath: chrome });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(25000);
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
const report: Record<string, unknown> = {
  at: new Date().toISOString(),
  staticDir,
  realModelRequests: 0,
  blockedExternalConnectsBefore: blockedExternalConnects(),
  secondWindowPath: 'toolbar-plus-window',
  layoutFixtureUsed: false,
  systemIme: 'ime-candidate-tool-limit-see-ime-clipboard-capability.json',
  systemClipboard: 'os-text-paste-passed-in-chv07-09-os-gui; image/ime still limited — see ime-clipboard-capability.json',
  designVersion: CHAT_UI_DESIGN.version,
};

async function seed(conversation: Conversation, goal: string) {
  const res = await context.request.post(base + '/api/tasks', {
    data: {
      projectId: conversation.projectId,
      conversationId: conversation.id,
      goal,
      commandId: crypto.randomUUID(),
      mode: 'pi',
      continueFromRunId: null,
    },
  });
  assert.equal(res.ok(), true, await res.text());
  const body = (await res.json()) as { run: Run };
  let run = app.store.get<Run>('run', body.run.id);
  run = app.service.transition(run.id, 'running', { startedAt: new Date().toISOString() });
  app.service.transition(run.id, 'completed', { endedAt: new Date().toISOString() });
}

async function openTopicInEmptyChat(topicId: string) {
  await page.getByLabel('已有对话', { exact: true }).click();
  await page.locator(`[role=option][data-value="${topicId}"]`).click();
  await page.getByRole('button', { name: '打开对话', exact: true }).click();
}

try {
  await context.request.post(base + '/api/login', { data: { password: 'chat-ui-offline' } });
  await seed(topicA1, 'CHAT-13 甲历史标记 UNIQUE_A1');
  await seed(topicA2, 'CHAT-13 乙历史标记 UNIQUE_A2');
  await seed(topicB, 'CHAT-13 跨项目标记 UNIQUE_B');

  await page.goto(base);
  await page.getByLabel('当前项目', { exact: true }).click();
  await page.locator(`[role=option][data-value="${projectA.id}"]`).click();

  // First chat via toolbar (docks into preferred empty leaf)
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  await page.getByRole('button', { name: /Pi 对话/ }).click();
  await openTopicInEmptyChat(topicA1.id);
  const pane1 = page.locator('.wb-chat-pane').first();
  await pane1.getByText('UNIQUE_A1').waitFor();
  await pane1.getByLabel('对话输入', { exact: true }).fill('草稿甲窗 UNIQUE_DRAFT_1');
  report.firstWindowToolbar = true;

  // Second chat via same toolbar path (no layout fixture). Empty picker has no .wb-chat-pane yet.
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  await page.getByRole('button', { name: /Pi 对话/ }).click();
  await page.waitForFunction(() => /2 个窗口/.test(document.querySelector('.wb-status')?.textContent || ''));
  report.secondWindowToolbar = true;
  report.windowCountStatus = await page.locator('.wb-status').innerText();

  // Bind same topic in the unbound chat shell (scoped to empty picker, not pane1)
  const unbound = page.locator('.wb-window-body .wb-empty').filter({ has: page.getByLabel('已有对话', { exact: true }) }).last();
  await unbound.getByLabel('已有对话', { exact: true }).click();
  await page.locator(`[role=option][data-value="${topicA1.id}"]`).click();
  await unbound.getByRole('button', { name: '打开对话', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.wb-chat-pane').length >= 2);
  const pane2 = page.locator('.wb-chat-pane').nth(1);
  await pane2.getByText('UNIQUE_A1').waitFor();
  await pane2.getByLabel('对话输入', { exact: true }).fill('草稿乙窗 UNIQUE_DRAFT_2');
  assert.equal(await pane1.getByLabel('对话输入', { exact: true }).inputValue(), '草稿甲窗 UNIQUE_DRAFT_1');
  assert.equal(await pane2.getByLabel('对话输入', { exact: true }).inputValue(), '草稿乙窗 UNIQUE_DRAFT_2');
  await pane2.getByLabel('对话输入', { exact: true }).fill('草稿乙窗已改 UNIQUE_DRAFT_2b');
  assert.equal(await pane1.getByLabel('对话输入', { exact: true }).inputValue(), '草稿甲窗 UNIQUE_DRAFT_1');
  report.sameTopicTwoWindows = true;
  report.secondWindowPlacement =
    (await page.locator('.wb-floating [data-window], .wb-float [data-window]').count()) > 0 ? 'floating' : 'docked-empty-leaf';

  // Switch window 2 to topic A2 — window 1 draft/history stay
  if (await pane2.getByLabel('切换话题', { exact: true }).count()) {
    await pane2.getByLabel('切换话题', { exact: true }).selectOption({ value: topicA2.id });
  } else {
    await pane2.getByLabel('已有对话', { exact: true }).click();
    await page.locator(`[role=option][data-value="${topicA2.id}"]`).click();
    await pane2.getByRole('button', { name: '打开对话', exact: true }).click();
  }
  await pane2.getByText('UNIQUE_A2').waitFor();
  assert.equal(await pane1.getByLabel('对话输入', { exact: true }).inputValue(), '草稿甲窗 UNIQUE_DRAFT_1');
  await pane1.getByText('UNIQUE_A1').waitFor();
  assert.equal(await pane1.getByText('UNIQUE_A2').count(), 0);
  report.twoTopicsIsolated = true;

  const histA = await context.request.get(base + `/api/conversations/${topicA1.id}/messages`);
  const histB = await context.request.get(base + `/api/conversations/${topicB.id}/messages`);
  assert.equal(histA.ok(), true);
  assert.equal(histB.ok(), true);
  const textA = JSON.stringify(await histA.json());
  const textB = JSON.stringify(await histB.json());
  assert.match(textA, /UNIQUE_A1/);
  assert.doesNotMatch(textA, /UNIQUE_B/);
  assert.match(textB, /UNIQUE_B/);
  assert.doesNotMatch(textB, /UNIQUE_A1/);
  assert.equal(await pane1.getByText('UNIQUE_B').count(), 0);
  report.crossProject = true;

  if (await page.getByLabel('停靠到当前空间', { exact: true }).count()) {
    await page.getByLabel('停靠到当前空间', { exact: true }).first().click();
    report.docked = true;
  }
  if (await page.getByRole('button', { name: '聚焦对话', exact: true }).count()) {
    await page.getByRole('button', { name: '聚焦对话', exact: true }).first().click();
    await page.getByRole('button', { name: '还原位置', exact: true }).first().waitFor();
    await page.getByRole('button', { name: '还原位置', exact: true }).first().click();
    await page.getByRole('button', { name: '聚焦对话', exact: true }).first().waitFor();
    report.focusRestore = true;
  } else if (await page.getByLabel('悬浮', { exact: true }).count()) {
    await page.getByLabel('悬浮', { exact: true }).first().click();
    report.floatedViaButton = true;
    if (await page.getByRole('button', { name: '聚焦对话', exact: true }).count()) {
      await page.getByRole('button', { name: '聚焦对话', exact: true }).first().click();
      await page.getByRole('button', { name: '还原位置', exact: true }).first().click();
      report.focusRestore = true;
    }
  }

  await page.setViewportSize({ width: 800, height: 600 });
  const narrow = await page.locator('.wb-chat-pane').first().evaluate((pane) => {
    const zoom = Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    const field = pane.querySelector('[aria-label="对话输入"]');
    if (!field) return { ok: false, zoom: 0, paneHeight: 0, inputVisualPx: 0 };
    return {
      ok: true,
      zoom,
      paneHeight: pane.getBoundingClientRect().height,
      inputVisualPx: field.getBoundingClientRect().height,
    };
  });
  assert.equal(narrow.ok, true);
  report.narrow = narrow;

  await page.setViewportSize({ width: 1366, height: 900 });
  const input = page.locator('.wb-chat-pane [aria-label="对话输入"]').first();
  await input.fill('组合输入守卫 UNIQUE_IME');
  await input.evaluate((el) => {
    el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const ke = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(ke, 'isComposing', { value: true });
    Object.defineProperty(ke, 'keyCode', { value: 229 });
    el.dispatchEvent(ke);
  });
  assert.equal(await input.inputValue(), '组合输入守卫 UNIQUE_IME');
  report.imeCompositionGuard = true;

  const layer = await page.locator('.wb-root').evaluate((root) => ({
    canvasOn: root.classList.contains('canvas-on'),
    hasChatPane: Boolean(root.querySelector('.wb-chat-pane')),
    hasFloating: Boolean(root.querySelector('.wb-floating, .wb-float')),
  }));
  assert.equal(layer.canvasOn, false);
  assert.equal(layer.hasChatPane, true);
  report.canvasLayerSmoke = layer;

  assert.deepEqual(errors, []);
  report.blockedExternalConnectsAfter = blockedExternalConnects();
  report.passed = true;
  await page.screenshot({ path: join(evidence, 'chat13-multiwindow.png'), fullPage: true });
  fs.writeFileSync(join(evidence, 'chat13-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, evidence: join(evidence, 'chat13-report.json'), report }));
} catch (error) {
  report.passed = false;
  report.failure = String(error);
  report.pageErrors = errors;
  await page.screenshot({ path: join(evidence, 'chat13-failure.png') }).catch(() => {});
  fs.writeFileSync(join(evidence, 'chat13-report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
  await app.close();
}
