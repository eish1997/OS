import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const planPath = 'doc/对话窗口交互重构开发执行计划.md';
const plan = readFileSync(planPath, 'utf8');
const backlog = readFileSync('doc/dev/backlog.md', 'utf8').split('## EMB ')[0];
const acceptance = readFileSync('doc/dev/acceptance.md', 'utf8').split('## 历史本地验收范围')[0];
const ids = (text, prefix) => [...text.matchAll(new RegExp('^\\| (' + prefix + '-\\d{2})[^|]*\\|', 'gm'))].map(match => match[1]);
const tasks = ids(plan, 'CHAT'), registered = ids(backlog, 'CHAT');
const scenarios = ids(plan, 'CHV'), tracked = ids(acceptance, 'CHV');
const missingLinks = [];
for (const match of plan.matchAll(/\]\(([^)]+)\)/g)) {
  const target = match[1].split('#')[0];
  if (target && !/^[a-z]+:\/\//i.test(target) && !existsSync(resolve(dirname(planPath), target))) missingLinks.push(target);
}
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
const checks = {
  tasks17: tasks.length === 17 && new Set(tasks).size === 17,
  taskLedgerMatches: JSON.stringify(tasks) === JSON.stringify(registered),
  scenarios24: scenarios.length === 24 && new Set(scenarios).size === 24,
  acceptanceMatches: JSON.stringify(scenarios) === JSON.stringify(tracked),
  allTodo: registered.length === 17 && [...backlog.matchAll(/^\| CHAT-\d{2} \| ([^|]+)\|/gm)].every(match => match[1].trim() === 'todo'),
  allScenariosPending: [...acceptance.matchAll(/^\| CHV-\d{2}.*$/gm)].every(match => match[0].includes('待实施')),
  dependencyGraphValid: graph.size === 17 && [...graph.keys()].every(acyclic),
  planLinksExist: missingLinks.length === 0,
  singleAgent: plan.includes('默认单 Agent'),
  historicalEvidenceProtected: plan.includes('直接重跑会覆盖历史证据'),
  isolatedBuild: plan.includes('output/chat-ui-build'),
};
const report = { at: new Date().toISOString(), node: process.version, kind: 'documentation-only', productImplementationStarted: false, realModelCalls: 0, checks, missingLinks };
mkdirSync('output/dev-evidence/chat-ui-plan-2026-10-21', { recursive: true });
writeFileSync('output/dev-evidence/chat-ui-plan-2026-10-21/report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (Object.values(checks).some(value => !value)) process.exitCode = 1;
