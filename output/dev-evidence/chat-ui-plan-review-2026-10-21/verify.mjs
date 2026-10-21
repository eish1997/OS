import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const root = 'output/dev-evidence/chat-ui-plan-review-2026-10-21';
const planPath = 'doc/对话窗口交互重构开发执行计划.md';
const plan = readFileSync(planPath, 'utf8');
const before = readFileSync(`${root}/plan-v1.0-before.md`, 'utf8');
const backlog = readFileSync('doc/dev/backlog.md', 'utf8').split('## EMB ')[0];
const acceptance = readFileSync('doc/dev/acceptance.md', 'utf8').split('## 历史本地验收范围')[0];
const reviewPath = 'doc/reviews/对话窗口执行计划审查-2026-10-21.md';
const review = readFileSync(reviewPath, 'utf8');
const ids = (text, prefix) => [...text.matchAll(new RegExp('^\\| (' + prefix + '-\\d{2})[^|]*\\|', 'gm'))].map(match => match[1]);
const tasks = ids(plan, 'CHAT'), registered = ids(backlog, 'CHAT');
const scenarios = ids(plan, 'CHV'), tracked = ids(acceptance, 'CHV');
const graph = new Map();
for (const match of plan.matchAll(/^\| CHAT-(\d{2})[^|]*\|([^|]+)\|/gm)) {
  const dependency = match[2].split('；')[0];
  const expanded = dependency.replace(/(\d{2})–(\d{2})/g, (_, start, end) => Array.from({ length: Number(end) - Number(start) + 1 }, (_v, index) => String(Number(start) + index).padStart(2, '0')).join('、'));
  graph.set(match[1], [...expanded.matchAll(/\b\d{2}\b/g)].map(item => item[0]));
}
const visiting = new Set(), visited = new Set();
function acyclic(id) {
  if (visiting.has(id)) return false;
  if (visited.has(id)) return true;
  visiting.add(id);
  for (const dependency of graph.get(id) ?? []) if (!graph.has(dependency) || !acyclic(dependency)) return false;
  visiting.delete(id); visited.add(id); return true;
}
function offlineGateScope(text) {
  const row = text.match(/^\| CHAT-14[^\n]+/m)?.[0] ?? '';
  return row.includes('只关闭CHV-01–22') && !row.includes('第8节全部必需场景');
}
const missingLinks = [];
for (const [path, text] of [[planPath, plan], [reviewPath, review]]) {
  for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (target && !/^[a-z]+:\/\//i.test(target) && !existsSync(resolve(dirname(path), target))) missingLinks.push({ path, target });
  }
}
const checks = {
  version11: plan.includes('版本：1.1'),
  tasks17: tasks.length === 17 && new Set(tasks).size === 17,
  taskLedgerMatches: JSON.stringify(tasks) === JSON.stringify(registered),
  scenarios24: scenarios.length === 24 && new Set(scenarios).size === 24,
  acceptanceMatches: JSON.stringify(scenarios) === JSON.stringify(tracked),
  allTodo: [...backlog.matchAll(/^\| CHAT-\d{2} \| ([^|]+)\|/gm)].every(match => match[1].trim() === 'todo'),
  allScenariosPending: [...acceptance.matchAll(/^\| CHV-\d{2}.*$/gm)].every(match => match[0].includes('待实施')),
  declaredDependencyGraphValid: graph.size === 17 && [...graph.keys()].every(acyclic),
  offlineGateExcludesModelAndDeployment: offlineGateScope(plan),
  originalImplicitGateRejected: !offlineGateScope(before),
  separateCompletionStates: ['部分验证候选', '完整候选完成', '整体本机交付完成', '用户体验认可'].every(text => plan.includes(text)),
  reviewItems13: [...review.matchAll(/^\| R\d{2} \|/gm)].length === 13,
  measurableContract: plan.includes('### 3.1 CHAT-02') && plan.includes('相对视口偏移'),
  versionToolAndAttachmentContract: plan.includes('assistant(toolCall)→toolResult→assistant(final)') && plan.includes('默认继承该次输入的图片和资料'),
  preImportIsolation: plan.includes('首次导入 `server/config.ts` 前隔离') && plan.includes('默认拒绝非回环外连'),
  linksExist: missingLinks.length === 0,
};
const report = { at: new Date().toISOString(), node: process.version, kind: 'documentation-only', reviewers: ['review_ux_scope', 'review_loop_dependencies', 'review_validation_safety'], scopedFollowupReview: { review_ux_scope: 'R03-R08 verified', review_loop_dependencies: 'R01/R02/R09/R10 verified', review_validation_safety: 'R01/R11/R12/R13 verified' }, consolidatedItems: 13, productImplementationStarted: false, realModelCalls: 0, checks, missingLinks };
mkdirSync(root, { recursive: true });
writeFileSync(`${root}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (Object.values(checks).some(value => !value)) process.exitCode = 1;
