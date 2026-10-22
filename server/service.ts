import { researchMarkdown } from './research.js';
import { requireToolReconciliation } from './tool-progress.js';
import {inputView} from './run-input.js';
import type {RunInput} from '../shared/run-input.js';
import type { ModelRequestPurpose, ModelRequestReceipt, TaskBudgetAddition, TaskBudgetGrant, TaskBudgetSnapshot } from '../shared/pi-runtime.js';
import { createHash } from 'node:crypto';
import type { Project, ProjectSummary, ConversationMessage, ConversationPage, ConversationSearchHit, ConversationSearchPage, Task, Run, Policy, Memory, Draft, InboxItem, Asset, Operation, WorkbenchEvent, ModelUsage } from '../shared/contracts.js';
import { canTransition, isLiveExecution } from '../shared/contracts.js';
import { Store, AppError } from './store.js';
import { Assets } from './assets.js';
import { continuationFor,pendingContinuation,prepareSource,assertBranchPoint,assertVersionBase } from './native-session.js';
import { versionTargetsForRun } from './native-version-ops.js';
import {dirname} from 'node:path';
import type { Conversation } from '../shared/contracts.js';
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
  createConversation(projectId:string,title:string,commandId:string):Conversation {
    this.project(projectId);text(title,'对话标题',120);text(commandId,'命令ID',120);
    return this.store.command(`conversation:${commandId}`,fingerprint({projectId,title}),()=>{
      const conversation=this.store.create<Conversation>('conversation',{projectId,title});
      this.store.event('conversation.created',{id:conversation.id},{projectId});return conversation;
    });
  }
  renameConversation(id:string,revision:number,title:string):Conversation {
    text(title,'对话标题',120);
    return this.store.transaction(()=>{
      const current=this.store.get<Conversation>('conversation',id);
      this.project(current.projectId);
      const next=this.store.update<Conversation>('conversation',id,revision,{title});
      this.store.event('conversation.updated',{id:next.id,title:next.title},{projectId:next.projectId,revision:next.revision});
      return next;
    });
  }
  listConversations(projectId:string,query?:string):Conversation[] {
    this.project(projectId);
    const all=this.store.list<Conversation>('conversation',projectId);
    const needle=query?.trim().toLowerCase();
    if(!needle)return all;
    return all.filter(c=>c.title.toLowerCase().includes(needle));
  }
  searchConversation(projectId:string,conversationId:string,query:string,after=0,limit=20,signal?:AbortSignal):ConversationSearchPage {
    this.project(projectId);
    this.scope(this.store.get<Conversation>('conversation',conversationId),projectId);
    const needle=text(query,'查找内容',200).toLowerCase();
    const pageLimit=Math.min(Math.max(1,limit),50);
    const start=Math.max(0,after);
    const rows=this.store.db.prepare(
      "SELECT sequence,body FROM events WHERE json_extract(body,'$.projectId')=? AND sequence>? AND json_extract(body,'$.schemaVersion')=1 AND json_extract(body,'$.type') IN ('task.accepted','assistant.text','assistant.message','run.input') AND json_extract(body,'$.runId') IN (SELECT id FROM entities WHERE kind='run' AND json_extract(body,'$.conversationId')=?) ORDER BY sequence ASC LIMIT ?",
    ).all(projectId,start,conversationId,pageLimit*8);
    const hits:ConversationSearchHit[]=[];
    for(const row of rows){
      signal?.throwIfAborted();
      const e=JSON.parse(String(row.body)) as WorkbenchEvent;
      const sequence=Number(row.sequence);
      let role:'user'|'assistant'='assistant';
      let messageId=e.eventId;
      let textBody='';
      if(e.type==='run.input'){
        const input=inputView(this.store,this.store.get<RunInput>('run_input',(e.data as {id:string}).id));
        role='user';messageId=input.id;textBody=input.text;
      }else if(e.type==='assistant.message'&&(e.data as {messageId?:string}).messageId){
        const message=this.store.get<import('../shared/run-stream.js').RunMessage>('run_message',(e.data as {messageId:string}).messageId);
        role='assistant';messageId=message.id;textBody=message.preview;
      }else if(e.type==='task.accepted'){
        role='user';textBody=(e.data as {task?:Task}).task?.goal??'';
      }else{
        textBody=(e.data as {text?:string}).text??'';
      }
      if(!textBody.toLowerCase().includes(needle))continue;
      const at=Math.max(0,textBody.toLowerCase().indexOf(needle));
      const from=Math.max(0,at-24);
      const to=Math.min(textBody.length,at+needle.length+48);
      hits.push({
        messageId,
        sequence,
        role,
        snippet:`${from>0?'…':''}${textBody.slice(from,to)}${to<textBody.length?'…':''}`,
        at:e.at,
        runId:e.runId,
        conversationId,
      });
      if(hits.length>=pageLimit)break;
    }
    const lastScanned=rows.length?Number(rows[rows.length-1].sequence):start;
    const nextAfter=rows.length>=pageLimit*8||hits.length>=pageLimit?lastScanned:undefined;
    return {query:needle,hits,nextAfter};
  }
  branchConversation(projectId:string,sourceRunId:string,entryId:string,sourceHash:string,title:string,goal:string,commandId:string,policy:Policy){
    text(commandId,'命令ID',120);text(entryId,'历史节点',120);text(title,'话题名称',120);text(goal,'目标');
    return this.store.command(`branch:${commandId}`,fingerprint({projectId,sourceRunId,entryId,sourceHash,title,goal,policy}),()=>{
      const source=this.scope(this.store.get<Run>('run',sourceRunId),projectId);
      const base=continuationFor(this.store,projectId,policy,sourceRunId);
      if(!base||base.sha256!==sourceHash)throw new AppError(409,'原会话已变化，请重新选择分支节点');
      const continuation={...base,entryId};assertBranchPoint(source.sessionPath!,continuation,projectId,dirname(this.store.path));
      const branch={sourceRunId,sourceEntryId:entryId,sourceConversationId:source.conversationId,sourceHash};
      const conversation=this.store.create<Conversation>('conversation',{projectId,title,branch});
      this.store.event('conversation.created',{id:conversation.id},{projectId});
      const submitted=this.submit(projectId,goal,`branch_${fingerprint({commandId})}`,'pi',policy,[],undefined,{view:'project'},null,conversation.id);
      const run=this.store.update<Run>('run',submitted.run.id,submitted.run.revision,{continuation});
      this.store.event('conversation.branched',{id:conversation.id,...branch},{projectId,runId:run.id});
      return {conversation,task:submitted.task,run};
    });
  }
  /** Independent copy for edit-resend / answer regenerate. Never rewrites the native original. */
  versionConversation(
    projectId: string,
    sourceRunId: string,
    kind: 'edit_resend' | 'regenerate',
    sourceHash: string,
    title: string,
    goal: string,
    commandId: string,
    policy: Policy,
    assetIds: string[] = [],
  ) {
    text(commandId, '命令ID', 120);
    text(title, '话题名称', 120);
    text(goal, '目标');
    text(sourceHash, '原会话校验值', 64);
    if (kind === 'regenerate' && assetIds.length) throw new AppError(400, '重新生成复用历史附件，不能另附新资料冒充');
    return this.store.command(
      `version:${commandId}`,
      fingerprint({ projectId, sourceRunId, kind, sourceHash, title, goal, assetIds, policy }),
      () => {
        const source = this.scope(this.store.get<Run>('run', sourceRunId), projectId);
        const targets = versionTargetsForRun(this.store, source);
        if (targets.unavailableReason) throw new AppError(409, targets.unavailableReason);
        if (targets.sourceHash !== sourceHash) throw new AppError(409, '原会话已变化，请重新读取版本目标');
        const base = continuationFor(this.store, projectId, policy, sourceRunId);
        if (!base || base.sha256 !== sourceHash) throw new AppError(409, '原会话已变化，请重新选择');
        let baseEntryId: string | null;
        let sourceEntryId: string;
        let sessionAction: Run['sessionAction'];
        let versionKind: Run['versionKind'] = kind;
        if (kind === 'edit_resend') {
          if (!targets.editResend) throw new AppError(409, '当前执行没有可编辑重发的用户输入');
          baseEntryId = targets.editResend.baseEntryId;
          sourceEntryId = targets.editResend.userEntryId;
          sessionAction = undefined;
          for (const id of assetIds) {
            const asset = this.scope(this.store.get<Asset>('asset', id), projectId);
            if (asset.status !== 'ready') throw new AppError(410, '输入资产已删除');
          }
        } else {
          if (!targets.regenerate) throw new AppError(409, '当前执行没有可重新生成的最终答复');
          baseEntryId = targets.regenerate.baseEntryId;
          sourceEntryId = targets.regenerate.targetEntryId;
          sessionAction = 'regenerate';
        }
        assertVersionBase(
          source.sessionPath!,
          base.sessionId,
          sourceHash,
          baseEntryId,
          projectId,
          dirname(this.store.path),
          kind,
        );
        const branch = {
          sourceRunId,
          sourceEntryId,
          sourceConversationId: source.conversationId,
          sourceHash,
          versionKind: kind,
        };
        const conversation = this.store.create<Conversation>('conversation', { projectId, title, branch });
        this.store.event('conversation.created', { id: conversation.id }, { projectId });
        const submitted = this.submit(
          projectId,
          goal,
          `version_${fingerprint({ commandId })}`,
          'pi',
          policy,
          kind === 'edit_resend' ? assetIds : [],
          undefined,
          { view: 'project' },
          null,
          conversation.id,
        );
        const patch: Partial<Run> = { versionKind };
        if (sessionAction) patch.sessionAction = sessionAction;
        if (baseEntryId !== null) patch.continuation = { ...base, entryId: baseEntryId };
        const run = this.store.update<Run>('run', submitted.run.id, submitted.run.revision, patch);
        this.store.event('conversation.versioned', { id: conversation.id, kind, ...branch }, { projectId, runId: run.id });
        return { conversation, task: submitted.task, run, targets };
      },
    );
  }
  conversation(projectId: string, before?: number, limit = 50, conversationId?:string): ConversationPage {
    this.project(projectId);
    if(conversationId)this.scope(this.store.get<Conversation>('conversation',conversationId),projectId);
    const filter=conversationId?" AND json_extract(body,'$.runId') IN (SELECT id FROM entities WHERE kind='run' AND json_extract(body,'$.conversationId')=?)":"";
    const params: (string|number)[]=[projectId,before??Number.MAX_SAFE_INTEGER];if(conversationId)params.push(conversationId);params.push(limit+1);
    const rows = this.store.db.prepare("SELECT sequence,body FROM events WHERE json_extract(body,'$.projectId')=? AND sequence<? AND json_extract(body,'$.schemaVersion')=1 AND json_extract(body,'$.type') IN ('task.accepted','assistant.text','assistant.message','run.input')"+filter+" ORDER BY sequence DESC LIMIT ?").all(...params);
    const more = rows.length > limit; const messages: ConversationMessage[] = rows.slice(0, limit).reverse().map(row => {
      const e = JSON.parse(String(row.body)) as WorkbenchEvent; const data = e.data as { text?: string; task?: Task; messageId?: string };
      if(e.type==='run.input'){
        const input=inputView(this.store,this.store.get<RunInput>('run_input',(e.data as {id:string}).id));
        return {id:input.id,sequence:Number(row.sequence),role:'user',text:input.text,at:e.at,runId:e.runId,inputState:input.state,inputReason:input.reason};
      }
      if(e.type==='assistant.message'&&data.messageId){
        const message=this.store.get<import('../shared/run-stream.js').RunMessage>('run_message',data.messageId);
        const run=this.store.get<Run>('run',message.runId);
        return {id:message.id,sequence:Number(row.sequence),role:'assistant',text:message.preview,at:e.at,runId:e.runId,
          phase:message.phase==='partial'&&!['running','waiting_user','waiting_interaction'].includes(run.status)?'interrupted':message.phase,
          fullTextUrl:message.characters>message.preview.length?`/api/runs/${run.id}/messages/${encodeURIComponent(message.id)}/text`:undefined};
      }
      let followUp:ConversationMessage['followUp'];
      const images:NonNullable<ConversationMessage['images']>=[];
      if(e.type==='task.accepted'&&e.runId){
        const original=this.store.get<Run>('run',e.runId);
        for(const id of [...new Set(data.task?.context.assetIds??[])]){
          let asset:Asset;
          try{asset=this.store.get<Asset>('asset',id);}catch(error){if(error instanceof AppError&&error.status===404)continue;throw error;}
          if(asset.projectId!==projectId||!['image/png','image/jpeg','image/gif','image/webp'].includes(asset.mime.toLowerCase()))continue;
          images.push({assetId:asset.id,name:asset.name,hash:asset.hash,url:asset.status==='ready'?`/api/assets/${encodeURIComponent(asset.id)}`:undefined});
        }
        if(original.continueAfterRunId){
          const latest=this.store.list<Run>('run',projectId).filter(r=>r.taskId===original.taskId).sort((a,b)=>b.attempt-a.attempt)[0]??original;
          followUp={state:latest.status,sourceRunId:original.continueAfterRunId,runId:latest.id,reason:latest.error};
        }
      }
      return { id: e.eventId, sequence: Number(row.sequence), role: e.type === 'task.accepted' ? 'user' : 'assistant', text: e.type === 'task.accepted' ? data.task?.goal ?? '' : data.text ?? '', at: e.at, runId: e.runId,followUp,images:images.length?images:undefined };
    });
    return { messages, olderThan: more ? messages[0]?.sequence : undefined };
  }
  async prepareSubmission(projectId: string, mode: Run['mode'], policy: Policy, requested?: string | null, conversationId?: string, signal?: AbortSignal) {
    this.project(projectId); if (mode !== 'pi' || requested === null) return;
    if (conversationId) this.scope(this.store.get<Conversation>('conversation', conversationId), projectId);
    if (!conversationId && !requested && pendingContinuation(this.store, projectId, policy, undefined)) return;
    const source = requested ? this.store.get<Run>('run', requested) : [...this.store.list<Run>('run', projectId)].reverse().find(r => r.mode === mode && (conversationId ? r.conversationId === conversationId : !r.conversationId && r.status === 'completed' && r.policy.version === policy.version && JSON.stringify(r.policy.modelBinding) === JSON.stringify(policy.modelBinding)));
    if (!source) return;
    if (source.projectId !== projectId || source.conversationId !== conversationId) throw new AppError(403, '会话来源不属于当前话题');
    if (['completed','failed','cancelled','interrupted'].includes(source.status)) await prepareSource(this.store, source, signal);
  }
  async prepareRetry(id: string, signal?: AbortSignal) { await prepareSource(this.store, this.store.get<Run>('run', id), signal); }
  submit(projectId: string, goal: string, commandId: string, mode: Run['mode'], policy: Policy, assetIds: string[] = [], nodeId?: string, context: { research?: Task['context']['research']; view: string; selectedAssetId?: string; selectedDraftId?: string; selectedDraftRevision?: number } = { view: 'project' },continueFromRunId?:string|null,conversationId?:string,sessionAction?: 'compact',compactionFocus?: string) {
    this.project(projectId); text(goal, '目标'); text(commandId, '命令 ID', 120);
    if (policy.projectId !== projectId) throw new AppError(403, '策略项目不匹配');
    if (!['project', 'summary', 'results', 'tasks', 'drafts', 'research'].includes(context.view)) throw new AppError(400, '当前视图无效');
    if (context.selectedAssetId && !assetIds.includes(context.selectedAssetId)) throw new AppError(400, '选中对象必须包含在固定输入中');
    if ((context.selectedDraftId !== undefined || context.selectedDraftRevision !== undefined) && (context.view !== 'drafts' || !context.selectedDraftId || !Number.isSafeInteger(context.selectedDraftRevision) || Number(context.selectedDraftRevision) < 1)) throw new AppError(400, '当前草稿与版本无效');
    for (const id of assetIds) { const asset = this.scope(this.store.get<Asset>('asset', id), projectId); if (asset.status !== 'ready') throw new AppError(410, '输入资产已删除'); }
    if(conversationId)this.scope(this.store.get<Conversation>('conversation',conversationId),projectId);
    if (sessionAction && (sessionAction !== 'compact' || mode !== 'pi' || !continueFromRunId)) throw new AppError(400, '手动压缩需要指定Pi源会话');
    if (compactionFocus !== undefined && sessionAction !== 'compact') throw new AppError(400, '压缩重点只能用于手动压缩');
    if (compactionFocus !== undefined && (typeof compactionFocus !== 'string' || !compactionFocus.trim() || compactionFocus.length > 2000)) throw new AppError(400, '压缩重点须为1至2000字符');
    const focus = compactionFocus?.trim();
    return this.store.command(`task:${commandId}`, fingerprint({ projectId, goal, mode, assetIds, nodeId, policy, context,continueFromRunId,conversationId,sessionAction,compactionFocus:focus }), () => {
      const selectedDraft = context.selectedDraftId ? this.scope(this.store.get<Draft>('draft', context.selectedDraftId), projectId) : undefined;
      if (selectedDraft && selectedDraft.revision !== context.selectedDraftRevision) throw new AppError(409, '当前草稿已有新版本，请保留修改并重新查看后发送');
      let source=continueFromRunId;
      if(conversationId){
        if(source===undefined)source=[...this.store.list<Run>('run',projectId)].reverse().find(r=>r.conversationId===conversationId&&r.mode===mode)?.id??null;
        if(source&&this.store.get<Run>('run',source).conversationId!==conversationId)throw new AppError(403,'不能接续其他对话的执行');
      }else if(source&&this.store.get<Run>('run',source).conversationId)throw new AppError(403,'独立对话须通过所属会话继续');
      const continueAfterRunId=mode==='pi'?pendingContinuation(this.store,projectId,policy,source):undefined;
      const continuation=mode==='pi'&&!continueAfterRunId?continuationFor(this.store,projectId,policy,source):undefined;
      if (sessionAction === 'compact' && (!continuation || continueAfterRunId)) throw new AppError(409, '源会话结束并保存后才能手动压缩');
      const summary = this.summary(projectId);
      const task = this.store.create<Task>('task', { projectId, conversationId, goal, commandId, context: { research: context.research, projectId, assetIds: [...assetIds], view: context.view, selectedAssetId: context.selectedAssetId, selectedDraftId: selectedDraft?.id, selectedDraftRevision: selectedDraft?.revision, selectedDraft, summary: summary?.confirmed ? summary : undefined }, acceptance: 'pending' });
      const run = this.store.create<Run>('run', { projectId, conversationId, taskId: task.id, mode, status: 'queued', attempt: 1, continuation,continueAfterRunId,sessionAction,compactionFocus:focus,cancelRequested: false, resultAssetIds: [], policy, calls: 0, reservedUsd: 0, spentUsd: 0, nodeId });
      this.store.event('task.accepted', { task, run }, { projectId, runId: run.id, revision: run.revision }); return { task, run };
    });
  }
  transition(id: string, status: Run['status'], fields: Partial<Run> = {}) {
    return this.store.transaction(() => { const run = this.store.get<Run>('run', id); if (!canTransition(run.status, status)) throw new AppError(409, `不能从 ${run.status} 转为 ${status}`); const next = this.store.update<Run>('run', id, run.revision, { ...fields, status }); this.store.event('run.status', { status, error: fields.error }, { projectId: run.projectId, runId: id, revision: next.revision }); return next; });
  }
  cancel(id: string) {
    const run = this.store.get<Run>('run', id);
    if (['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status) || (isLiveExecution(run.status) && run.cancelRequested)) return run;
    return this.store.transaction(() => {
      const current = this.store.get<Run>('run', id);
      if (['completed', 'failed', 'cancelled', 'interrupted'].includes(current.status) || (isLiveExecution(current.status) && current.cancelRequested)) return current;
      if (!isLiveExecution(current.status)) return this.transition(id, 'cancelled', { cancelRequested: true, endedAt: new Date().toISOString() });
      const next = this.store.update<Run>('run', id, current.revision, { cancelRequested: true,cancelRequestedAt:new Date().toISOString() });
      this.store.event('run.cancel_requested', {}, { projectId: current.projectId, runId: current.id }); return next;
    });
  }
  async requestCancel(id: string) {
    const run = this.store.get<Run>('run', id);
    if (['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status) || (isLiveExecution(run.status) && run.cancelRequested)) return run;
    return this.store.capacity ? this.store.capacity.exclusiveAsync(() => this.cancel(id), 1000) : this.cancel(id);
  }
  taskBudget(id: string): TaskBudgetSnapshot {
    const run = this.store.get<Run>('run', id);
    const attempts = this.store.list<Run>('run', run.projectId).filter(r => r.taskId === run.taskId);
    const latest = attempts.at(-1)!;
    const usedCalls = attempts.reduce((n, r) => n + r.calls, 0);
    const accountedUsd = attempts.reduce((n, r) => n + r.spentUsd + r.reservedUsd, 0);
    return { latestRunId: latest.id, maxCalls: latest.policy.maxCalls, maxCostUsd: latest.policy.maxCostUsd, usedCalls, accountedUsd,
      remainingCalls: Math.max(0, latest.policy.maxCalls - usedCalls), remainingUsd: Math.max(0, latest.policy.maxCostUsd - accountedUsd),
      grants: this.store.list<TaskBudgetGrant>('task_budget_grant', run.projectId).filter(g => g.taskId === run.taskId) };
  }
  retry(id: string, commandId: string, addition?: TaskBudgetAddition) {
    text(commandId, '命令ID', 120);
    const receipt = this.store.commandReceipt<Run>(`retry:${commandId}`, fingerprint({ id, addition }));
    if (receipt) return receipt.value;
    const run = this.store.get<Run>('run', id); if (!['failed', 'cancelled', 'interrupted'].includes(run.status)) throw new AppError(409, '此任务不需要重试');
    requireToolReconciliation(this.store,id);
    if (run.status === 'interrupted' && !run.error?.includes('已对账')) throw new AppError(409, '请先完成中断对账，避免重复执行');
    if (this.store.list<Operation>('operation').some(o => o.runId === id && ['started', 'unknown'].includes(o.state))) throw new AppError(409, '存在结果未确认的操作，请先对账');
    return this.store.command(`retry:${commandId}`, fingerprint({ id, addition }), () => {
      if (this.taskBudget(id).latestRunId !== id) throw new AppError(409, '任务已有后续执行，请从最新执行恢复');
      let policy = run.policy;
      if (addition) {
        if (run.mode !== 'pi') throw new AppError(400, '仅Pi任务支持追加模型额度');
        if (!Number.isSafeInteger(addition.calls) || addition.calls < 0 || addition.calls > 10000 || !Number.isFinite(addition.costUsd) || addition.costUsd < 0 || addition.costUsd > 100000 || (addition.calls === 0 && addition.costUsd === 0)) throw new AppError(400, '追加额度必须为有效正增量');
        text(addition.reason, '追加原因', 500);
        if (run.policy.modelBinding?.kind === 'chatgpt' && addition.costUsd !== 0) throw new AppError(400, '订阅任务只追加请求次数，不追加API费用');
        policy = { ...run.policy, maxCalls: run.policy.maxCalls + addition.calls, maxCostUsd: run.policy.maxCostUsd + addition.costUsd };
        if (!Number.isSafeInteger(policy.maxCalls) || !Number.isFinite(policy.maxCostUsd)) throw new AppError(400, '累计额度超出有效范围');
      }
      const continuation=run.mode==='pi'&&run.sessionPath&&run.sessionId?continuationFor(this.store,run.projectId,run.policy,run.id):undefined;
      const next = this.store.create<Run>('run', { projectId: run.projectId, conversationId: run.conversationId, taskId: run.taskId, mode: run.mode, status: 'queued', attempt: run.attempt + 1, parentRunId: id, continuation: continuation ?? (run.sessionAction === 'compact' || run.sessionAction === 'regenerate' || run.continuation?.entryId ? run.continuation : undefined),importedContinuation:continuation?undefined:run.importedContinuation,continueAfterRunId:continuation?undefined:run.continueAfterRunId,sessionAction:run.sessionAction,compactionFocus:run.compactionFocus,versionKind:run.versionKind,cancelRequested: false, resultAssetIds: [], policy, calls: 0, reservedUsd: 0, spentUsd: 0, nodeId: run.nodeId });
      if (addition) {
        const grant = this.store.create<TaskBudgetGrant>('task_budget_grant', { schemaVersion: 1, projectId: run.projectId, taskId: run.taskId, sourceRunId: id, resumedRunId: next.id, commandId, addition,
          before: { maxCalls: run.policy.maxCalls, maxCostUsd: run.policy.maxCostUsd }, after: { maxCalls: policy.maxCalls, maxCostUsd: policy.maxCostUsd } });
        this.store.event('task.budget_added', grant, { projectId: run.projectId, runId: next.id });
      }
      this.store.event('run.retry', next, { projectId: next.projectId, runId: next.id }); return next;
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
  reserveRequest(id: string, requestId: string, maxCalls: number | undefined, budgetUsd: number, purpose: ModelRequestPurpose = 'agent') {
    text(requestId, '模型请求标识', 120);
    return this.store.command(`model-reserve:${id}:${requestId}`, fingerprint({ id, purpose }), () => {
      const run = this.reserveCall(id, maxCalls, budgetUsd, purpose);
      return { callNumber: run.calls };
    });
  }
  modelRequests(id: string, after = 0, limit = 50) {
    const run = this.store.get<Run>('run', id);
    if (!Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new AppError(400, '请求记录分页无效');
    const rows = this.store.db.prepare("SELECT body FROM entities WHERE kind='model_request' AND json_extract(body,'$.runId')=? AND json_extract(body,'$.callNumber')>? ORDER BY json_extract(body,'$.callNumber') LIMIT ?").all(id, after, limit + 1);
    const items = rows.slice(0, limit).map(row => JSON.parse(String(row.body)) as ModelRequestReceipt);
    return { items, nextAfter: rows.length > limit ? items.at(-1)?.callNumber : undefined, calls: run.calls };
  }
  reserveCall(id: string, maxCalls: number | undefined, budgetUsd: number, purpose: ModelRequestPurpose = 'agent') {
    if (!['agent', 'compaction', 'branch_summary'].includes(purpose)) throw new AppError(400, '模型请求用途无效');
    return this.store.transaction(() => {
      const run = this.store.get<Run>('run', id); const all = this.store.list<Run>('run');
      if (run.cancelRequested || run.timedOutAt || (run.startedAt&&Date.now()-Date.parse(run.startedAt)>=run.policy.timeoutMs) || run.status !== 'running' || !run.policy.allowModel) throw new AppError(403, '模型调用未获许可或已到期');
      const reserve = run.policy.reservePerCallUsd;
      const subscription = run.policy.modelBinding?.kind === 'chatgpt';
      const record = (updated: Run) => {
        this.store.create<ModelRequestReceipt>('model_request', { id: `${id}:${updated.calls}`, schemaVersion: 1, projectId: run.projectId, runId: id, taskId: run.taskId, callNumber: updated.calls, purpose, state: 'reserved', reservedUsd: subscription ? 0 : reserve });
        return updated;
      };
      const matching = all.filter(r => subscription ? r.policy.modelBinding?.kind === 'chatgpt' && r.policy.modelBinding.connectionId === run.policy.modelBinding!.connectionId : r.policy.modelBinding?.kind !== 'chatgpt');
      const attempts = all.filter(r => r.taskId === run.taskId);
      // A retry is another attempt at the same grant, not a fresh allowance.
      if (attempts.reduce((n, r) => n + r.calls, 0) >= run.policy.maxCalls) throw new AppError(429, '同一任务累计模型调用次数已达上限，重试不会重置额度');
      if (run.calls >= run.policy.maxCalls || (maxCalls !== undefined && matching.reduce((n, r) => n + r.calls, 0) >= maxCalls)) throw new AppError(429, '模型调用次数已达上限');
      if (subscription) {
        if (!run.policy.modelBinding?.connectionId) throw new AppError(403, '缺订阅连接绑定');
        const settled=run.modelCallsSettled ?? (run.usage?.complete?run.calls:0);const reported=run.modelCallsReported ?? (run.usage?.complete?run.calls:0);
        return record(this.store.update<Run>('run', id, run.revision, { calls: run.calls + 1,modelCallsSettled:settled,modelCallsReported:reported,usage:{...(run.usage ?? {input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0}),complete:false} }));
      }
      if (reserve <= 0 || all.reduce((n, r) => n + r.spentUsd + r.reservedUsd, 0) + reserve > budgetUsd || attempts.reduce((n, r) => n + r.spentUsd + r.reservedUsd, 0) + reserve > run.policy.maxCostUsd) throw new AppError(429, '模型调用预算不足');
      return record(this.store.update<Run>('run', id, run.revision, { calls: run.calls + 1, reservedUsd: run.reservedUsd + reserve, usage: { ...(run.usage ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 }), complete: false } }));
    });
  }
  settleCall(id: string, actual?: number, usage?: ModelUsage, callNumber?:number) {
    return this.store.transaction(() => {
      const run = this.store.get<Run>('run', id);
      if (callNumber !== undefined && (!Number.isSafeInteger(callNumber) || callNumber < 1 || callNumber > run.calls)) throw new AppError(409, '用量回执与请求序号不匹配');
      const row = callNumber === undefined
        ? this.store.db.prepare("SELECT body FROM entities WHERE kind='model_request' AND json_extract(body,'$.runId')=? AND json_extract(body,'$.state')='reserved' ORDER BY json_extract(body,'$.callNumber') LIMIT 1").get(id)
        : this.store.db.prepare("SELECT body FROM entities WHERE kind='model_request' AND id=?").get(`${id}:${callNumber}`);
      const receipt = row ? JSON.parse(String(row.body)) as ModelRequestReceipt : undefined;
      if (receipt && receipt.schemaVersion !== 1) throw new AppError(409, '请求记录版本不受支持，保留原文');
      if (receipt && receipt.state !== 'reserved') return run;
      if (!receipt && callNumber === undefined && this.store.db.prepare("SELECT 1 FROM entities WHERE kind='model_request' AND json_extract(body,'$.runId')=? LIMIT 1").get(id)) return run;
      // Pre-ledger runs remain readable; never invent historical per-request usage.
      if (!receipt) return this.settleLegacyCall(id, actual, usage, callNumber);
      const cost = actual !== undefined && Number.isFinite(actual) && actual >= 0 ? actual : undefined;
      const validUsage = usage && ['input','output','cacheRead','cacheWrite','totalTokens'].every(k => Number.isSafeInteger(usage[k as keyof ModelUsage]) && Number(usage[k as keyof ModelUsage]) >= 0) && typeof usage.complete === 'boolean' ? usage : undefined;
      this.settleLegacyCall(id, cost, validUsage, receipt.callNumber);
      const subscription = run.policy.modelBinding?.kind === 'chatgpt';
      if (!subscription) {
        const current = this.store.get<Run>('run', id);
        const settled = (current.modelCallsSettled ?? 0) + 1;
        const reported = (current.modelCallsReported ?? 0) + (validUsage?.complete ? 1 : 0);
        const previous = current.usage;
        this.store.update<Run>('run', id, current.revision, { modelCallsSettled: settled, modelCallsReported: reported, usage: {
          input: (previous?.input ?? 0) + (validUsage?.input ?? 0), output: (previous?.output ?? 0) + (validUsage?.output ?? 0), cacheRead: (previous?.cacheRead ?? 0) + (validUsage?.cacheRead ?? 0), cacheWrite: (previous?.cacheWrite ?? 0) + (validUsage?.cacheWrite ?? 0), totalTokens: (previous?.totalTokens ?? 0) + (validUsage?.totalTokens ?? 0), complete: settled === current.calls && reported === current.calls
        } });
      }
      const next = this.store.update<ModelRequestReceipt>('model_request', receipt.id, receipt.revision, { state: validUsage?.complete && (subscription || cost !== undefined) ? 'settled' : 'unknown', costUsd: subscription ? undefined : cost, usage: validUsage, settledAt: new Date().toISOString() });
      this.store.event('model.request.settled', { id: next.id, callNumber: next.callNumber, purpose: next.purpose, state: next.state }, { runId: id, projectId: run.projectId });
      return this.store.get<Run>('run', id);
    });
  }
  private settleLegacyCall(id: string, actual?: number, usage?: ModelUsage, callNumber?:number) {
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
