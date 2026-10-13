import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

// No credentials, data files, or model requests enter this verification report.
const root = process.cwd();
const files = [];
function walk(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) walk(full); else files.push(full);
  }
}
for (const folder of ['server', 'shared', 'src', 'scripts', 'tests', 'deployment']) walk(join(root, folder));
for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'index.html']) files.push(join(root, name));
const baseline = Object.fromEntries(files.sort().map(path => [relative(root, path).replaceAll('\\', '/'), createHash('sha256').update(readFileSync(path)).digest('hex')]));
const checks = [
  ['integration-tests', ['--import', 'tsx', '--test', ...files.filter(p => p.endsWith('.test.ts'))]],
  ['typecheck', ['node_modules/typescript/bin/tsc', '--noEmit']],
  ['production-build', ['node_modules/vite/bin/vite.js', 'build']],
  ['pi-offline-probe', ['--import', 'tsx', 'scripts/probe-pi.ts']]
];
const target = join(root, 'output/dev-evidence/verification'); mkdirSync(target, { recursive: true });
if (existsSync(join(target, 'report.json'))) {
  const previous = JSON.parse(readFileSync(join(target, 'report.json'), 'utf8'));
  const history = join(target, 'history', String(previous.at).replaceAll(/[^\w-]/g, '-')); mkdirSync(history, { recursive: true });
  for (const name of ['report.json', ...checks.map(([name]) => `${name}.log`)]) {
    if (existsSync(join(target, name)) && !existsSync(join(history, name))) copyFileSync(join(target, name), join(history, name));
  }
}
const report = { at: new Date().toISOString(), runtime: process.version, platform: process.platform, baseline, status: 'running', checks: [], limitations: ['This engineering verification makes no model request', 'No Tencent Memory runtime in these checks', 'Remote phone and independent-disk backup require separate evidence'] };
const save = () => writeFileSync(join(target, 'report.json'), JSON.stringify(report, null, 2)); save();
for (const [name, args] of checks) {
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 120_000, windowsHide: true });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  writeFileSync(join(target, `${name}.log`), output);
  report.checks.push({ name, exitCode: result.status, error: result.error?.message, outputSha256: createHash('sha256').update(output).digest('hex') });
  console.log(`${name}: ${result.status === 0 ? 'passed' : 'failed'}`); save();
  if (result.status !== 0) { report.status = 'failed'; save(); process.exit(1); }
}
report.status = 'passed'; save();
