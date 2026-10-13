import { researchMarkdown } from './research.js';
import { createHash } from 'node:crypto';
import type { Project, ProjectSummary, ConversationMessage, ConversationPage, Task, Run, Policy, Memory, Draft, InboxItem, Asset, Operation, WorkbenchEvent, ModelUsage } from '../shared/contracts.js';
import { canTransition } from '../shared/contracts.js';
import { Store, AppError } from './store.js';
import { Assets } from './assets.js';
import { continuationFor,pendingContinuation } from './native-session.js';
export const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const text = (v: unknown, name: string, max = 30_000): string => { if (typeof v !== 'string' || !v.trim() || v.length > max) throw new AppError(400, `${name}不能为空或过长`); return v.trim(); };
export class Service {
  constructor(public store: Store, public assets: Assets) {}
  project(id: string) { return this.store.get<Project>('project', id); }
  createProject(name: string, description = '') { return this.store.transaction(() => { const p = this.store.create<Project>('project', { name: text(name, '名称', 100), description, archived: false }); this.store.event('project.created', p, { projectId: p.id, revision: p.revision }); return p; }); }
  scope<T extends { projectId?: string }>(value: T, projectId: string) { if (value.projectId !== projectId) throw new AppError(403, '操作超出当前项目范围'); return value; }
  summary(projectId: string) { this.project(projectId); return this.store.list<ProjectSummary>('summary', projectId)[0]; }
  saveSummary(projectId: string, expectedRevision: number, fields: Pick<ProjectSummary, 'goal' | 'progress' | 'decisions' | 'nextStep' | 'sourceIds'>, confirmed: boolean, sourceRunId?: string) {
    this.project(projectId);
    const checked = Object.fromEntries(['goal', 'progress', 'decisions', 'nextStep'].map(key => {
      const value = fields[key as 'goal']; if (typeof value !== 'string' || value.length > 3000) throw new AppError(400, '摘要字段须为不超过3000字的文本'); return [key, value.trim()];
    })) as Pick<ProjectSummary, 'goal' | 'progress' | 'decisions' | 'nextStep'>;
    return this.store.transaction(() => {
      for (const id of fields.sourceIds) { const a = this.scope(this.store.get<Asset>('asset', id), projectId); if (a.status !== 'ready') throw new AppError(410, '摘要来源已删除'); }
      const current = this.summary(projectId); if ((current?.revision ?? 0) !== expectedRevision) throw new AppError(409, '项目摘要已被修改，请保留本机修改并合并');
      const values = { ...checked, sourceIds: [...new Set(fields.sourceIds)], confirmed, sourceRunId: sourceRunId ?? current?.sourceRunId };
      const next = current ? this.store.update<ProjectSummary>('summary', current.id, expectedRevision, values) : this.store.create<ProjectSummary>('summary', { projectId, ...values });
      this.store.event('summary.updated', { id: next.id, confirmed }, { projectId, revision: next.revision }); return next;
    });
  }
  conversation(projectId: string, before?: number, limit = 50): ConversationPage {
    this.project(projectId);
    const rows = this.store.db.prepare("SELECT sequence,body FROM events WHERE json_extract(body,'$.projectId')=? AND sequence<? AND json_extract(body,'$.type') IN ('task.accepted','assistant.text') ORDER BY sequence DESC LIMIT ?").all(projectId, before ?? Number.MAX_SAFE_INTEGER, limit + 1);
    const more = rows.length > limit; const messages: ConversationMessage[] = rows.slice(0, limit).reverse().map(row => {
      const e = JSON.parse(String(row.body)) as WorkbenchEvent; const data = e.data as { text?: string; task?: Task };
      return { id: e.eventId, sequence: Number(row.sequence), role: e.type === 'task.accepted' ? 'user' : 'assistant', text: e.type === 'task.accepted' ? data.task?.goal ?? '' : data.text ?? '', at: e.at, runId: e.runId };
    });
    return { messages, olderThan: more ? messages[0]?.sequence : undefined };
  }
  submit(projectId: string, goal: string, commandId: string, mode: Run['mode'], policy: Policy, assetIds: string[] = [], nodeId?: string, context: { research?: Task['context']['research']; view: string; selectedAssetId?: string; selectedDraftId?: string; selectedDraftRevision?: number } = { view: 'project' },continueFromRunId?:string|null) {
    this.project(projectId); text(goal, '目标'); text(commandId, '命令 ID', 120);
    if (policy.projectId !== projectId) throw new AppError(403, '策略项目不匹配');
    if (!['project', 'summary', 'results', 'tasks', 'drafts', 'research'].includes(context.view)) throw new AppError(400, '当前视图无效');
    if (context.selectedAssetId && !assetIds.includes(context.selectedAssetId)) throw new AppError(400, '选中对象必须包含在固定输入中');
    if ((context.selectedDraftId !== undefined || context.selectedDraftRevision !== undefined) && (context.view !== 'drafts' || !context.selectedDraftId || !Number.isSafeInteger(context.selectedDraftRevision) || Number(context.selectedDraftRevision) < 1)) throw new AppError(400, '当前草稿与版本无效');
    for (const id of assetIds) { const asset = this.scope(this.store.get<Asset>('asset', id), projectId); if (asset.status !== 'ready') throw new AppError(410, '输入资产已删除'); }
    return this.store.command(`task:${commandId}`, fingerprint({ projectId, goal, mode, assetIds, nodeId, policy, context,continueFromRunId }), () => {
      const selectedDraft = context.selectedDraftId ? this.scope(this.store.get<Draft>('draft', context.selectedDraftId), projectId) : undefined;
      if (selectedDraft && selectedDraft.revision !== context.selectedDraftRevision) throw new AppError(409, '当前草稿已有新版本，请保留修改并重新查看后发送');
      const continueAfterRunId=mode==='pi'?pendingContinuation(this.store,projectId,policy,continueFromRunId):undefined;
      const continuation=mode==='pi'&&!continueAfterRunId?continuationFor(this.store,projectId,policy,continueFromRunId):undefined;
      const summary = this.summary(projectId);
      const task = this.store.create<Task>('task', { projectId, goal, commandId, context: { research: context.research, projectId, assetIds: [...assetIds], view: context.view, selectedAssetId: context.selectedAssetId, selectedDraftId: selectedDraft?.id, selectedDraftRevision: selectedDraft?.revision, selectedDraft, summary: summary?.confirmed ? summary : undefined }, acceptance: 'pending' });
      const run = this.store.create<Run>('run', { projectId, taskId: task.id, mode, status: 'queued', attempt: 1, continuation,continueAfterRunId,cancelRequested: false, resultAssetIds: [], policy, calls: 0, reservedUsd: 0, spentUsd: 0, nodeId });
      this.store.event('task.accepted', { task, run }, { projectId, runId: run.id, revision: run.revision }); return { task, run };
    });
  }
  transition(id: string, status: Run['status'], fields: Partial<Run> = {}) {
    return this.store.transaction(() => { const run = this.store.get<Run>('run', id); if (!canTransition(run.status, status)) throw new AppError(409, `不能从 ${run.status} 转为 ${status}`); const next = this.store.update<Run>('run', id, run.revision, { ...fields, status }); this.store.event('run.status', { status, error: fields.error }, { projectId: run.projectId, runId: id, revision: next.revision }); return next; });
  }
  cancel(id: string) {
    const run = this.store.get<Run>('run', id);
    if (['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status) || (run.status === 'running' && run.cancelRequested)) return run;
    return this.store.transaction(() => {
      const current = this.store.get<Run>('run', id);
      if (['completed', 'failed', 'cancelled', 'interrupted'].includes(current.status) || (current.status === 'running' && current.cancelRequested)) return current;
      if (current.status !== 'running') return this.transition(id, 'cancelled', { cancelRequested: true, endedAt: new Date().toISOString() });
      const next = this.store.update<Run>('run', id, current.revision, { cancelRequested: true,cancelRequestedAt:new Date().toISOString() });
      this.store.event('run.cancel_requested', {}, { projectId: current.projectId, runId: current.id }); return next;
    });
  }
  async requestCancel(id: string) {
    const run = this.store.get<Run>('run', id);
    if (['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status) || (run.status === 'running' && run.cancelRequested)) return run;
    return this.store.capacity ? this.store.capacity.exclusiveAsync(() => this.cancel(id), 1000) : this.cancel(id);
  }
  retry(id: string, commandId: string) {
    const run = this.store.get<Run>('run', id); if (!['failed', 'cancelled', 'interrupted'].includes(run.status)) throw new AppError(409, '此任务不需要重试');
    if (run.status === 'interrupted' && !run.error?.includes('已对账')) throw new AppError(409, '请先完成中断对账，避免重复执行');
    if (this.store.list<Operation>('operation').some(o => o.runId === id && ['started', 'unknown'].includes(o.state))) throw new AppError(409, '存在结果未确认的操作，请先对账');
    return this.store.command(`retry:${commandId}`, fingerprint({ id }), () => {
      const continuation=run.mode==='pi'&&run.sessionPath&&run.sessionId?continuationFor(this.store,run.projectId,run.policy,run.id):undefined;
      const next = this.store.create<Run>('run', { projectId: run.projectId, taskId: run.taskId, mode: run.mode, status: 'queued', attempt: run.attempt + 1, parentRunId: id, continuation,cancelRequested: false, resultAssetIds: [], policy: run.policy, calls: 0, reservedUsd: 0, spentUsd: 0, nodeId: run.nodeId }); this.store.event('run.retry', next, { projectId: next.projectId, runId: next.id }); return next;
    });
  }
  memories(projectId: string) { return this.store.list<Memory>('memory').filter(m => !m.deleted && m.active && m.confirmed && m.kind !== 'temporary' && (m.projectId === undefined || m.projectId === projectId)); }
  confirmMemory(id: string, revision: number) {
    return this.store.transaction(() => {
      const current = this.store.get<Memory>('memory', id); if (current.deleted) throw new AppError(410, '记忆已删除，不能确认');
      const next = this.store.update<Memory>('memory', id, revision, { confirmed: true }); this.store.event('memory.confirmed', { id }, { projectId: next.projectId, revision: next.revision }); return next;
    });
  }
  memory(fields: Pick<Memory, 'text' | 'source' | 'kind' | 'confirmed'> & { projectId?: string; sourceIds?: string[]; sourceRunId?: string }) {
    if (fields.projectId) this.project(fields.projectId);
    return this.store.transaction(() => {
      for (const id of fields.sourceIds ?? []) { if (!fields.projectId) throw new AppError(403, '资料记忆需要明确项目范围'); const a = this.scope(this.store.get<Asset>('asset', id), fields.projectId); if (a.status !== 'ready') throw new AppError(410, '记忆来源已删除'); }
      const m = this.store.create<Memory>('memory', { ...fields, text: text(fields.text, '记忆'), source: text(fields.source, '来源'), active: true, deleted: false }); this.store.event('memory.created', { id: m.id }, { projectId: m.projectId }); return m;
    });
  }
  reviseMemory(id: string, revision: number, newText?: string, active?: boolean, deleted?: boolean) {
    return this.store.transaction(() => {
      const current = this.store.get<Memory>('memory', id); if (current.revision !== revision) throw new AppError(409, '记忆已更新');
      if (newText) {
        this.store.update<Memory>('memory', id, revision, { active: false });
        const next = this.store.create<Memory>('memory', { projectId: current.projectId, text: text(newText, '记忆'), source: current.source, sourceIds: current.sourceIds, sourceRunId: current.sourceRunId, kind: current.kind, confirmed: current.confirmed, active: true, deleted: false, supersedes: id }); this.store.event('memory.revised', { id: next.id, supersedes: id }, { projectId: next.projectId }); return next;
      }
      const next = this.store.update<Memory>('memory', id, revision, { active: deleted ? false : active ?? current.active, deleted: deleted ?? current.deleted }); this.store.event('memory.changed', { id }, { projectId: next.projectId }); return next;
    });
  }
  draft(projectId: string, title: string, body: string, sourceIds: string[]) {
    this.project(projectId); for (const id of sourceIds) { const asset = this.scope(this.store.get<Asset>('asset', id), projectId); if (asset.status !== 'ready') throw new AppError(410, '素材资产已删除'); }
    return this.store.transaction(() => { const d = this.store.create<Draft>('draft', { projectId, title: text(title, '标题', 150), body, sourceIds }); this.store.event('draft.created', { id: d.id }, { projectId, revision: d.revision }); return d; });
  }
  updateDraft(id: string, revision: number, title: string, body: string) { return this.store.transaction(() => { const d = this.store.update<Draft>('draft', id, revision, { title: text(title, '标题', 150), body }); this.store.event('draft.updated', { id }, { projectId: d.projectId, revision: d.revision }); return d; }); }
  inbox(value: string) { return this.store.transaction(() => { const item = this.store.create<InboxItem>('inbox', { text: text(value, '想法'), status: 'new' }); this.store.event('inbox.created', { id: item.id }); return item; }); }
  reserveCall(id: string, maxCalls: number | undefined, budgetUsd: number) {
    return this.store.transaction(() => {
      const run = this.store.get<Run>('run', id); const all = this.store.list<Run>('run');
      if (run.cancelRequested || run.timedOutAt || (run.startedAt&&Date.now()-Date.parse(run.startedAt)>=run.policy.timeoutMs) || run.status !== 'running' || !run.policy.allowModel) throw new AppError(403, '模型调用未获许可或已到期');
      const reserve = run.policy.reservePerCallUsd;
      const subscription = run.policy.modelBinding?.kind === 'chatgpt';
      const matching = all.filter(r => subscription ? r.policy.modelBinding?.kind === 'chatgpt' && r.policy.modelBinding.connectionId === run.policy.modelBinding!.connectionId : r.policy.modelBinding?.kind !== 'chatgpt');
      const attempts = all.filter(r => r.taskId === run.taskId);
      // A retry is another attempt at the same grant, not a fresh allowance.
      if (attempts.reduce((n, r) => n + r.calls, 0) >= run.policy.maxCalls) throw new AppError(429, '同一任务累计模型调用次数已达上限，重试不会重置额度');
      if (run.calls >= run.policy.maxCalls || (maxCalls !== undefined && matching.reduce((n, r) => n + r.calls, 0) >= maxCalls)) throw new AppError(429, '模型调用次数已达上限');
      if (subscription) {
        if (!run.policy.modelBinding?.connectionId) throw new AppError(403, '缺订阅连接绑定');
        const settled=run.modelCallsSettled ?? (run.usage?.complete?run.calls:0);const reported=run.modelCallsReported ?? (run.usage?.complete?run.calls:0);
        return this.store.update<Run>('run', id, run.revision, { calls: run.calls + 1,modelCallsSettled:settled,modelCallsReported:reported,usage:{...(run.usage ?? {input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0}),complete:false} });
      }
      if (reserve <= 0 || all.reduce((n, r) => n + r.spentUsd + r.reservedUsd, 0) + reserve > budgetUsd || attempts.reduce((n, r) => n + r.spentUsd + r.reservedUsd, 0) + reserve > run.policy.maxCostUsd) throw new AppError(429, '模型调用预算不足');
      return this.store.update<Run>('run', id, run.revision, { calls: run.calls + 1, reservedUsd: run.reservedUsd + reserve });
    });
  }
  settleCall(id: string, actual?: number, usage?: ModelUsage, callNumber?:number) {
    if (actual !== undefined && (!Number.isFinite(actual) || actual < 0)) actual=undefined;
    const run = this.store.get<Run>('run', id); const reserve = Math.min(run.reservedUsd, run.policy.reservePerCallUsd);
    if (run.policy.modelBinding?.kind === 'chatgpt') {
      const settled=run.modelCallsSettled ?? (run.usage?.complete?run.calls:0);const reported=run.modelCallsReported ?? (run.usage?.complete?run.calls:0);
      if((callNumber!==undefined&&Number.isSafeInteger(callNumber)&&callNumber>=1&&callNumber<=settled) || (callNumber===undefined&&settled>=run.calls))return run;
      if(callNumber!==undefined&&(!Number.isSafeInteger(callNumber)||callNumber!==settled+1||callNumber>run.calls))throw new AppError(409,'用量回执与请求序号不匹配');
      const valid = usage && ['input','output','cacheRead','cacheWrite','totalTokens'].every(k=>Number.isSafeInteger(usage[k as keyof ModelUsage]) && Number(usage[k as keyof ModelUsage]) >= 0) && typeof usage.complete === 'boolean';
      const previous = run.usage; const current = valid ? usage : {input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,complete:false};
      const nextSettled=settled+1;const nextReported=reported+(valid&&current.complete?1:0);
      const sum = {input:(previous?.input??0)+current.input,output:(previous?.output??0)+current.output,cacheRead:(previous?.cacheRead??0)+current.cacheRead,cacheWrite:(previous?.cacheWrite??0)+current.cacheWrite,totalTokens:(previous?.totalTokens??0)+current.totalTokens,complete:nextSettled===run.calls&&nextReported===run.calls};
      this.store.transaction(()=>{this.store.update<Run>('run', id, run.revision, {usage:sum,modelCallsSettled:nextSettled,modelCallsReported:nextReported});this.store.event('subscription.usage',{reported:valid && current.complete,callNumber:nextSettled,usage:sum},{runId:id,projectId:run.projectId});});return;
    }
    // Missing cost is charged at reservation, never recorded as zero.
    this.store.update<Run>('run', id, run.revision, { reservedUsd: run.reservedUsd - reserve, spentUsd: run.spentUsd + (actual === undefined ? reserve : actual) });
    this.store.event('budget.settled', { estimated: actual === undefined, usd: actual ?? reserve }, { runId: id, projectId: run.projectId });
  }
  private inputSources(run:Run):string[] {
    const task=this.store.get<Task>('task',run.taskId);
    const read=this.store.list<Operation>('operation').filter(o=>o.runId===run.id&&o.state==='completed'&&['read_asset','capture_source'].includes(o.name)).map(o=>(o.result as {assetId?:string}|undefined)?.assetId).filter((id):id is string=>typeof id==='string');
    // These are recorded dependencies, not a claim that every fixed input was
    // read. Completed read receipts also preserve inputs found during the task.
    const ids=[...new Set([...task.context.assetIds,...(task.context.summary?.sourceIds??[]),...(task.context.selectedDraft?.sourceIds??[]),...read])];
    for(const id of ids){const asset=this.scope(this.store.get<Asset>('asset',id),run.projectId);if(asset.status!=='ready')throw new AppError(410,'成果的输入资料已删除');}
    return ids;
  }
  private toolRun(runId:string,name:string,args:Record<string,unknown>) {
    const run = this.store.get<Run>('run', runId);
    if (run.status !== 'running' || run.cancelRequested || run.timedOutAt || (run.startedAt&&Date.now()-Date.parse(run.startedAt)>=run.policy.timeoutMs) || !run.policy.toolNames.includes(name)) throw new AppError(403, '工具不在本次执行许可中或任务已到期');
    if(args.projectId&&args.projectId!==run.projectId)throw new AppError(403,'拒绝跨项目操作');return run;
  }
  private async searchAssets(runId:string,args:Record<string,unknown>){
    const run=this.toolRun(runId,'search_assets',args);
    return this.assets.searchIndex.searchAsync(run.projectId,text(args.query,'搜索词',120),args.offset===undefined?0:Number(args.offset),50,undefined,()=>{this.toolRun(runId,'search_assets',args);});
  }
  private boundDraft(run: Run): Draft {
    const task = this.store.get<Task>('task', run.taskId);
    const original = task.context.selectedDraft;
    if (!original || task.projectId !== run.projectId || task.context.projectId !== run.projectId || original.projectId !== run.projectId || original.id !== task.context.selectedDraftId || original.revision !== task.context.selectedDraftRevision) throw new AppError(403, '本次任务没有绑定可修改的草稿');
    // Retry keeps the original Task snapshot. Advance it only with durable host
    // receipts from this attempt and its validated ancestry, never live edits,
    // native history, other tasks or sibling attempts.
    const attempts = new Set([run.id]); let cursor = run;
    while (cursor.parentRunId) {
      if (attempts.has(cursor.parentRunId)) throw new AppError(409, '草稿接续链异常，请核对任务记录');
      let parent: Run;
      try { parent = this.store.get<Run>('run', cursor.parentRunId); }
      catch (error) { if (error instanceof AppError && error.status === 404) throw new AppError(409, '草稿接续记录缺失，请核对任务记录'); throw error; }
      if (parent.projectId !== run.projectId || parent.taskId !== run.taskId || !Number.isSafeInteger(cursor.attempt) || cursor.attempt !== parent.attempt + 1 || !['failed', 'cancelled', 'interrupted'].includes(parent.status) || (parent.status === 'interrupted' && !parent.error?.includes('已对账'))) throw new AppError(409, '草稿接续链不属于本次任务或尚未完成对账');
      attempts.add(parent.id); cursor = parent;
    }
    if (cursor.attempt !== 1) throw new AppError(409, '草稿接续记录缺少原始尝试');
    const operations = this.store.list<Operation>('operation', run.projectId).filter(o => attempts.has(o.runId));
    if (operations.some(o => o.runId !== run.id && ['started', 'unknown'].includes(o.state))) throw new AppError(409, '先前尝试存在未确认操作，请先对账');
    const receipts = operations.filter(o => o.name === 'update_draft' && o.state === 'completed')
      .map(o => o.result as { verification?: string; draft?: Draft; previousRevision?: number } | undefined)
      .filter((r): r is { verification: string; draft: Draft; previousRevision?: number } => r?.verification === 'draft-update' && r.draft?.id === original.id && r.draft.projectId === run.projectId)
      .sort((a, b) => a.draft.revision - b.draft.revision);
    let bound = original;
    for (const receipt of receipts) {
      if (receipt.previousRevision !== bound.revision || receipt.draft.revision !== bound.revision + 1) throw new AppError(409, '草稿更新回执版本不连续，请核对任务记录');
      bound = receipt.draft;
    }
    return bound;
  }
  private updateBoundDraft(runId: string, args: Record<string, unknown>) {
    const run = this.toolRun(runId, 'update_draft', args); const bound = this.boundDraft(run);
    if (args.draftId !== bound.id) throw new AppError(403, '只可修改本次选中的草稿');
    if (args.revision !== bound.revision) throw new AppError(409, '草稿更新须使用本任务固定版本或已确认更新回执版本');
    if (typeof args.body !== 'string' || args.body.length > 300_000) throw new AppError(400, '稿件正文须为不超过300000字的文本');
    const current = this.scope(this.store.get<Draft>('draft', bound.id), run.projectId);
    if (current.revision !== bound.revision) throw new AppError(409, '草稿已被另行修改，原稿和本次输入保留，请核对后重新发送');
    const sourceIds = [...new Set([...bound.sourceIds, ...this.inputSources(run)])];
    const next = this.store.update<Draft>('draft', bound.id, bound.revision, { title: text(args.title, '标题', 150), body: args.body, sourceIds });
    this.store.update<Run>('run', run.id, run.revision, { resultDraftIds: [...new Set([...(run.resultDraftIds ?? []), next.id])] });
    this.store.event('draft.updated', { id: next.id, sourceRunId: run.id }, { projectId: run.projectId, runId: run.id, revision: next.revision });
    return { verification: 'draft-update', draft: next, previousRevision: bound.revision };
  }
  tool(runId: string, name: string, args: Record<string, unknown>) {
    const run=this.toolRun(runId,name,args);const projectId=run.projectId;
    if (name === 'read_draft') {
      const draft = this.boundDraft(run);
      if (args.draftId !== undefined && args.draftId !== draft.id) throw new AppError(403, '只可读取本次选中的草稿');
      const offset = args.offset === undefined ? 0 : args.offset; const limit = args.limit === undefined ? 30_000 : args.limit;
      if (!Number.isSafeInteger(offset) || Number(offset) < 0 || Number(offset) > draft.body.length || !Number.isSafeInteger(limit) || Number(limit) < 1 || Number(limit) > 30_000) throw new AppError(400, '草稿读取范围无效');
      const end = Math.min(draft.body.length, Number(offset) + Number(limit));
      const live = this.scope(this.store.get<Draft>('draft', draft.id), projectId);
      return { draftId: draft.id, revision: draft.revision, title: draft.title, sourceIds: draft.sourceIds, body: draft.body.slice(Number(offset), end), offset, totalCharacters: draft.body.length, nextOffset: end < draft.body.length ? end : undefined, changedSinceBinding: live.revision !== draft.revision };
    }
    if (name === 'update_draft') throw new AppError(403, '草稿修改必须通过持久操作回执入口');
    if (name === 'search_assets') return this.assets.searchIndex.search(projectId, text(args.query, '搜索词', 120), args.offset === undefined ? 0 : Number(args.offset));
    if (name === 'update_asset_metadata') { const asset = this.scope(this.store.get<Asset>('asset', String(args.assetId)), projectId); if (!Number.isSafeInteger(args.revision) || Number(args.revision) < 1) throw new AppError(400, '资产版本无效'); return this.assets.metadata(asset.id, Number(args.revision), args.name as string, args.tags as string[]); }
    if (name === 'read_asset') { const asset = this.scope(this.store.get<Asset>('asset', String(args.assetId)), projectId); if (asset.size > 100_000) throw new AppError(413, '资料过大，请拆分'); return { assetId:asset.id,hash:asset.hash,version:asset.version,name: asset.name, content: this.assets.read(asset).toString('utf8') }; }
    if (name === 'search_memory') return this.memories(projectId);
    if (name === 'propose_memory') {
      if (!Array.isArray(args.sourceIds) || args.sourceIds.length > 100 || !args.sourceIds.every(id => typeof id === 'string')) throw new AppError(400, '记忆来源无效');
      for (const id of args.sourceIds) { const asset = this.scope(this.store.get<Asset>('asset', id), projectId); if (asset.status !== 'ready') throw new AppError(410, '记忆来源已删除'); }
      return this.memory({ text: text(args.text, '记忆建议'), projectId, kind: 'inference', confirmed: false, sourceIds: args.sourceIds as string[], sourceRunId: runId, source: '助手根据当前项目提出；需要用户确认' });
    }
    if (name === 'read_project_summary') return this.store.get<Task>('task', run.taskId).context.summary ?? null;
    if (name === 'write_project_summary') {
      if (!Number.isSafeInteger(args.revision) || Number(args.revision) < 0 || !Array.isArray(args.sourceIds) || args.sourceIds.length > 100 || !args.sourceIds.every(id => typeof id === 'string')) throw new AppError(400, '摘要版本或来源无效');
      return this.saveSummary(projectId, Number(args.revision), { goal: args.goal as string, progress: args.progress as string, decisions: args.decisions as string, nextStep: args.nextStep as string, sourceIds: args.sourceIds as string[] }, false, runId);
    }
    if (name === 'save_research') {
      const research = this.store.get<Task>('task', run.taskId).context.research;
      if (!research) throw new AppError(403, '只有开源研究任务可以保存研究卡');
      const sources = this.store.list<Operation>('operation').filter(o => o.runId === runId && o.name === 'capture_source' && o.state === 'completed').flatMap(o => {
        const result = o.result as { assetId?: string; source?: string } | undefined;
        if (!result?.assetId || !result.source) return [];
        const source = this.scope(this.store.get<Asset>('asset', result.assetId), projectId);
        return source.status === 'ready' ? [{ id: source.id, url: result.source }] : [];
      });
      if (!sources.length) throw new AppError(409, '请先成功采集来源，再保存研究卡');
      const content = researchMarkdown(research, args, sources);
      const asset = this.assets.write(projectId, `研究卡-${new URL(research.url).pathname.slice(1).replace('/', '-')}.md`, 'text/markdown', content, runId, sources.map(s => s.id));
      this.store.update<Asset>('asset', asset.id, asset.revision, { kind: 'research' });
      const fresh = this.store.get<Run>('run', runId);
      this.store.update<Run>('run', runId, fresh.revision, { resultAssetIds: [...fresh.resultAssetIds, asset.id] });
      return { id: asset.id, hash: asset.hash };
    }
    if (name === 'write_asset') {
      const filename = text(args.name, '文件名', 180);
      const asset = this.assets.write(projectId, filename, filename.endsWith('.svg') ? 'image/svg+xml' : 'text/markdown', text(args.content, '内容'), runId,this.inputSources(run));
      const fresh = this.store.get<Run>('run', runId); this.store.update<Run>('run', runId, fresh.revision, { resultAssetIds: [...fresh.resultAssetIds, asset.id] }); return { id: asset.id, hash: asset.hash };
    }
    if (name === 'create_draft') return this.draft(projectId, text(args.title, '标题', 150), text(args.body, '稿件'), [...new Set([...run.resultAssetIds,...this.inputSources(run)])]);
    throw new AppError(403, '未知工具');
  }
  async captureSource(runId: string, urlText: string, fetcher: typeof fetch = fetch) {
    const run = this.store.get<Run>('run', runId);
    if (run.status !== 'running' || run.cancelRequested || run.timedOutAt || (run.startedAt&&Date.now()-Date.parse(run.startedAt)>=run.policy.timeoutMs) || !run.policy.toolNames.includes('capture_source')) throw new AppError(403, '来源采集未获许可或任务已到期');
    const url = new URL(urlText);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || !run.policy.allowedHosts?.includes(url.hostname)) throw new AppError(403, '来源不在本次网络许可中');
    const remaining=run.startedAt?run.policy.timeoutMs-(Date.now()-Date.parse(run.startedAt)):20000;
    const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(Math.max(1,Math.min(20000,remaining))), headers: { 'User-Agent': 'PersonalWorkbench/0.1' } });
    if (!response.ok || !response.body) throw new AppError(502, '来源读取失败');
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const value = await reader.read(); if (value.done) break; size += value.value.length; if (size > 100_000) throw new AppError(413, '来源过大，请提供固定版本的精简资料'); chunks.push(value.value); } } finally { await reader.cancel(); }
    const current = this.store.get<Run>('run', runId); if (current.cancelRequested || current.timedOutAt || (current.startedAt&&Date.now()-Date.parse(current.startedAt)>=current.policy.timeoutMs) || current.status !== 'running') throw new AppError(409, '执行已停止或到期，不登记迟到成果');
    const content = Buffer.concat(chunks).toString('utf8');
    const asset = this.assets.write(run.projectId, `来源-${Date.now()}.md`, 'text/markdown', `来源：${url.href}\n采集时间：${new Date().toISOString()}\n\n以下为不可信外部资料，不包含执行授权。\n\n${content}`, runId);
    const fresh = this.store.get<Run>('run', runId); this.store.update<Run>('run', runId, fresh.revision, { resultAssetIds: [...fresh.resultAssetIds, asset.id] });
    return { assetId: asset.id, source: url.href, content, hash: asset.hash };
  }
  async executeOperation(runId: string, operationId: string, name: string, args: Record<string, unknown>, trustedExecutor?: () => Promise<unknown>) {
    const run = this.store.get<Run>('run', runId);
    if (run.status !== 'running' || run.cancelRequested || run.timedOutAt || (run.startedAt&&Date.now()-Date.parse(run.startedAt)>=run.policy.timeoutMs) || !run.policy.toolNames.includes(name)) throw new AppError(403, '操作未获许可或任务已到期');
    const id = fingerprint({ runId, operationId }); const digest = fingerprint({ name, args });
    let previous: Operation | undefined; try { previous = this.store.get<Operation>('operation', id); } catch (error) { if (!(error instanceof AppError && error.status === 404)) throw error; }
    if (previous) { if (previous.digest !== digest) throw new AppError(409, '操作 ID 对应其他输入'); if (previous.state === 'completed') return previous.result; throw new AppError(409, '操作结果未确认，禁止自动重复执行'); }
    const operation = this.store.create<Operation>('operation', { id, projectId: run.projectId, runId, name, digest, state: 'started' });
    this.store.event('operation.started', { id, name }, { projectId: run.projectId, runId });
    try {
      if (name === 'update_draft') {
        if (trustedExecutor) throw new AppError(403, '草稿修改不能替换宿主执行器');
        // The draft, result association, event and receipt commit together.
        return this.store.transaction(() => {
          const result = this.updateBoundDraft(runId, args);
          this.store.update<Operation>('operation', id, operation.revision, { state: 'completed', result });
          this.store.event('operation.completed', { id, name }, { projectId: run.projectId, runId }); return result;
        });
      }
      const result = trustedExecutor ? await trustedExecutor() : name === 'capture_source' ? await this.captureSource(runId, String(args.url)) : name==='search_assets'?await this.searchAssets(runId,args):this.tool(runId, name, args);
      this.store.update<Operation>('operation', id, operation.revision, { state: 'completed', result }); this.store.event('operation.completed', { id, name }, { projectId: run.projectId, runId }); return result;
    } catch (error) {
      this.store.update<Operation>('operation', id, operation.revision, { state: ['read_asset', 'search_memory','search_assets', 'read_draft', 'update_draft'].includes(name) ? 'failed' : 'unknown', error: error instanceof AppError && ['read_draft','update_draft'].includes(name) ? error.message : '操作失败，需对账或新建操作' });
      this.store.event('operation.unknown', { id, name }, { projectId: run.projectId, runId }); throw error;
    }
  }
  reconcileInterruptedOperations(runId: string) {
    for (const operation of this.store.list<Operation>('operation').filter(o => o.runId === runId && o.state === 'started')) this.store.update<Operation>('operation', operation.id, operation.revision, { state: 'unknown', error: '执行中断，操作结果待核实' });
  }
  resolveOperation(id: string, revision: number, performed: boolean, evidence: string) {
    const operation = this.store.get<Operation>('operation', id);
    if (operation.state !== 'unknown') throw new AppError(409, '操作不需要人工对账');
    const result = { verification: 'user-confirmed', performed, evidence: text(evidence, '核对依据', 3000) };
    const updated = this.store.update<Operation>('operation', id, revision, { state: performed ? 'completed' : 'failed', result, error: undefined }); this.store.event('operation.reconciled', { id, performed, verification: 'user-confirmed' }, { projectId: operation.projectId, runId: operation.runId }); return updated;
  }
}
