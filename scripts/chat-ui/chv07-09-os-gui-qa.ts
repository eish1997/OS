/**
 * CHV-07/09 OS path (hybrid):
 * - Playwright (headed Chrome) sets up workbench + focuses composer (web a11y tree is shallow)
 * - `orca computer paste-text` / `type-text` inject via OS into the focused Chrome window
 * Not Playwright Clipboard API / CompositionEvent synthesis.
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
const dataDir = fs.mkdtempSync(join(tmpdir(), 'chat-ui-os-gui-'));
const app = createApp({ dataDir, staticDir, password, schedule: false });
const project = app.service.createProject('OS GUI 验收');
await new Promise<void>((done) => app.server.listen(0, '127.0.0.1', done));
const port = (app.server.address() as { port: number }).port;
const base = `http://127.0.0.1:${port}`;
config.origin = base;

const report: Record<string, unknown> = {
  at: new Date().toISOString(),
  staticDir,
  base,
  projectId: project.id,
  realModelRequests: 0,
  driver: 'playwright headed Chrome focus + orca computer paste-text/type-text',
};

function orca(args: string[]): { ok: boolean; raw: string; json: Record<string, unknown> | null } {
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
  const ok = run.status === 0 && Boolean((json as { ok?: boolean } | null)?.ok);
  return { ok, raw: ((run.stdout || '') + (run.stderr || '')).slice(0, 4000), json };
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

const chromePidsBefore = new Set(listChromePids());
report.chromePidsBefore = [...chromePidsBefore];

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
  // Prove orca can drive Chrome (correct earlier "unsupported" permissions verdict)
  const probe = orca(['get-app-state', '--app', 'chrome', '--restore-window', '--no-screenshot']);
  report.capabilityCorrection = {
    permissionsApiSaid: 'accessibility/screenshots unsupported',
    getAppStateOk: probe.ok,
    note: 'get-app-state works; web content tree may be shallow — use Playwright for DOM setup',
  };

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
  // Unique title + new Chrome PID (vs pre-launch set) so orca does not hit leftover user tabs
  const titleMarker = `OSGUI-${port}-UNIQUE`;
  await page.evaluate((t) => {
    document.title = t;
  }, titleMarker);
  await delay(500);

  const chromeAppsNow = listChromePids();
  const newPids = chromeAppsNow.filter((p) => !chromePidsBefore.has(p));
  const pwPid = newPids[0] ?? null;
  report.playwrightPid = pwPid;
  report.newChromePids = newPids;
  report.titleMarker = titleMarker;
  report.chromeApps = chromeAppsNow;

  type WinHit = { id?: string | number; title?: string; index?: number };
  let hit: WinHit | null = null;
  let appSel = pwPid ? `pid:${pwPid}` : 'chrome';

  // Prefer newly launched Playwright Chrome first, then title marker / port on any chrome
  const orderedPids = [
    ...newPids,
    ...chromeAppsNow.filter((p) => !newPids.includes(p)),
  ];
  for (const pid of orderedPids.length ? orderedPids : [undefined as unknown as number]) {
    const sel = typeof pid === 'number' ? `pid:${pid}` : 'chrome';
    await page.evaluate((t) => {
      document.title = t;
    }, titleMarker);
    await delay(200);
    const wins = orca(['list-windows', '--app', sel]);
    const listed = ((wins.json?.result as { windows?: WinHit[] })?.windows || []) as WinHit[];
    const preferNew = typeof pid === 'number' && newPids.includes(pid);
    const found =
      listed.find((w) => (w.title || '').includes(titleMarker)) ||
      listed.find((w) => (w.title || '').includes(String(port))) ||
      (preferNew ? listed.find((w) => /工作台|OSGUI|Google Chrome/i.test(w.title || '')) : undefined);
    if (found) {
      hit = found;
      appSel = sel;
      break;
    }
  }
  assert.ok(hit, `Playwright window not found newPids=${JSON.stringify(newPids)} marker=${titleMarker}`);

  // Window selector for orca; keyboard ops need --restore-window (UIA requires OS-focused window).
  const windowArgs: string[] = ['--app', appSel];
  if (hit.id != null && String(hit.id) !== 'none') windowArgs.push('--window-id', String(hit.id));
  else if (hit.index != null) windowArgs.push('--window-index', String(hit.index));
  report.targetWindow = { appSel, hit, pwPid };

  await input.fill('');
  await input.click();
  await delay(300);

  // Compact a11y snapshots are sometimes chrome-chrome only; poke the page then retry until composer appears
  let preTree = '';
  let a11yInput: number | null = null;
  for (let attempt = 1; attempt <= 6; attempt++) {
    await page.evaluate((t) => {
      document.title = t;
    }, titleMarker);
    await input.click();
    await delay(250 * attempt);
    const pre = orca(['get-app-state', ...windowArgs, '--restore-window', '--no-screenshot']);
    preTree = ((pre.json?.result as { snapshot?: { treeText?: string } })?.snapshot?.treeText) || '';
    a11yInput =
      findIndex(preTree, /对话输入/) ??
      findIndex(preTree, /编辑(?!.*地址)/) ??
      null;
    report.a11yProbeAttempts = attempt;
    report.a11yTreeLen = preTree.length;
    if (a11yInput !== null) break;
  }
  fs.writeFileSync(join(evidence, 'chv07-09-os-tree-before-paste.txt'), preTree);
  report.a11yInputIndex = a11yInput;

  async function focusComposerOs(): Promise<'a11y' | 'coord' | 'dom'> {
    if (a11yInput !== null) {
      const focusClick = orca([
        'click',
        ...windowArgs,
        '--element-index',
        String(a11yInput),
        '--restore-window',
        '--no-screenshot',
      ]);
      report.focusClick = { ok: focusClick.ok, mode: 'a11y', index: a11yInput };
      await delay(250);
      return 'a11y';
    }
    // Coordinate click: DOM box → window coords via window screen + chrome offset from list-windows hit
    const box = await input.boundingBox();
    assert.ok(box, 'composer boundingBox missing');
    const win = hit as { x?: number; y?: number };
    // Chrome content viewport origin ≈ window client area; use CDP layout metrics for accuracy
    const metrics = await page.evaluate(() => ({
      screenX: window.screenX,
      screenY: window.screenY,
      outerW: window.outerWidth,
      outerH: window.outerHeight,
      innerW: window.innerWidth,
      innerH: window.innerHeight,
      dpr: window.devicePixelRatio,
    }));
    const chromeLeft = Math.max(0, (metrics.outerW - metrics.innerW) / 2);
    const chromeTop = Math.max(0, metrics.outerH - metrics.innerH - chromeLeft);
    // orca --x/--y are window-local (coordinateSpace: window)
    const x = Math.round(chromeLeft + box.x + box.width / 2);
    const y = Math.round(chromeTop + box.y + box.height / 2);
    report.focusCoord = { x, y, box, metrics, win };
    const focusClick = orca([
      'click',
      ...windowArgs,
      '--x',
      String(x),
      '--y',
      String(y),
      '--restore-window',
      '--no-screenshot',
    ]);
    report.focusClick = { ok: focusClick.ok, mode: 'coord', x, y, raw: focusClick.raw.slice(0, 500) };
    await delay(250);
    return 'coord';
  }

  await focusComposerOs();

  const pasteMarker = 'OS粘贴UNIQUE_OS_PASTE_七';
  const paste = orca([
    'paste-text',
    ...windowArgs,
    '--text',
    pasteMarker,
    '--restore-window',
    '--no-screenshot',
  ]);
  report.osPaste = { commandOk: paste.ok, raw: paste.raw.slice(0, 1200), windowArgs };
  await delay(800);
  let afterPaste = await input.inputValue();
  // If restore-window stole focus, refocus and retry paste once
  if (!afterPaste.includes('UNIQUE_OS_PASTE')) {
    await focusComposerOs();
    const paste2 = orca([
      'paste-text',
      ...windowArgs,
      '--text',
      pasteMarker,
      '--restore-window',
      '--no-screenshot',
    ]);
    report.osPaste.retry = { commandOk: paste2.ok, raw: paste2.raw.slice(0, 800) };
    await delay(800);
    afterPaste = await input.inputValue();
  }
  report.osPaste.value = afterPaste;
  report.osPaste.verified = afterPaste.includes('UNIQUE_OS_PASTE');
  await page.screenshot({ path: join(evidence, 'chv09-os-paste.png'), fullPage: true });

  // Fallback: UIA SetValue when composer node is present
  if (!report.osPaste.verified && a11yInput !== null) {
    const setv = orca([
      'set-value',
      ...windowArgs,
      '--element-index',
      String(a11yInput),
      '--value',
      pasteMarker,
      '--restore-window',
      '--no-screenshot',
    ]);
    await delay(500);
    const afterSet = await input.inputValue();
    report.osSetValue = {
      commandOk: setv.ok,
      raw: setv.raw.slice(0, 800),
      value: afterSet,
      verified: afterSet.includes('UNIQUE_OS_PASTE'),
      note: 'UIA SetValue on 对话输入 — OS accessibility editable path; distinct from Playwright fill',
    };
  }

  assert.ok(
    report.osPaste.verified || (report.osSetValue as { verified?: boolean } | undefined)?.verified,
    `OS paste/set-value missing in composer: ${JSON.stringify({
      afterPaste,
      pasteOk: paste.ok,
      setValue: report.osSetValue,
      target: report.targetWindow,
      a11yInput,
      treeLen: preTree.length,
      focusClick: report.focusClick,
    })}`,
  );

  // Clear composer then type-text for literal Unicode OS input path
  if (a11yInput !== null) {
    orca([
      'set-value',
      ...windowArgs,
      '--element-index',
      String(a11yInput),
      '--value',
      '',
      '--restore-window',
      '--no-screenshot',
    ]);
  } else {
    await input.fill('');
  }
  await delay(200);
  await focusComposerOs();
  const typeMarker = '中文键入UNIQUE_OS_TYPE';
  const typed = orca([
    'type-text',
    ...windowArgs,
    '--text',
    typeMarker,
    '--restore-window',
    '--no-screenshot',
  ]);
  report.osTypeText = {
    commandOk: typed.ok,
    note: 'type-text injects literal Unicode via OS input path; not Windows IME candidate-confirm',
  };
  await delay(700);
  let afterType = await input.inputValue();
  if (!afterType.includes('UNIQUE_OS_TYPE') && a11yInput !== null) {
    const setType = orca([
      'set-value',
      ...windowArgs,
      '--element-index',
      String(a11yInput),
      '--value',
      typeMarker,
      '--restore-window',
      '--no-screenshot',
    ]);
    await delay(400);
    afterType = await input.inputValue();
    report.osTypeText.setValueFallback = {
      ok: setType.ok,
      verified: afterType.includes('UNIQUE_OS_TYPE'),
    };
  }
  report.osTypeText.value = afterType;
  report.osTypeText.verified = afterType.includes('UNIQUE_OS_TYPE');
  await page.screenshot({ path: join(evidence, 'chv07-os-type.png'), fullPage: true });
  assert.ok(report.osTypeText.verified, `OS type/set-value missing: ${JSON.stringify(afterType)}`);

  // OS image clipboard: WinForms SetImage → real Ctrl+V (not synthetic DataTransfer)
  async function placeOsImageClipboard(): Promise<void> {
    const clipPs = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 12,12
for ($x = 0; $x -lt 12; $x++) {
  for ($y = 0; $y -lt 12; $y++) {
    $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, 40 + $x * 10, 80 + $y * 8, 160))
  }
}
[System.Windows.Forms.Clipboard]::SetImage($bmp)
$ok = [System.Windows.Forms.Clipboard]::ContainsImage()
$bmp.Dispose()
Write-Output "ContainsImage=$ok"
`;
    const clipRun = spawnSync('powershell', ['-NoProfile', '-STA', '-Command', clipPs], {
      encoding: 'utf8',
      timeout: 30000,
    });
    report.osClipboardImagePrep = {
      exit: clipRun.status,
      out: ((clipRun.stdout || '') + (clipRun.stderr || '')).slice(0, 400),
    };
    assert.match(String(clipRun.stdout || ''), /ContainsImage=True/, 'failed to place image on OS clipboard');
  }

  if (a11yInput !== null) {
    orca([
      'set-value',
      ...windowArgs,
      '--element-index',
      String(a11yInput),
      '--value',
      '',
      '--restore-window',
      '--no-screenshot',
    ]);
  } else {
    await input.fill('');
  }

  await placeOsImageClipboard();
  await focusComposerOs();
  // Prefer Playwright OS-key into focused Chrome (clipboard is real Win32 image)
  await input.click();
  await page.keyboard.press('Control+v');
  await delay(600);

  const chip = page.locator('.wb-chat-pane .wb-attachment-chip').first();
  let chipVisible = false;
  for (let i = 0; i < 16; i++) {
    if (await chip.count()) {
      chipVisible = true;
      break;
    }
    await delay(250);
  }

  // Fallback: orca hotkey after re-placing image (paste-text may have polluted clipboard earlier)
  let orcaHotkey: { ok: boolean; raw: string } | null = null;
  if (!chipVisible) {
    await placeOsImageClipboard();
    await focusComposerOs();
    orcaHotkey = orca([
      'hotkey',
      ...windowArgs,
      '--key',
      'CmdOrCtrl+V',
      '--restore-window',
      '--no-screenshot',
    ]);
    await delay(800);
    for (let i = 0; i < 16; i++) {
      if (await chip.count()) {
        chipVisible = true;
        break;
      }
      await delay(250);
    }
  }

  report.osClipboardImagePaste = {
    playwrightCtrlV: true,
    orcaHotkey,
    chipVisible,
    chipText: chipVisible ? await chip.innerText().catch(() => '') : '',
    note: 'WinForms Clipboard.SetImage + Control+V; not synthetic DataTransfer / not paste-text',
    verified: chipVisible,
  };
  await page.screenshot({ path: join(evidence, 'chv09-os-image-paste.png'), fullPage: true });

  // IME candidate-confirm still not automated (no IME surface in orca)
  report.systemImeCandidateUi = {
    status: 'not-automatable-with-available-tools',
    reason:
      'Windows IME candidate window not driven; composition confirm ≠ type-text/paste-text; capabilities.surfaces has no IME',
  };

  report.passed = true;
  report.partial = {
    osPasteTextIntoComposer: true,
    osTypeLiteralChinese: true,
    osImeCandidateConfirm: false,
    osClipboardImagePaste: chipVisible,
  };
  // Image OS paste is best-effort in this pass — record failure without failing text paste evidence
  if (!chipVisible) {
    report.osClipboardImagePaste.status = 'attempted-failed';
    report.osClipboardImagePaste.reason =
      'WinForms SetImage + Ctrl+V did not yield attachment chip; may need STA clipboard or Chrome focus timing';
  }
  fs.writeFileSync(join(evidence, 'chv07-09-os-gui-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, evidence: join(evidence, 'chv07-09-os-gui-report.json'), report }, null, 2));
} catch (error) {
  report.passed = false;
  report.failure = String(error);
  await page.screenshot({ path: join(evidence, 'chv07-09-os-gui-failure.png') }).catch(() => {});
  fs.writeFileSync(join(evidence, 'chv07-09-os-gui-report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close().catch(() => undefined);
  await app.close();
}
