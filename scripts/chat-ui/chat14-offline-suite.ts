/**
 * CHAT-14: serial offline suite for CHV-01–22 (no real model / no daily service).
 * Records each package script exit; system OS IME/clipboard stay deferred.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { resolve, join } from 'node:path';

const evidence = resolve(process.env.CHAT_UI_EVIDENCE || 'output/dev-evidence/chat-ui/loop-001');
const staticDir = process.env.CHAT_UI_STATIC || 'output/chat-ui-build';
fs.mkdirSync(evidence, { recursive: true });

const steps = [
  { id: 'build', npm: 'build:chat-ui', chv: ['CHV-01'] },
  { id: 'isolation', npm: 'test:chat-ui-isolation', chv: ['CHV-01'] },
  { id: 'visible-runs', npm: 'test:chat-visible-runs', chv: ['CHV-04'] },
  { id: 'version-ops', npm: 'test:chat-version-ops', chv: ['CHV-15'] },
  { id: 'chv04', npm: 'test:chat-ui-chv04', chv: ['CHV-04'] },
  { id: 'chv05', npm: 'test:chat-ui-chv05', chv: ['CHV-05'] },
  { id: 'chv01', npm: 'test:chat-ui-chv01', chv: ['CHV-01'] },
  { id: 'chat02', npm: 'test:chat-ui-chat02', chv: ['CHV-02', 'CHV-20'] },
  { id: 'chat04', npm: 'test:chat-ui-chat04', chv: ['CHV-18'] },
  { id: 'chat18', npm: 'test:chat-ui-chat18', chv: ['CHV-18'] },
  { id: 'chat20', npm: 'test:chat-ui-chat20', chv: ['CHV-20'] },
  { id: 'chat05', npm: 'test:chat-ui-chat05', chv: ['CHV-07'] },
  { id: 'chat06', npm: 'test:chat-ui-chat06', chv: ['CHV-09'] },
  { id: 'chv06', npm: 'test:chat-ui-chv06', chv: ['CHV-06'] },
  { id: 'chat07', npm: 'test:chat-ui-chat07', chv: ['CHV-13'] },
  { id: 'chv13-select', npm: 'test:chat-ui-chv13-select', chv: ['CHV-13'] },
  { id: 'chat08', npm: 'test:chat-ui-chat08', chv: ['CHV-12'] },
  { id: 'chv12', npm: 'test:chat-ui-chv12', chv: ['CHV-12'] },
  { id: 'chv08', npm: 'test:chat-ui-chv08', chv: ['CHV-08'] },
  { id: 'chat09', npm: 'test:chat-ui-chat09', chv: ['CHV-11'] },
  { id: 'chv10', npm: 'test:chat-ui-chv10', chv: ['CHV-10'] },
  { id: 'chv10-upload', npm: 'test:chat-ui-chv10-upload', chv: ['CHV-10'] },
  { id: 'chat10', npm: 'test:chat-ui-chat10', chv: ['CHV-14'] },
  { id: 'chv14-deep', npm: 'test:chat-ui-chv14-deep', chv: ['CHV-14'] },
  { id: 'chat11', npm: 'test:chat-ui-chat11', chv: ['CHV-15', 'CHV-16'] },
  { id: 'chat12', npm: 'test:chat-ui-chat12', chv: ['CHV-15'] },
  { id: 'chv03', npm: 'test:chat-ui-chv03', chv: ['CHV-03'] },
  { id: 'chv15', npm: 'test:chat-ui-chv15', chv: ['CHV-15'] },
  { id: 'chv16', npm: 'test:chat-ui-chv16', chv: ['CHV-16'] },
  { id: 'chv19', npm: 'test:chat-ui-chv19', chv: ['CHV-19'] },
  { id: 'chat13', npm: 'test:chat-ui-chat13', chv: ['CHV-17', 'CHV-18', 'CHV-20'] },
  { id: 'chat21', npm: 'test:chat-ui-chat21', chv: ['CHV-21'] },
  { id: 'chat22', npm: 'test:chat-ui-chat22', chv: ['CHV-22'] },
];

const env = {
  ...process.env,
  WORKBENCH_SKIP_DOTENV: '1',
  CHAT_UI_STATIC: staticDir,
  CHAT_UI_EVIDENCE: evidence,
};

const results: { id: string; npm: string; chv: string[]; exitCode: number; ms: number }[] = [];
let failed = false;

for (const step of steps) {
  const started = Date.now();
  const run = spawnSync('npm', ['run', step.npm], {
    cwd: resolve('.'),
    env,
    encoding: 'utf8',
    shell: true,
  });
  const exitCode = run.status ?? 1;
  results.push({ id: step.id, npm: step.npm, chv: step.chv, exitCode, ms: Date.now() - started });
  if (exitCode !== 0) {
    failed = true;
    break;
  }
}

const appJs = fs
  .readdirSync(join(staticDir, 'assets'))
  .find((name) => name.startsWith('app-') && name.endsWith('.js'));

const report = {
  at: new Date().toISOString(),
  staticDir,
  candidateApp: appJs || null,
  realModelRequests: 0,
  dailyServiceRestarted: false,
  gitCommit: false,
  deferred: {
    systemIme: 'CHV-07/OS IME: see ime-clipboard-capability.json; orca computer a11y/screenshots unsupported',
    systemClipboard: 'CHV-09/13 OS clipboard: Playwright in-page API only; OS paste needs granted computer-use GUI',
    realSubscription: 'CHV-11 real OAuth/subscription success path needs separate auth',
  },
  results,
  passed: !failed,
  partialCandidate: true,
  note: 'CHAT-14 remains a partial verification candidate per plan §完成标准: system IME/clipboard and real subscription stay pending; cannot close CHAT-14 without those.',
};

fs.writeFileSync(join(evidence, 'chat14-suite-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: !failed, evidence: join(evidence, 'chat14-suite-report.json'), report }, null, 2));
if (failed) process.exit(1);
