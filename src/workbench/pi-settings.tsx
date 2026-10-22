import React, { useEffect, useRef, useState } from 'react';
import { requestedThinkingLevel, thinkingLevels, type PiExecutionSettingsSnapshot, type PiSettingsImport, type PiSettingsPreview, type PiThinkingLevel, type ModelRequestReceipt, type TaskBudgetSnapshot } from '../../shared/pi-runtime';
import { ApiError, request } from './client';
import type { Run } from '../../shared/contracts';
import { ToolExecutionDetails } from './tool-executions';

export const thinkingLabels: Record<PiThinkingLevel, string> = { off: '关闭', minimal: '最少', low: '低', medium: '中等', high: '高', xhigh: '很高', max: '最高' };
export function PiExecutionSettings() {
  const [data, setData] = useState<PiExecutionSettingsSnapshot>();
  const [selected, setSelected] = useState<PiThinkingLevel>('medium');
  const [executionMode, setExecutionMode] = useState<'standard' | 'long'>('standard');
  const [idleSeconds, setIdleSeconds] = useState(180);
  const [waitSeconds,setWaitSeconds]=useState(300);
  const [maxOutputTokens,setMaxOutputTokens]=useState(2048);
  const [apiModel,setApiModel]=useState('');
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const receive = (next: PiExecutionSettingsSnapshot) => { setData(next); setSelected(next.model?.effectiveThinkingLevel ?? next.configuration.thinkingLevel); setExecutionMode(next.configuration.executionMode); setIdleSeconds(next.configuration.networkIdleTimeoutMs / 1000);setWaitSeconds(next.configuration.userWaitTimeoutMs/1000);setMaxOutputTokens(next.configuration.maxOutputTokens);setApiModel(next.configuration.apiModel||next.model?.id||''); };
  const reload = async () => { setBusy(true); try { receive(await request('/pi/settings')); setMessage('已读取当前设置'); } catch (error) { setMessage(String(error)); } finally { setBusy(false); } };
  useEffect(() => { let active = true; void request<PiExecutionSettingsSnapshot>('/pi/settings').then(next => { if (active) receive(next); }).catch(error => { if (active) setMessage(String(error)); }); return () => { active = false; }; }, []);
  const save = async () => {
    if (!data || busy) return; setBusy(true); setMessage('');
    try { receive(await request('/pi/settings', { revision: data.configuration.revision, thinkingLevel: selected, executionMode, networkIdleTimeoutMs: idleSeconds * 1000,userWaitTimeoutMs:waitSeconds*1000,...(data.authKind==='chatgpt'?{}:{maxOutputTokens,apiModel}) }, 'PUT')); setMessage('已保存，将用于之后提交的新任务'); }
    catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  };
  return <fieldset aria-label="Pi运行设置"><legend>Agent 运行设置</legend>
    <p className="wb-caption">当前模型：{data?.model ? `${data.model.provider} / ${data.model.id}` : '未选择兼容模型'}</p>
    {(data?.configuration.importedSkillPaths?.length || data?.configuration.importedPromptPaths?.length) ? <p className="wb-caption">已登记本地技能 {data.configuration.importedSkillPaths?.length ?? 0} 个、模板 {data.configuration.importedPromptPaths?.length ?? 0} 个。之后的新任务会加载这些文件。</p> : null}
    {data?.authKind==='api'&&!!data.availableModels?.length&&<label>API 模型 <select aria-label="API 模型" value={apiModel} disabled={busy||!data} onChange={event=>{ const id=event.target.value; setApiModel(id); const level=data.model&&data.configuration.modelThinkingLevels?.[`${data.model.provider}/${id}`]; if(level)setSelected(level); }}>{data.availableModels.map(model=><option key={model.id} value={model.id}>{model.id}{model.supportsImages?' · 支持图片':''}</option>)}</select></label>}
    {data?.authKind==='api'&&<p className="wb-caption">仅列出固定 Pi 已兼容的模型{data.configuration.enabledModelPatterns?.length?'，并按已导入的模型名单收窄':''}。保存后只影响之后新任务；已有任务与重试保留原模型。订阅模型请在 ChatGPT 连接里选择。</p>}
    <label>思考强度 <select aria-label="思考强度" value={selected} disabled={busy || !data} onChange={event => setSelected(event.target.value as PiThinkingLevel)}>
      {(data?.model?.supportedThinkingLevels ?? [...thinkingLevels]).map(level => <option key={level} value={level}>{thinkingLabels[level]}</option>)}
    </select></label>
    <label>执行时长 <select aria-label="执行时长" value={executionMode} disabled={busy || !data} onChange={event => setExecutionMode(event.target.value as 'standard' | 'long')}><option value="standard">普通任务（沿用连接时限）</option><option value="long">长任务（最多30分钟）</option></select></label>
    <p className="wb-caption">长任务只延长新任务的运行时间，仍受原请求次数与费用额度限制。保存后生效，已有任务和重试保持原时限。</p>
    <label>模型无响应上限（秒） <input aria-label="模型无响应上限（秒）" type="number" min="10" max="1800" step="1" value={idleSeconds} disabled={busy || !data} onChange={event => setIdleSeconds(Number(event.target.value))}/></label>
    <p className="wb-caption">默认180秒。模型持续返回内容时重新计时；这与任务总时限分开，较慢模型可调高。</p>
    <label>用户答复等待上限（秒） <input aria-label="用户答复等待上限（秒）" type="number" min="1" max="86400" step="1" value={waitSeconds} disabled={busy||!data} onChange={event=>setWaitSeconds(Number(event.target.value))}/></label>
    <p className="wb-caption">默认300秒，每个插件问题单独计时；插件可提前结束等待。到期不会自动同意。任务总时限仍继续计时，先到的期限生效；已有任务及重试保留原设置。</p>
    {data?.authKind!=='chatgpt'&&<><label>单次输出上限（tokens） <input aria-label="单次输出上限（tokens）" type="number" min="16" max="200000" step="1" value={maxOutputTokens} disabled={busy||!data} onChange={event=>setMaxOutputTokens(Number(event.target.value))}/></label>
    <p className="wb-caption">仅影响之后新提交的 API 任务；已有任务与重试保留原上限。订阅连接不显示此字段，避免把 API 限制照搬到订阅。</p></>}
    <p className="wb-caption">初始默认中等档位，按模型支持情况调整。较高档位通常需要更多时间和用量；已提交的任务与重试保留原设置。</p>
    {data?.model && requestedThinkingLevel(data.configuration, data.model.provider, data.model.id) !== data.model.effectiveThinkingLevel && <p className="wb-inline-error">当前模型不支持已保存的{thinkingLabels[requestedThinkingLevel(data.configuration, data.model.provider, data.model.id)]}档位，实际使用{thinkingLabels[data.model.effectiveThinkingLevel]}。</p>}
    <div className="wb-plugin-actions"><button disabled={busy || !data} onClick={()=>void save()}>保存运行设置</button><button disabled={busy} onClick={()=>void reload()}>重新读取</button></div>
    {message && <p role="status">{message}</p>}
    <PiSettingsFilePreview revision={data?.configuration.revision} onImported={receive}/>
  </fieldset>;
}

