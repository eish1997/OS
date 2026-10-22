/**
 * Empirical probe: can orca computer drive Windows IME candidate-confirm into 对话输入?
 * Not Playwright CompositionEvent. Records concrete tool limits; does not claim CHV-07 OS IME passed.
 */
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../../server/app.js';
import { config } from '../../server/config.js';

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

const password = 'chat-ui-offline';
const dataDir = fs.mkdtempSync(join(tmpdir(), 'chat-ui-ime-probe-'));
const app = createApp({ dataDir, staticDir, password, schedule: false });
const project = app.service.createProject('输入法探测样例');
await new Promise<void>((done) => app.server.listen(0, '127.0.0.1', done));
const port = (app.server.address() as { port: number }).port;
const base = `http://127.0.0.1:${port}`;
config.origin = base;

const report: Record<string, unknown> = {
  at: new Date().toISOString(),
  purpose: 'Empirical Windows IME candidate-confirm via orca computer',
  staticDir,
  base,
  realModelRequests: 0,
};

function orca(args: string[]) {
  const run = spawnSync('orca', ['computer', ...args, '--json'], {
    encoding: 'utf8',
    shell: false,
    timeout: 60000,
  });
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(run.stdout || '{}') as Record<string, unknown>;
  } catch {
    /* */
  }
  return {
    ok: run.status === 0 && Boolean((json as { ok?: boolean } | null)?.ok),
    raw: ((run.stdout || '') + (run.stderr || '')).slice(0, 3000),
    json,
  };
}

function findIndex(treeText: string, re: RegExp): number | null {
  for (const line of treeText.split(/\r?\n/)) {
    const m = line.match(/^\s*(\d+)\s+/);
    if (!m) continue;
    if (re.test(line)) return Number(m[1]);
  }
  return null;
}

function listChromePids(): number[] {
  const apps = orca(['list-apps']);
  return (
    (apps.json?.result as { apps?: { name?: string; bundleId?: string; pid?: number }[] })?.apps || []
  )
    .filter((a) => /chrome/i.test(a.name || '') || /chrome/i.test(a.bundleId || ''))
    .map((a) => a.pid)
    .filter((p): p is number => typeof p === 'number');
}

const before = new Set(listChromePids());
const chromePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({
  headless: false,
  executablePath: chromePath,
  args: ['--start-maximized'],
});
const context = await browser.newContext({ viewport: null });
const page = await context.newPage();
page.setDefaultTimeout(30000);

