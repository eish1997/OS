/**
 * Probe automation capability for system IME / OS clipboard before CHV-07/09 OS claims.
 * Does not mark those CHVs passed; records concrete external limits when untestable.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const evidence = resolve(process.env.CHAT_UI_EVIDENCE || 'output/dev-evidence/chat-ui/loop-001');
fs.mkdirSync(evidence, { recursive: true });

const report: Record<string, unknown> = {
  at: new Date().toISOString(),
  purpose: 'Confirm tool capability before OS IME/clipboard acceptance',
};

const orcaCaps = spawnSync('orca computer capabilities --json', {
  encoding: 'utf8',
  shell: true,
});
report.orcaComputerCapabilitiesExit = orcaCaps.status;
try {
  report.orcaComputerCapabilities = JSON.parse(orcaCaps.stdout || '{}');
} catch {
  report.orcaComputerCapabilitiesRaw = (orcaCaps.stdout || orcaCaps.stderr || '').slice(0, 2000);
}

const orcaPerms = spawnSync('orca computer permissions --json', {
  encoding: 'utf8',
  shell: true,
});
report.orcaComputerPermissionsExit = orcaPerms.status;
try {
  report.orcaComputerPermissions = JSON.parse(orcaPerms.stdout || '{}');
} catch {
  report.orcaComputerPermissionsRaw = (orcaPerms.stdout || orcaPerms.stderr || '').slice(0, 2000);
}

const perms = (report.orcaComputerPermissions as { result?: { permissions?: { id: string; status: string }[] } })
  ?.result?.permissions;
const accessibility = perms?.find((p) => p.id === 'accessibility')?.status;
const screenshots = perms?.find((p) => p.id === 'screenshots')?.status;
const caps = (
  report.orcaComputerCapabilities as {
    result?: { supports?: { actions?: Record<string, boolean>; surfaces?: Record<string, boolean> } };
  }
)?.result?.supports;
// permissions API may say unsupported while get-app-state/paste-text still work — do not treat API alone as hard block
report.permissionsApiNote = {
  accessibility,
  screenshots,
  note: 'API status unsupported ≠ runtime unusable; see empiricalOsGui / chv07-09-os-gui-report.json',
};
report.orcaActionSupport = caps?.actions || null;
report.orcaSurfaceSupport = caps?.surfaces || null;
report.systemImeCandidateViaOrcaComputer = {
  status: 'not-automatable',
  reason:
    'No IME candidate surface in orca computer capabilities; type-text/paste-text/set-value ≠ Windows IME composition+candidate confirm',
  actions: caps?.actions || null,
  surfaces: caps?.surfaces || null,
};

const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ headless: true, executablePath: chrome });
const origin = 'http://127.0.0.1';
const context = await browser.newContext();
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
const page = await context.newPage();
// Clipboard API requires a secure/trusted origin; blank setContent has no clipboard.
await page.route('**/clip-probe', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<textarea id="t"></textarea>',
  });
});
try {
  await page.goto(`${origin}/clip-probe`);
  const clip = await page.evaluate(async () => {
    const area = document.getElementById('t') as HTMLTextAreaElement | null;
    if (!area) return { error: 'textarea-missing' };
    area.focus();
    area.value = 'CLIP_PROBE_UNIQUE';
    area.select();
    const clipApi = navigator.clipboard;
    const hasClipboard = Boolean(clipApi && typeof clipApi.writeText === 'function');
    let wrote: true | string = 'clipboard-api-absent';
    let read: string = 'clipboard-api-absent';
    if (hasClipboard && clipApi) {
      wrote = await clipApi.writeText(area.value).then(() => true as const).catch((e: unknown) => String(e));
      read = await clipApi.readText().then((v) => v).catch((e: unknown) => String(e));
    }
    area.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    area.dispatchEvent(new CompositionEvent('compositionupdate', { data: '测', bubbles: true }));
    area.dispatchEvent(new CompositionEvent('compositionend', { data: '测试', bubbles: true }));
    return { hasClipboard, wrote, read, compositionEventsDispatchable: true };
  });
  report.playwrightClipboardApi = {
    grantPermissions: 'clipboard-read/write on http://127.0.0.1',
    result: clip,
    note: 'In-page Clipboard API only; does not prove OS clipboard paste from outside Chrome',
  };
  report.playwrightCompositionEvents = {
    status: 'available',
    note: 'Synthetic CompositionEvent already covered by chat13 imeCompositionGuard; not equivalent to system IME',
  };
} catch (error) {
  report.playwrightClipboardApi = { error: String(error) };
  report.playwrightCompositionEvents = {
    status: 'probe-failed',
    note: 'See playwrightClipboardApi.error; chat13 still has synthetic composition guard',
  };
}

const empiricalPath = join(evidence, 'chv07-09-os-gui-report.json');
let empirical: Record<string, unknown> | null = null;
if (fs.existsSync(empiricalPath)) {
  try {
    empirical = JSON.parse(fs.readFileSync(empiricalPath, 'utf8')) as Record<string, unknown>;
  } catch {
    empirical = null;
  }
}
const partial = (empirical?.partial as Record<string, boolean> | undefined) || {};
const empiricalOsGui = empirical
  ? {
      present: true as const,
      passed: empirical.passed === true,
      osPasteVerified: (empirical.osPaste as { verified?: boolean } | undefined)?.verified === true,
      osTypeVerified: (empirical.osTypeText as { verified?: boolean } | undefined)?.verified === true,
      osImageVerified:
        (empirical.osClipboardImagePaste as { verified?: boolean } | undefined)?.verified === true ||
        partial.osClipboardImagePaste === true,
      partial: empirical.partial,
    }
  : {
      present: false as const,
      osPasteVerified: false,
      osTypeVerified: false,
      osImageVerified: false,
    };
report.empiricalOsGui = empiricalOsGui;

report.verdict = {
  systemOsClipboardTextPaste: empiricalOsGui.osPasteVerified ? 'passed-os-path' : 'pending-os-gui-qa',
  systemOsClipboardImagePaste: empiricalOsGui.osImageVerified ? 'passed-os-path' : 'pending-or-failed',
  systemOsImeCandidateConfirm: 'external-tool-limit',
  doNotMarkChat14Done: true,
  reason: 'plan §10: missing Windows IME candidate path → partial candidate only',
};

await browser.close();
fs.writeFileSync(join(evidence, 'ime-clipboard-capability.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: true, evidence: join(evidence, 'ime-clipboard-capability.json'), verdict: report.verdict }, null, 2));