function PiSettingsFilePreview({ revision, onImported }: { revision?: number; onImported: (snapshot: PiExecutionSettingsSnapshot) => void }) {
  const [path, setPath] = useState('');
  const [preview, setPreview] = useState<PiSettingsPreview>();
  const [imported, setImported] = useState<PiSettingsImport>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const load = async () => {
    setBusy(true); setMessage(''); setImported(undefined);
    try { setPreview(await request<PiSettingsPreview>('/pi/settings/preview', { path })); }
    catch (error) { setPreview(undefined); setMessage(String(error)); }
    finally { setBusy(false); }
  };
  const apply = async () => {
    if (revision === undefined) return;
    setBusy(true); setMessage('');
    try {
      const next = await request<PiSettingsImport>('/pi/settings/import', { path, revision });
      setImported(next); onImported(next.snapshot);
    } catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  };
  return <div>
    <p className="wb-caption">预览一份原版 settings.json。确认后写入思考档位、同提供商且受支持的模型、按模型档位、匹配的模型名单，以及已经存在的本地技能和模板文件（技能目录会登记其中的子目录）。不修改原文件，不读取 auth.json，不安装或执行扩展和包。</p>
    <label>原版设置路径 <input aria-label="原版设置路径" value={path} disabled={busy} onChange={event => setPath(event.target.value)}/></label>
    <div className="wb-plugin-actions"><button disabled={busy || !path.trim()} onClick={() => void load()}>预览原版设置</button><button disabled={busy || !preview || revision === undefined} onClick={() => void apply()}>导入可保存项</button></div>
    {preview && <div aria-label="原版设置预览">
      <p className="wb-caption">{preview.kind === 'project' ? '项目 .pi 设置' : '用户代理目录设置'} · 未应用</p>
      {preview.notes.map(note => <p key={note} className="wb-caption">{note}</p>)}
      {preview.sessionDir && <p className="wb-caption">sessionDir：{preview.sessionDir}</p>}
      {(preview.defaultProvider || preview.defaultModel) && <p className="wb-caption">原版默认模型：{[preview.defaultProvider, preview.defaultModel].filter(Boolean).join(' / ')}</p>}
      {preview.defaultProjectTrust && <p className="wb-caption">defaultProjectTrust：{preview.defaultProjectTrust}</p>}
      {!!Object.keys(preview.modelThinkingLevels).length && <p className="wb-caption">按模型思考档位：{Object.entries(preview.modelThinkingLevels).slice(0, 8).map(([key, level]) => `${key} ${level}`).join('、')}</p>}
      {!!preview.enabledModelPatterns.length && <p className="wb-caption">enabledModels：{preview.enabledModelPatterns.slice(0, 8).join('、')}</p>}
      {!!preview.defaultTools.length && <p className="wb-caption">defaultTools：{preview.defaultTools.join('、')}</p>}
      {preview.packageCount > 0 && <p className="wb-caption">包来源：{preview.packageCount} 个，地址不回显</p>}
      {!!preview.skills.length && <p className="wb-caption">skills：{preview.skills.join('、')}</p>}
      {!!preview.prompts.length && <p className="wb-caption">prompts：{preview.prompts.join('、')}</p>}
      {!!preview.extensions.length && <p className="wb-caption">extensions：{preview.extensions.join('、')}</p>}
      {!!preview.contextFiles.length && <p className="wb-caption">上下文文件：{preview.contextFiles.join('、')}</p>}
      {!!preview.resourceDirectories.length && <p className="wb-caption">资源目录：{preview.resourceDirectories.join('、')}</p>}
    </div>}
    {imported && <div aria-label="原版设置导入结果">
      <p className="wb-caption">{imported.appliedThinkingLevel || imported.appliedModel || Object.keys(preview?.modelThinkingLevels ?? {}).length || preview?.enabledModelPatterns.length ? `已写入之后的新任务${imported.appliedThinkingLevel ? ` · 思考 ${imported.appliedThinkingLevel}` : ''}${imported.appliedModel ? ` · 模型 ${imported.appliedModel}` : ''}` : '没有可写入的思考档位、模型或模型名单。'}</p>
      {imported.refused.map(item => <p key={item} className="wb-caption">{item}</p>)}
      {(imported.snapshot.configuration.importedSkillPaths?.length || imported.snapshot.configuration.importedPromptPaths?.length) ? <p className="wb-caption">已登记本地技能 {imported.snapshot.configuration.importedSkillPaths?.length ?? 0} 个、模板 {imported.snapshot.configuration.importedPromptPaths?.length ?? 0} 个。之后的新任务会加载这些文件。</p> : null}
    </div>}
    {message && <p role="status">{message}</p>}
  </div>;
}