try {
  await page.goto(base + '/workbench');
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '进入工作台' }).click();
  await page.waitForSelector('.wb-root');
  await page.getByLabel('当前项目', { exact: true }).click();
  await page.locator(`[role=option][data-value="${project.id}"]`).click();
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  await page.getByRole('button', { name: /Pi 对话/ }).click();
  await page.getByRole('button', { name: '新建对话', exact: true }).click();
  const input = page.getByLabel('对话输入', { exact: true });
  await input.waitFor();
  const titleMarker = `IMEPROBE-${port}-UNIQUE`;
  await page.evaluate((t) => {
    document.title = t;
  }, titleMarker);
  await delay(400);

  const newPids = listChromePids().filter((p) => !before.has(p));
  const pwPid = newPids[0];
  assert.ok(pwPid, 'Playwright chrome pid missing');
  const wins = orca(['list-windows', '--app', `pid:${pwPid}`]);
  const listed =
    ((wins.json?.result as { windows?: { id?: number; title?: string; index?: number }[] })?.windows ||
      []) ;
  const hit =
    listed.find((w) => (w.title || '').includes(titleMarker)) ||
    listed.find((w) => /IMEPROBE|工作台|Google Chrome/i.test(w.title || ''));
  assert.ok(hit, `window not found for ${titleMarker}`);
  const windowArgs = ['--app', `pid:${pwPid}`, '--window-id', String(hit.id)];
  report.target = { pwPid, hit };

  const pre = orca(['get-app-state', ...windowArgs, '--restore-window', '--no-screenshot']);
  let tree = ((pre.json?.result as { snapshot?: { treeText?: string } })?.snapshot?.treeText) || '';
  let a11y = findIndex(tree, /对话输入/);
  for (let i = 0; i < 5 && a11y === null; i++) {
    await input.click();
    await delay(300);
    tree =
      ((orca(['get-app-state', ...windowArgs, '--restore-window', '--no-screenshot']).json?.result as {
        snapshot?: { treeText?: string };
      })?.snapshot?.treeText) || '';
    a11y = findIndex(tree, /对话输入/);
  }
  assert.ok(a11y !== null, 'composer a11y missing');
  orca(['click', ...windowArgs, '--element-index', String(a11y), '--restore-window', '--no-screenshot']);
  await delay(200);
  await input.fill('');

  // Clear composer via set-value then OS-focus
  orca([
    'set-value',
    ...windowArgs,
    '--element-index',
    String(a11y),
    '--value',
    '',
    '--restore-window',
    '--no-screenshot',
  ]);
  await delay(150);
  orca(['click', ...windowArgs, '--element-index', String(a11y), '--restore-window', '--no-screenshot']);
  await delay(200);

  // IME switch: Win unsupported on this host — try Ctrl+Space (common MS Pinyin toggle)
  const switchAttempts: { key: string; ok: boolean; raw: string }[] = [];
  for (const key of ['Ctrl+Space', 'CmdOrCtrl+Space', 'Alt+Shift']) {
    const sw = orca(['hotkey', ...windowArgs, '--key', key, '--restore-window', '--no-screenshot']);
    switchAttempts.push({ key, ok: sw.ok, raw: sw.raw.slice(0, 240) });
    await delay(250);
  }
  report.imeSwitchAttempts = switchAttempts;
  orca(['click', ...windowArgs, '--element-index', String(a11y), '--restore-window', '--no-screenshot']);
  await delay(200);

  const beforeLetters = await input.inputValue();
  report.composerBeforeLetters = beforeLetters;

  const letters = ['n', 'i', 'h', 'a', 'o'];
  const letterResults: { key: string; ok: boolean }[] = [];
  for (const key of letters) {
    const r = orca(['press-key', ...windowArgs, '--key', key, '--restore-window', '--no-screenshot']);
    letterResults.push({ key, ok: r.ok });
    await delay(150);
  }
  report.letterByLetter = letterResults;
  await delay(600);

  const appsDuring = orca(['list-apps']);
  report.appsDuringComposition = (
    (appsDuring.json?.result as { apps?: { name?: string; pid?: number }[] })?.apps || []
  ).map((a) => ({ name: a.name, pid: a.pid }));
  const imeHostApp = (report.appsDuringComposition as { name?: string }[]).find((a) =>
    /TextInputHost|InputApp|拼音|Pinyin|IME|Ctfmon|候选/i.test(a.name || ''),
  );

  const mid = orca(['get-app-state', ...windowArgs, '--restore-window', '--no-screenshot']);
  const midTree =
    ((mid.json?.result as { snapshot?: { treeText?: string } })?.snapshot?.treeText) || '';
  fs.writeFileSync(join(evidence, 'chv07-ime-tree-after-pinyin.txt'), midTree);
  const treeSansLabels = midTree
    .split(/\r?\n/)
    .filter((line) => !/输入法探测样例|IMEPROBE|对话输入/.test(line))
    .join('\n');
  const candidateHit =
    /微软拼音|Microsoft.?Pinyin|Candidate|候选列表|候选窗口|输入法候选/i.test(treeSansLabels);
  report.candidateUiInTree = candidateHit;
  report.imeHostApp = imeHostApp || null;

  const afterPinyin = await input.inputValue();
  report.composerAfterPinyin = afterPinyin;
  // Visible latin composition OR soft composition (empty value while IME holds pinyin)
  const looksLikeComposition = /^[a-z]+$/i.test(afterPinyin.trim()) && /nihao/i.test(afterPinyin);
  const softComposition = afterPinyin.trim() === '' && letterResults.every((r) => r.ok);

  // Confirm first candidate with digit 1 (MS Pinyin)
  const confirm1 = orca(['press-key', ...windowArgs, '--key', '1', '--restore-window', '--no-screenshot']);
  await delay(500);
  report.confirmKeys = { one: confirm1.ok };
  const afterConfirm = await input.inputValue();
  report.composerAfterConfirm = afterConfirm;
  const hasChinese = /[\u4e00-\u9fff]/.test(afterConfirm);
  const noLatinLeft = !/[a-z]/i.test(afterConfirm.replace(/\s/g, ''));
  const latinGone = looksLikeComposition && noLatinLeft;
  report.chineseAppearedAfterConfirm = hasChinese;
  report.latinCompositionCleared = latinGone;

  // Path A: visible nihao → Chinese. Path B: soft composition (empty) → Chinese after 1.
  const imeCandidateVerified = Boolean(
    hasChinese &&
      noLatinLeft &&
      ((looksLikeComposition && latinGone) || softComposition),
  );

  await page.screenshot({ path: join(evidence, 'chv07-ime-candidate-probe.png'), fullPage: true });

  report.verdict = {
    imeCandidateConfirm: imeCandidateVerified ? 'verified' : 'not-achieved',
    reason: imeCandidateVerified
      ? looksLikeComposition
        ? 'visible pinyin then digit-1 → Chinese (OS IME candidate)'
        : 'soft composition (empty value) after letter keys then digit-1 → Chinese (OS IME candidate)'
      : `visibleComp=${looksLikeComposition} softComp=${softComposition} afterPinyin=${JSON.stringify(afterPinyin)} afterConfirm=${JSON.stringify(afterConfirm)} candidateUi=${candidateHit} imeHost=${JSON.stringify(imeHostApp || null)}`,
    typeTextNotEquivalent: true,
    doNotMarkChv07OsImePassed: !imeCandidateVerified,
    note: 'Win+Space unsupported by orca; Ctrl+Space/Alt+Shift attempted; may use pre-selected Chinese IME',
  };
  report.passed = true; // probe completed; CHV-07 OS IME still gated by verdict
  fs.writeFileSync(join(evidence, 'chv07-ime-candidate-probe.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, evidence: join(evidence, 'chv07-ime-candidate-probe.json'), verdict: report.verdict }, null, 2));
} catch (error) {
  report.passed = false;
  report.failure = String(error);
  fs.writeFileSync(join(evidence, 'chv07-ime-candidate-probe.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close().catch(() => undefined);
  await app.close();
}
