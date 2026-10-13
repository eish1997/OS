import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

writeFileSync('output/dev-evidence/plan-update-053-audit.json', JSON.stringify({ at: new Date().toISOString(), status: 'pending' }) + '\n');
const read = p => readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
const hash = p => createHash('sha256').update(readFileSync(p)).digest('hex');
const documents = ['doc/主开发文档.md', 'doc/开发执行文档.md', 'doc/README.md', 'doc/dev/current.md', 'doc/dev/本地电脑版执行范围.md', 'doc/dev/iterations/053-local-delivery-plan.md'];
const main = read(documents[0]), execution = read(documents[1]);
assert(main.includes('版本：0.10'));
assert(execution.includes('版本：0.10'));
assert(main.includes('### 当前交付清单'));
assert(execution.includes('### 6.0 本次交付与选择规则'));
assert(main.includes('不提前建设云服务、同步引擎或分布式调度'));
assert(execution.includes('本地阶段完成不会自动触发云部署'));
assert(execution.includes('M1 仍依赖本地 M0 通过'));
assert(read(documents[3]).includes('M0仍待验收，M1未启动'));
assert(read(documents[4]).includes('0.10'));

const reportPath = 'output/dev-evidence/verification/report.json';
const report = JSON.parse(read(reportPath));
assert.equal(report.status, 'passed');
for (const [p, h] of Object.entries(report.baseline)) assert.equal(hash(p), h, p);

const walk = p => readdirSync(p, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(p, e.name)) : e.name.endsWith('.md') ? [join(p, e.name)] : []);
const files = walk(resolve('doc'));
let links = 0;
const failures = [];
for (const file of files) for (const match of read(file).matchAll(/!?\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
  let target = match[1].trim();
  if (target.startsWith('<')) target = target.slice(1, target.indexOf('>'));
  else target = target.replace(/\s+["'][\s\S]*$/, '');
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue;
  target = decodeURIComponent(target.split('#')[0].split('?')[0]);
  if (!target) continue;
  links++;
  if (!existsSync(resolve(dirname(file), target))) failures.push({ file, target });
}
assert.deepEqual(failures, [], 'Broken local documentation links');
const result = {
  at: new Date().toISOString(), status: 'passed', scope: 'Documentation only; local desktop delivery and execution priorities',
  planVersion: '0.10', changedDocuments: Object.fromEntries(documents.map(p => [p, hash(p)])),
  documentsScanned: files.length, localDocumentLinks: links, engineeringFiles: Object.keys(report.baseline).length,
  engineeringBaselineUnchanged: true, verificationSha256: hash(reportPath), freshEngineeringTestsRun: false,
  sourceEditedByThisUpdate: false, serviceRestartedByThisUpdate: false, modelRequestsByThisUpdate: 0,
  m0Accepted: false, m1Started: false, remoteStage: 'Deferred by user'
};
writeFileSync('output/dev-evidence/plan-update-053-audit.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ status: result.status, documents: files.length, links, engineeringFiles: result.engineeringFiles }));