export function PiRunSettings({ run }: { run: Run }) {
  if (run.mode !== 'pi') return null;
  const profile = run.policy.piRuntime;
  return <>
    <small className="wb-caption" data-chat-run-frozen>
      本次冻结：{run.policy.modelBinding ? `${run.policy.modelBinding.kind === 'chatgpt' ? 'ChatGPT' : 'API'} · ${run.policy.modelBinding.model}` : '模型未记录'}
      {' · '}
      思考 {thinkingLabels[profile?.thinkingLevel ?? 'off']}
      {!profile && '（旧任务设置）'}
      {profile && profile.requestedThinkingLevel !== profile.thinkingLevel && ` · 原选择${thinkingLabels[profile.requestedThinkingLevel]}，按模型能力调整`}
      {run.policy.piRuntime?.executionMode === 'long' ? ' · 长任务时限' : ''}
    </small>
    <RunTimeStatus run={run}/>
    {run.compaction && <small role="status">上下文压缩：{{ running: '进行中', completed: '已完成', cancelled: '已取消', failed: '失败，历史保留' }[run.compaction.phase]} · {{ manual: '手动', threshold: '接近上下文上限', overflow: '上下文溢出恢复' }[run.compaction.reason]}</small>}
    <ToolExecutionDetails run={run}/>
    <PiRequestDetails run={run}/>
    <ManualCompaction run={run}/>
    <PlainRetry run={run}/>
    <TaskBudgetDetails run={run}/>
  </>;
}

function PlainRetry({ run }: { run: Run }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const command = useRef<string | undefined>(undefined);
  if (!['failed', 'cancelled', 'interrupted'].includes(run.status)) return null;
  if (run.status === 'interrupted' && !run.error?.includes('已对账')) {
    return <p className="wb-caption" data-chat-recovery-hint>中断恢复：请先在「本轮工具过程」完成核对，再使用额度恢复或普通重试。</p>;
  }
  const retry = async () => {
    if (busy) return;
    command.current ??= crypto.randomUUID();
    setBusy(true);
    setMessage('');
    try {
      await request(`/runs/${encodeURIComponent(run.id)}/retry`, { commandId: command.current });
      setMessage('已提交普通重试（不追加额度），可在执行列表查看新尝试。');
    } catch (error) {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) command.current = undefined;
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  };
  return <div className="wb-chat-recovery" data-chat-plain-retry>
    <button type="button" className="wb-chat-hit" disabled={busy} onClick={() => void retry()}>
      {busy ? '重试提交中…' : '普通重试（不追加额度）'}
    </button>
    {message && <p role="status">{message}</p>}
  </div>;
}

function RunTimeStatus({run}: {run: Run}) {
  const [now,setNow] = useState(Date.now);
  useEffect(()=>{
    setNow(Date.now());
    if(run.status !== 'running' && run.status !== 'waiting_interaction') return;
    const timer=setInterval(()=>setNow(Date.now()),1000);
    return ()=>clearInterval(timer);
  },[run.id,run.status]);
  const seconds=(milliseconds:number)=>Math.max(0,Math.ceil(milliseconds/1000));
  const duration=(milliseconds:number)=>{const total=seconds(milliseconds);return `${Math.floor(total/60)}分${total%60}秒`;};
  const elapsed=run.startedAt ? Math.max(0,(run.endedAt ? Date.parse(run.endedAt) : now)-Date.parse(run.startedAt)) : 0;
  return <small className="wb-caption" aria-label="执行时间">
    本次上限 {duration(run.policy.timeoutMs)}
    {run.timedOutAt ? ' · 已到期，检查历史后可恢复' : run.status==='cancelled' ? ' · 已主动停止' : (run.status==='running'||run.status==='waiting_interaction') && run.startedAt ? ` · 剩余约 ${duration(run.policy.timeoutMs-elapsed)}（以服务端为准）${run.status==='waiting_interaction'?' · 等待用户答复中':''}` : run.startedAt ? ` · 已用 ${duration(elapsed)}` : ' · 尚未开始计时'}
    {run.policy.piRuntime?.networkIdleTimeoutMs && ` · 模型无响应上限 ${duration(run.policy.piRuntime.networkIdleTimeoutMs)}`}
    {run.policy.piRuntime?.userWaitTimeoutMs && ` · 每题等待上限 ${duration(run.policy.piRuntime.userWaitTimeoutMs)}`}
    {run.retryState && ` · ${run.retryState.source==='compaction'?'压缩':run.retryState.source==='branch_summary'?'分支摘要':'自动'}重试 ${run.retryState.attempt}/${run.retryState.maxAttempts}：${run.retryState.phase === 'waiting' ? (run.status === 'running'||run.status==='waiting_interaction') ? `退避${run.retryState.delayMs/1000}秒` : '等待已结束' : run.retryState.phase === 'retrying' ? (run.status==='running'||run.status==='waiting_interaction')?'正在请求':'请求已结束' : run.retryState.phase === 'finished' ? '尝试结束' : run.retryState.phase === 'succeeded' ? '已恢复' : run.status==='cancelled' ? '已停止' : '未恢复'}`}
  </small>;
}

function PiRequestDetails({ run }: { run: Run }) {
  const [page, setPage] = useState<{ items: ModelRequestReceipt[]; nextAfter?: number; calls: number }>();
  const [open,setOpen]=useState(false);const generation=useRef(0);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const read = async (after = 0) => {
    const current=++generation.current;setBusy(true); setError('');
    try { const next=await request<{ items: ModelRequestReceipt[]; nextAfter?: number; calls: number }>(`/runs/${encodeURIComponent(run.id)}/model-requests?after=${after}`);if(current===generation.current)setPage(next); }
    catch (e) { if(current===generation.current)setError(String(e)); } finally { if(current===generation.current)setBusy(false); }
  };
  useEffect(()=>{if(open)void read();return()=>{generation.current++;};},[open,run.id,run.calls,run.modelCallsSettled,run.status]);
  const purposes = { agent: '回答 / 工具轮次', compaction: '上下文压缩', branch_summary: '分支摘要' };
  return <details className="wb-plugin-run-details" data-workbench-interactive onToggle={event => { if(event.target===event.currentTarget)setOpen(event.currentTarget.open); }}>
    <summary>模型请求 · {run.calls} 次</summary>
    <p>已报告用量：{run.usage?.totalTokens ?? 0} tokens{!run.usage?.complete && '（用量不完整）'}。{run.policy.modelBinding?.kind === 'chatgpt' ? '订阅请求不折算为 API 费用。' : `已核算 $${run.spentUsd.toFixed(4)}，未结算预留 $${run.reservedUsd.toFixed(4)}。`}</p>
    <button disabled={busy} onClick={() => void read()}>刷新请求记录</button>
    {error && <p role="alert">{error}</p>}
    {page && !page.items.length && <p>{page.calls ? '这部分历史没有逐次记录，不能据此判断用量为零。' : '尚无模型请求。'}</p>}
    <ol>{page?.items.map(item => <li key={item.id}>第 {item.callNumber} 次 · {purposes[item.purpose]} · {item.state === 'settled' ? '已结算' : item.state === 'unknown' ? '回执不完整' : '尚无结算回执'}<br/>{item.usage ? `${item.usage.totalTokens} tokens${item.usage.complete ? '' : '（不完整）'}` : '用量未知'}{run.policy.modelBinding?.kind !== 'chatgpt' && (item.costUsd !== undefined ? ` · 实际 $${item.costUsd.toFixed(4)}` : ` · 预留 $${item.reservedUsd.toFixed(4)}，实际费用未知`)}</li>)}</ol>
    {page?.nextAfter !== undefined && <button disabled={busy} onClick={() => void read(page.nextAfter)}>下一页请求</button>}
  </details>;
}

function TaskBudgetDetails({ run }: { run: Run }) {
  const [budget, setBudget] = useState<TaskBudgetSnapshot>();
  const [calls, setCalls] = useState(1); const [costUsd, setCostUsd] = useState(0); const [reason, setReason] = useState('继续完成原任务');
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [accepted, setAccepted] = useState(false);
  const pending = useRef<{ commandId: string; calls: number; costUsd: number; reason: string } | undefined>(undefined);
  const subscription = run.policy.modelBinding?.kind === 'chatgpt';
  const read = async () => { setBusy(true); try { setBudget(await request(`/runs/${encodeURIComponent(run.id)}/budget`)); } catch(e) { setMessage(String(e)); } finally { setBusy(false); } };
  const resume = async () => {
    if (busy || accepted) return;
    pending.current ??= {commandId:crypto.randomUUID(), calls, costUsd: subscription ? 0 : costUsd, reason};
    setBusy(true); setMessage('');
    try {
      await request(`/runs/${encodeURIComponent(run.id)}/extend-retry`, pending.current);
      setAccepted(true); setMessage('追加授权已记录，原任务已加入恢复队列。');
      setBudget(await request(`/runs/${encodeURIComponent(run.id)}/budget`));
    } catch(e) { if (e instanceof ApiError && e.status >= 400 && e.status < 500) pending.current = undefined; setMessage(String(e)); } finally { setBusy(false); }
  };
  return <details onToggle={event => { if (event.currentTarget.open && !budget && !busy) void read(); }}>
    <summary>追加额度后恢复</summary>
    <p>这里累计同一任务的所有尝试。未知费用仍占用预留额度；追加不会修改旧执行记录，也不会提高连接总额度。</p>
    {budget && <><p>请求：已用 {budget.usedCalls} / {budget.maxCalls} 次，剩余 {budget.remainingCalls} 次。{!subscription && ` 费用含预留：$${budget.accountedUsd.toFixed(4)} / $${budget.maxCostUsd.toFixed(4)}，剩余 $${budget.remainingUsd.toFixed(4)}。`}</p>
      <ul>{budget.grants.map(g=><li key={g.id}>{g.addition.reason}：请求 {g.before.maxCalls} → {g.after.maxCalls}{!subscription && `；费用 $${g.before.maxCostUsd} → $${g.after.maxCostUsd}`}</li>)}</ul></>}
    <button disabled={busy} onClick={()=>void read()}>刷新任务额度</button>
    {budget?.latestRunId === run.id && ['failed','cancelled','interrupted'].includes(run.status) && <fieldset disabled={busy || accepted || Boolean(pending.current)}>
      <legend>追加授权后恢复原任务</legend>
      <label>追加请求次数 <input type="number" min="0" max="10000" step="1" value={calls} onChange={e=>setCalls(Number(e.target.value))}/></label>
      {!subscription && <label>追加费用上限（美元） <input type="number" min="0" max="100000" step="0.01" value={costUsd} onChange={e=>setCostUsd(Number(e.target.value))}/></label>}
      <label>追加原因 <input value={reason} maxLength={500} onChange={e=>setReason(e.target.value)}/></label>
      <p>新尝试沿用原模型与每次执行时限；未确认的操作必须先对账。</p>
    </fieldset>}
    {budget?.latestRunId === run.id && ['failed','cancelled','interrupted'].includes(run.status) && <button disabled={busy || accepted || (!pending.current && (!reason.trim() || calls < 0 || costUsd < 0 || (calls === 0 && (subscription || costUsd === 0))))} onClick={()=>void resume()}>{pending.current ? '重发同一追加请求' : '确认追加并恢复'}</button>}
    {message && <p role="status">{message}</p>}
  </details>;
}

function ManualCompaction({ run }: { run: Run }) {
  const command = useRef<string | undefined>(undefined);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [accepted, setAccepted] = useState(false);
  const [focus, setFocus] = useState('');
  if (!run.sessionId || !run.sessionPath || !['completed','failed','cancelled'].includes(run.status)) return null;
  const compact = async () => {
    if (busy || accepted) return;
    command.current ??= crypto.randomUUID(); setBusy(true); setMessage('');
    try {
      const compactionFocus = focus.trim() || undefined;
      await request('/tasks', { projectId: run.projectId, conversationId: run.conversationId, goal: '手动压缩当前话题的上下文，保留原历史', commandId: command.current, mode: 'pi', continueFromRunId: run.id, sessionAction: 'compact', ...(compactionFocus ? { compactionFocus } : {}) });
      setAccepted(true); setMessage('压缩任务已加入队列，可在任务状态中停止。');
    } catch (error) { setMessage(String(error)); } finally { setBusy(false); }
  };
  return <div>
    <p>手动压缩会使用模型请求额度，并创建可继续的新会话副本，原历史保留。</p>
    <label>摘要重点（可选） <textarea aria-label="摘要重点" rows={3} maxLength={2000} value={focus} disabled={busy || accepted} onChange={event => setFocus(event.target.value)} placeholder="例如：保留文件路径与未完成步骤" /></label>
    <p className="wb-caption">会随摘要请求一并发送；宿主仍会附加记忆守卫。留空则只用默认压缩说明。</p>
    <button type="button" className="wb-chat-hit" data-chat-compact-run disabled={busy || accepted} onClick={() => void compact()}>压缩上下文</button>
    {message && <p role="status">{message}</p>}
  </div>;
}
