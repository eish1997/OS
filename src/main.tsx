import { ResearchPanel } from './research-panel';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BackupPanel } from './backup-panel';
import type { Asset, Draft, Memory, Project, ProjectSummary, ConversationPage, Run, Snapshot, WorkbenchEvent } from '../shared/contracts';
import { ProjectSummaryEditor } from './project-summary';
import { DraftWorkspace, type DraftWorkspaceHandle } from './draft-workspace';
import type { PreparedDraft } from './draft-editor';
import { AssetReader, readableAsset } from './document-reader';
import { AssetList, AssetMetadataEditor } from './asset-browser';
import { savedProjectViews, type ProjectSection, type ProjectViews } from './view-state';
import { StoragePanel } from './storage-panel';
import { SessionsPanel } from './sessions-panel';
import { ChatGPTPanel } from './chatgpt-panel';
import { connectionRead, ConnectionUnauthorized } from './connection-read';
import './style.css';
const status: Record<string, string> = { queued: '排队中', running: '执行中', waiting_node: '等待电脑上线', waiting_user: '等待配置', completed: '执行结束', failed: '失败', cancelled: '已取消', interrupted: '中断 · 待对账' };
async function api<T>(path: string, data?: unknown, method = 'POST'): Promise<T> {
  const response = await fetch('/api' + path, data === undefined ? undefined : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const value = await response.json(); if (!response.ok) throw new Error(value.error || '操作失败'); return value;
}
const time = (v: string) => new Date(v).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
function App() {
  const [authenticated, setAuthenticated] = useState<boolean>(); const [password, setPassword] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [savedView] = useState<{ selected: string; tabs: string[] }>(() => {
    try { const value = JSON.parse(localStorage.getItem('wb-project-tabs') || '{}'); if (typeof value.selected === 'string' && Array.isArray(value.tabs) && value.tabs.every((t: unknown) => typeof t === 'string')) return value; } catch {}
    return { selected: '', tabs: [] };
  });
  const [snapshot, setSnapshot] = useState<Snapshot>(); const [selected, setSelected] = useState(savedView.selected); const [tabs, setTabs] = useState<string[]>(savedView.tabs);
  useEffect(() => { try { localStorage.setItem('wb-project-tabs', JSON.stringify({ selected, tabs })); } catch {} }, [selected, tabs]);
  const [view, setView] = useState('projects'); const [projectViews, setProjectViews] = useState<ProjectViews>(savedProjectViews);
  const section = projectViews[selected]?.section ?? 'results';
  const setSection = (value: string) => setProjectViews(previous => ({ ...previous, [selected]: { section: value as ProjectSection, assetId: previous[selected]?.assetId, query: previous[selected]?.query ?? '' } }));
  useEffect(() => { try { localStorage.setItem('wb-project-views-v1', JSON.stringify(projectViews)); } catch {} }, [projectViews]);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [connected, setConnected] = useState(false);
  const draftWorkspace = useRef<DraftWorkspaceHandle>(null);
  const [draftSelections, setDraftSelections] = useState<Record<string, PreparedDraft | undefined>>({});
  const reportDraftSelection = useCallback((projectId: string, draft: PreparedDraft | undefined) => {
    setDraftSelections(previous => {
      const old = previous[projectId];
      return old?.id === draft?.id && old?.title === draft?.title && old?.revision === draft?.revision ? previous : { ...previous, [projectId]: draft };
    });
  }, []);
  const [composers, setComposers] = useState<Record<string, { input: string; mode: Run['mode'] }>>(() => {
    try { const value = JSON.parse(localStorage.getItem('wb-project-inputs') || '{}'); if (value && typeof value === 'object' && !Array.isArray(value)) return Object.fromEntries(Object.entries(value).filter(([, v]) => { const item = v as { input?: unknown; mode?: unknown }; return typeof item?.input === 'string' && ['pi', 'fixture', 'node'].includes(String(item.mode)); })) as Record<string, { input: string; mode: Run['mode'] }>; } catch {}
    return {};
  });
  const inputScope = selected || 'inbox'; const input = composers[inputScope]?.input ?? ''; const mode = composers[inputScope]?.mode ?? 'pi';
  const [newTopics,setNewTopics]=useState<Record<string,boolean>>({});
  const setInput = (value: string) => setComposers(previous => ({ ...previous, [inputScope]: { input: value, mode: previous[inputScope]?.mode ?? 'pi' } }));
  const setMode = (value: Run['mode']) => setComposers(previous => ({ ...previous, [inputScope]: { input: previous[inputScope]?.input ?? '', mode: value } }));
  useEffect(() => { try { localStorage.setItem('wb-project-inputs', JSON.stringify(composers)); } catch {} }, [composers]);
  const [events, setEvents] = useState<WorkbenchEvent[]>([]); const [history, setHistory] = useState<ConversationPage>(); const [historyError, setHistoryError] = useState('');
  const [newProject, setNewProject] = useState(false); const [name, setName] = useState(''); const [description, setDescription] = useState('');
  const [preview, setPreview] = useState<Asset>(); const [previewText, setPreviewText] = useState(''); const [search, setSearch] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false); const [previewError, setPreviewError] = useState('');
  const [showHistory, setShowHistory] = useState(false); const fileInput = useRef<HTMLInputElement>(null);
  const previewRequest = useRef(0); const historyProject = useRef(selected); historyProject.current = selected;
  const conversationVersion = events.filter(e => e.projectId === selected && ['task.accepted', 'assistant.text'].includes(e.type)).at(-1)?.sequence;
  useEffect(() => {
    if (!authenticated || !selected || !showHistory) { setHistory(undefined); return; }
    let cancelled = false; setHistoryError('');
    api<ConversationPage>(`/projects/${selected}/conversation`).then(value => { if (!cancelled) setHistory(value); }).catch(e => { if (!cancelled) setHistoryError(e.message); });
    return () => { cancelled = true; };
  }, [authenticated, selected, showHistory, conversationVersion]);
  async function olderMessages() { if (!history?.olderThan) return; const projectId = selected; try { const page = await api<ConversationPage>(`/projects/${projectId}/conversation?before=${history.olderThan}`); if (historyProject.current === projectId) setHistory(current => ({ messages: [...page.messages, ...(current?.messages ?? [])].filter((m, i, list) => list.findIndex(v => v.id === m.id) === i), olderThan: page.olderThan })); } catch (e) { if (historyProject.current === projectId) setHistoryError(e instanceof Error ? e.message : '读取失败'); } }
  const [composerExpanded, setComposerExpanded] = useState(true);
  useEffect(() => { if (section === 'research') { setComposerExpanded(false); return; } if (window.matchMedia('(max-width:800px)').matches) setComposerExpanded(!['drafts', 'summary'].includes(section) && !projectViews[selected]?.assetId && !projectViews[selected]?.query.trim()); }, [section, selected, projectViews[selected]?.assetId, projectViews[selected]?.query]);
  const refresh = useCallback(async () => { const s = await api<Snapshot>('/snapshot'); setSnapshot(previous => previous && previous.cursor > s.cursor ? previous : s); }, []);
  useEffect(() => {
    const controller=new AbortController();
    connectionRead<{loggedIn:boolean}>('/api/auth',{signal:controller.signal,onWaiting:()=>setConnectionError('工作台暂时不可用，正在自动重连。')}).then(value=>{setConnectionError('');setAuthenticated(value.loggedIn);}).catch(()=>{});
    return ()=>controller.abort();
  }, []);
  useEffect(() => {
    if (!authenticated) return;
    let source: EventSource | undefined; let cancelled = false;let checkingAuth=false;let refreshing=false;
    let reconnectTimer:ReturnType<typeof setTimeout>|undefined;let reconnectFailures=0;
    const controller=new AbortController();
    const waiting=()=>setConnectionError('连接暂时中断，正在自动恢复；已有内容和输入会保留。');
    const readSnapshot=()=>connectionRead<Snapshot>('/api/snapshot',{signal:controller.signal,onWaiting:waiting}).catch(error=>{if(!cancelled&&error instanceof ConnectionUnauthorized){setAuthenticated(false);setSnapshot(undefined);setConnectionError('');}throw error;});
    const openStream=(cursor:number)=>{
      if(cancelled)return;source?.close();
      source = new EventSource(`/api/events?after=${Math.max(0, cursor - 100)}`);
      source.onopen = () => {
        if(cancelled)return;reconnectFailures=0;setConnected(true);setConnectionError('');
        if(refreshing)return;refreshing=true;
        readSnapshot().then(value=>{if(!cancelled){setSnapshot(previous=>previous&&previous.cursor>value.cursor?previous:value);setConnectionError('');}}).catch(()=>{}).finally(()=>{refreshing=false;});
      };
      source.onerror = () => {
        if(cancelled)return;source?.close();setConnected(false);waiting();if(checkingAuth)return;checkingAuth=true;
        connectionRead<{loggedIn:boolean}>('/api/auth',{signal:controller.signal,onWaiting:waiting}).then(async value=>{
          if(cancelled)return;if(!value.loggedIn){setAuthenticated(false);setSnapshot(undefined);setConnectionError('');return;}
          const current=await readSnapshot();if(cancelled)return;
          setSnapshot(previous=>previous&&previous.cursor>current.cursor?previous:current);
          const delay=[1000,2000,5000][Math.min(reconnectFailures++,2)];
          reconnectTimer=setTimeout(()=>openStream(current.cursor),delay);
        }).catch(()=>{}).finally(()=>{checkingAuth=false;});
      };
      source.onmessage = event => { const value: WorkbenchEvent = JSON.parse(event.data); setEvents(previous => previous.some(e => e.eventId === value.eventId) ? previous : [...previous.slice(-199), value]); refresh().catch(e => setError(e.message)); };
    };
    readSnapshot().then(current => {
      if (cancelled) return; setSnapshot(previous=>previous&&previous.cursor>current.cursor?previous:current);setConnectionError('');
      openStream(current.cursor);
    }).catch(()=>{});
    return () => { cancelled = true; controller.abort();if(reconnectTimer)clearTimeout(reconnectTimer);source?.close();setConnected(false); };
  }, [authenticated, refresh]);
  async function act(fn: () => Promise<unknown>) { setError(''); setBusy(true); try { await fn(); if (authenticated) await refresh(); } catch (e) { setError(e instanceof Error ? e.message : '操作失败'); } finally { setBusy(false); } }
  function open(projectId: string) { if (projectId !== selected) { previewRequest.current++; setPreview(undefined); setPreviewText(''); setHistory(undefined); } setSelected(projectId); setTabs(previous => previous.includes(projectId) ? previous : [...previous, projectId]); setView('projects'); }
  const project = snapshot?.projects.find(p => p.id === selected);
  const runs = snapshot?.runs.filter(r => r.projectId === selected) || [];
  const assets = snapshot?.assets.filter(a => a.projectId === selected) || [];
  const drafts = snapshot?.drafts.filter(d => d.projectId === selected) || [];
  const activeRuns = snapshot?.runs.filter(r => ['running', 'queued', 'waiting_node', 'waiting_user'].includes(r.status)) || [];
  const desiredAssetId = projectViews[selected]?.assetId; const desiredAsset = assets.find(a => a.id === desiredAssetId);
  useEffect(() => {
    const request = ++previewRequest.current; setPreview(desiredAsset); setPreviewText(''); setPreviewError(''); setPreviewLoading(false);
    if (!authenticated || !snapshot || !desiredAsset) {
      if (authenticated && snapshot && desiredAssetId) setProjectViews(previous => ({ ...previous, [selected]: { ...previous[selected], assetId: undefined } })); return;
    }
    const abort = new AbortController();
    if (readableAsset(desiredAsset)) {
      setPreviewLoading(true);
      fetch(`/api/assets/${desiredAsset.id}`, { signal: abort.signal }).then(async response => {
        if (!response.ok) throw new Error('读取失败，请核对文件完整性');
        const content = await response.text(); if (previewRequest.current === request) setPreviewText(content);
      }).catch(e => { if (!abort.signal.aborted && previewRequest.current === request) setPreviewError(e.message); })
        .finally(() => { if (previewRequest.current === request) setPreviewLoading(false); });
    }
    return () => { abort.abort(); previewRequest.current++; };
  }, [authenticated, Boolean(snapshot), selected, desiredAssetId, desiredAsset?.revision]);
  async function upload(file: File) {
    const boundProject = selected; if (!boundProject) throw new Error('请先选择项目');
    const item = await api<{ id: string }>('/uploads', { projectId: boundProject, name: file.name, mime: file.type });
    const response = await fetch(`/api/uploads/${item.id}`, { method: 'PUT', body: file }); const result = await response.json(); if (!response.ok) throw new Error(result.error);
  }
  function send() {
    const boundProject = selected; const goal = input;
    if (!goal.trim() || busy) return;
    const workspace = draftWorkspace.current;
    const boundDraft = section === 'drafts' ? workspace?.selection() : undefined;
    act(async () => {
      if (boundProject) {
        const prepared = boundDraft ? await workspace!.prepare(boundDraft.id) : undefined;
        if (prepared && prepared.projectId !== boundProject) throw new Error('稿件所属项目已变化，指令保留，请重新发送');
        const node = snapshot?.nodes.find(n => !n.revoked && n.projectIds.includes(boundProject));
        await api('/tasks', { projectId: boundProject, goal, mode, continueFromRunId: mode === 'pi' && newTopics[inputScope] ? null : undefined, commandId: crypto.randomUUID(), assetIds: assets.map(a => a.id), nodeId: mode === 'node' ? node?.id : undefined, view: section, selectedAssetId: section === 'results' && preview?.projectId === boundProject ? preview.id : undefined, selectedDraftId: prepared?.id, selectedDraftRevision: prepared?.revision });
      }
      else await api('/inbox', { text: goal });
      setNewTopics(previous => ({ ...previous, [inputScope]: false }));
      setComposers(previous => previous[inputScope]?.input === goal ? { ...previous, [inputScope]: { ...previous[inputScope], input: '' } } : previous);
    });
  }
  if (authenticated === undefined) return <div className="loading"><div>[ .. ] 正在连接工作台{connectionError&&<p role="status">{connectionError}服务恢复后会自动继续连接。</p>}</div></div>;
  if (!authenticated) return <main className="login"><div className="login-brand mono">STUDIO / PERSONAL OS</div><h1>把想法，留在这里。</h1><p>项目、资料、成果与助手，共享一个工作现场。</p><form onSubmit={e => { e.preventDefault(); act(async () => { await api('/login', { password }); setPassword(''); setAuthenticated(true); }); }}><label htmlFor="password">工作台密码</label><input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required/><button className="primary" disabled={busy}>进入工作台 <span>↗</span></button></form><p className="muted small">首次使用：在本机 .env 中设置 WORKBENCH_PASSWORD，再启动服务。</p>{error && <div role="alert" className="error">{error}</div>}<div className="login-footer mono">[ PRIVATE WORKSPACE ]</div></main>;
  if (!snapshot) return <div className="loading"><div>读取项目…{connectionError&&<p role="status">{connectionError}</p>}{error}</div></div>;
  return <div className="shell">
    <header className="tabbar"><button className="wordmark mono" onClick={() => { setSelected(''); setView('projects'); }}>S<span className="brand-dot">·</span></button><button className={!selected && view === 'projects' ? 'tab active' : 'tab'} onClick={() => { setSelected(''); setView('projects'); }}>工作台</button>{tabs.map(id => { const p = snapshot.projects.find(p => p.id === id); return p && <div className={selected === id ? 'tab active' : 'tab'} key={id}><button onClick={() => open(id)}>{p.name}</button><button aria-label={`关闭 ${p.name} 标签`} onClick={() => { setTabs(t => t.filter(v => v !== id)); if (selected === id) setSelected(''); }}>×</button></div>; })}<div className="tabbar-end mono"><span className={connected ? 'live' : 'offline'}>●</span> {connected ? '已连接' : '重连中'}</div></header>
    <aside className="sidebar"><div className="sidebar-heading mono">YOUR STUDIO</div><nav>{[['projects', '▦', '项目'], ['inbox', '>_', '收件箱'], ['memory', '◇', '记忆'], ['settings', '⚙', '设置']].map(([id, icon, label]) => <button className={view === id ? 'nav-item selected' : 'nav-item'} key={id} onClick={() => { setView(id); if (id !== 'projects') setSelected(''); }}><span className="mono">{icon}</span>{label}{id === 'inbox' && <small>{snapshot.inbox.filter(i => i.status === 'new').length || ''}</small>}</button>)}</nav><div className="sidebar-projects"><div className="sidebar-heading mono">OPEN PROJECTS</div>{tabs.map(id => <button key={id} className="project-nav" onClick={() => open(id)}><span className="mono">└</span>{snapshot.projects.find(p => p.id === id)?.name}</button>)}</div><div className="sidebar-bottom"><span className="mono">[ {String(activeRuns.length).padStart(2, '0')} ]</span><span>项任务等待或执行</span><button onClick={() => act(async () => { await api('/logout', {}); setAuthenticated(false); })}>退出登录 ↗</button></div></aside>
    <main className="content">
      {connectionError && <div className="error" role="status">{connectionError}</div>}
      {error && <div className="error" role="alert">{error}<button aria-label="关闭错误" onClick={() => setError('')}>×</button></div>}
      {view === 'projects' && !project && <>
        <div className="eyebrow mono">WORKSPACE / OVERVIEW</div><div className="page-heading"><div><h1>你的工作室</h1><p>让想法成为项目，让过程留下成果。</p></div><button className="primary" onClick={() => setNewProject(true)}>＋ 新建项目</button></div>
        <div className="list-toolbar"><div className="mono">PROJECTS <span className="muted">/ {String(snapshot.projects.filter(p => !p.archived).length).padStart(2, '0')}</span></div><input aria-label="搜索项目" className="search" placeholder="搜索项目 /" value={search} onChange={e => setSearch(e.target.value)}/></div>
        <div className="project-grid">{snapshot.projects.filter(p => !p.archived && (p.name + p.description).includes(search)).map((p, i) => {
          const output = snapshot.assets.filter(a => a.projectId === p.id); const latest = output.at(-1); const run = snapshot.runs.filter(r => r.projectId === p.id).at(-1);
          return <button className="project-card" key={p.id} onClick={() => open(p.id)}><div className="card-preview">{latest?.mime.startsWith('image/') ? <img src={`/api/assets/${latest.id}`} alt={latest.name}/> : <><div className="preview-index mono">[{String(i + 1).padStart(2, '0')}]</div><div className="ascii-preview mono">{output.length ? `assets/\n├─ ${output[0].name}\n└─ ${output.length} 个真实资产` : `workspace/\n├─ 目标\n└─ 等待第一份成果`}</div><div className="preview-caption mono">{latest ? latest.runId ? 'REAL OUTPUT' : 'SOURCE FILE' : 'EMPTY WORKSPACE'}</div></>}</div><div className="card-details"><h2>{p.name}<span>↗</span></h2><p>{p.description || '从一句想法开始。'}</p><div className="card-meta"><span className={run?.status === 'running' ? 'running' : ''}>{run ? status[run.status] : '准备开始'}</span><span className="mono">{output.length} 资产</span></div></div></button>;
        })}<button className="project-card new-card" onClick={() => setNewProject(true)}><span className="mono">[ + ]</span><h2>下一个想法</h2><p>研究、实验，或一份新的作品。</p></button></div>
        <div className="overview-footer"><span className="mono">IDEA → EVIDENCE → OUTPUT</span><span>{snapshot.config.modelConfigured ? `模型已就绪 · ${snapshot.config.model}` : '模型尚未配置 · 可运行工程样例'}</span></div>
      </>}
      {view === 'projects' && project && <>
        <div className="eyebrow mono">PROJECT / {project.id.slice(0, 8)}</div><div className="page-heading"><div><h1>{project.name}</h1><p>{project.description || '目标、过程与成果，在同一个地方。'}</p></div><button onClick={() => fileInput.current?.click()}>↑ 上传资料</button><input ref={fileInput} type="file" hidden onChange={e => { const file = e.target.files?.[0]; if (file) act(() => upload(file)); e.target.value = ''; }}/></div>
        <div className="section-tabs">{[['research', '开源研究'], ['results', '成果'], ['summary', '项目摘要'], ['tasks', '任务与过程'], ['drafts', '内容草稿']].map(([id, label]) => <button className={section === id ? 'active' : ''} key={id} onClick={() => setSection(id)}>{label}<small>{id === 'research' ? snapshot.tasks.filter(t => t.projectId === selected && t.context.research).length : id === 'results' ? assets.length : id === 'tasks' ? runs.length : id === 'summary' ? snapshot.summaries.find(s => s.projectId === selected)?.revision ?? 0 : drafts.length}</small></button>)}</div>
        {section === 'research' && <ResearchPanel key={project.id} projectId={project.id} tasks={snapshot.tasks} runs={runs} assets={assets} modelReady={snapshot.config.modelConfigured} onSubmit={async (research, commandId) => { await api('/tasks', { projectId: project.id, research, commandId, mode: 'pi', assetIds: [], continueFromRunId: null }); await refresh(); }} onOpen={id => setProjectViews(previous => ({ ...previous, [project.id]: { section: 'results', assetId: id, query: '' } }))} onTasks={() => setSection('tasks')}/>}
        {section === 'results' && <div className="result-layout"><AssetList key={project.id} projectId={project.id} assets={assets} selectedId={preview?.id} query={projectViews[selected]?.query ?? ""} onQuery={query => setProjectViews(previous => ({ ...previous, [selected]: { section, assetId: previous[selected]?.assetId, query } }))} onSelect={asset => setProjectViews(previous => ({ ...previous, [selected]: { section, assetId: asset.id, query: previous[selected]?.query ?? "" } }))}/><div className="result-stage">{preview ? <><div className="stage-toolbar"><span>{preview.name}</span><a href={`/api/assets/${preview.id}`} download>下载 ↗</a><button onClick={() => act(async () => { await api(`/assets/${preview.id}`, { revision: preview.revision }, 'DELETE'); setPreview(undefined); })}>移至回收站</button></div><AssetMetadataEditor key={preview.id} asset={preview} onSave={async fields => { const next = await api<Asset>(`/assets/${preview.id}/metadata`, fields, "PATCH"); await refresh(); return next; }}/>{preview.mime.startsWith('image/') ? <img className="asset-image" src={`/api/assets/${preview.id}`} alt={preview.name}/> : <AssetReader key={`${preview.id}:${preview.version}`} asset={preview} text={previewText} loading={previewLoading} error={previewError}/>}<div className="hash mono">SHA256 {preview.hash.slice(0, 16)}… / v{preview.version}</div></> : <div className="empty-stage"><span className="mono">[ · ]</span><h2>{assets.length ? '选择一份成果' : '从目标，到第一份成果'}</h2><p>{assets.length ? '查看真实文件，继续编辑或整理成文章。' : '在下方告诉助手你想完成什么。资料和结果都会留在这里。'}</p>{!snapshot.config.modelConfigured && <button onClick={() => { setMode('fixture'); setInput('运行固定资料计算，保存报告、图表和文章草稿'); }}>运行工程样例 ↗</button>}</div>}</div></div>}
        {section === 'summary' && <ProjectSummaryEditor key={project.id} projectId={project.id} initialGoal={project.description} summary={snapshot.summaries.find(s => s.projectId === project.id)} assets={assets} onSave={async fields => { const next = await api<ProjectSummary>(`/projects/${project.id}/summary`, fields, 'PUT'); await refresh(); return next; }}/>}
        {section === 'tasks' && <div className="task-list">{runs.length ? [...runs].reverse().map(run => { const task = snapshot.tasks.find(t => t.id === run.taskId); return <article key={run.id} className="task"><div className="task-heading"><span className="mono">[{String(run.attempt).padStart(2, '0')}]</span><h2>{task?.goal}</h2><span className={run.status === 'running' ? 'running' : 'muted'}>{status[run.status]}</span></div><div className="task-meta mono">{time(run.createdAt)} / {run.mode === 'fixture' ? '确定性工程样例 · 不使用 AI' : run.mode === 'node' ? '电脑节点' : 'Pi Agent'} / 验收：{task?.acceptance}{run.continuation && ' / 已接续项目会话'}</div>{run.error && <p className="muted">{run.error}</p>}{snapshot.operations.filter(o => o.runId === run.id && o.state === 'unknown').map(o => <div key={o.id} className="error">{o.name}：结果待核实 <button onClick={() => { const evidence = window.prompt('确认已经执行：填写实际回执或成果核对依据'); if (evidence) act(() => api(`/operations/${o.id}/reconcile`, { revision: o.revision, performed: true, evidence })); }}>确认已执行</button><button onClick={() => { const evidence = window.prompt('确认尚未执行：填写核对依据'); if (evidence) act(() => api(`/operations/${o.id}/reconcile`, { revision: o.revision, performed: false, evidence })); }}>确认未执行</button></div>)}<div className="native-progress" aria-label="原生工具执行记录">{events.filter(e => e.runId === run.id && e.type === 'native.tool').slice(-8).map(e => { const item = e.data as { name: string; phase: string }; return <p key={e.eventId} className="muted small">{item.name} · {item.phase === 'started' ? '开始执行' : item.phase === 'completed' ? '执行结束' : '执行失败'}</p>; })}</div><div className="task-actions">{['queued', 'running', 'waiting_node', 'waiting_user'].includes(run.status) && <button onClick={() => act(() => api(`/runs/${run.id}/cancel`, {}))}>{run.cancelRequested ? '正在停止…' : '取消任务'}</button>}{['failed', 'cancelled', 'interrupted'].includes(run.status) && <button onClick={() => act(() => api(`/runs/${run.id}/retry`, { commandId: crypto.randomUUID() }))}>新建尝试</button>}{run.status === 'interrupted' && <button onClick={() => act(() => api(`/runs/${run.id}/reconcile`, {}))}>核对中断</button>}{run.status === 'completed' && <button onClick={() => { const note = window.prompt('验收依据：结果是否达到目标？'); if (note && task) act(() => api(`/tasks/${task.id}/acceptance`, { revision: task.revision, acceptance: 'passed', note })); }}>验收通过</button>}<span>{run.resultAssetIds.length} 个文件{run.resultDraftIds?.length ? ` · ${run.resultDraftIds.length} 篇稿件已更新` : ""}</span></div></article>; }) : <Empty label="还没有任务" detail="提交后，执行状态和过程会保存在这里。"/>}</div>}
        {section === 'drafts' && <DraftWorkspace key={project.id} workspaceRef={draftWorkspace} onSelection={reportDraftSelection} projectId={project.id} drafts={drafts} onSave={(id, value) => api<Draft>(`/drafts/${id}`, value, "PATCH")} onCreate={() => api<Draft>('/drafts', { projectId: project.id, title: '新的文章', body: '', sourceIds: assets.map(a => a.id) })} refresh={refresh} assets={assets} onOpenSource={id => setProjectViews(previous => ({ ...previous, [project.id]: { section: 'results', assetId: id, query: '' } }))}/>}
        <div className="project-footer mono">{project.id.slice(0, 8)} / {assets.length} ASSETS / {drafts.length} DRAFTS<button onClick={() => act(() => api('/projects/update', { id: project.id, revision: project.revision, archived: true }).then(() => setSelected('')))}>归档项目</button><button onClick={() => setProjectViews(previous => ({ ...previous, [selected]: { section: "results", query: "" } }))}>恢复默认视图</button></div>
      </>}
      {view === 'inbox' && <><div className="eyebrow mono">INBOX / IDEAS</div><div className="page-heading"><div><h1>先把想法留下来</h1><p>不必马上成为项目，链接、灵感和待办都可以。</p></div></div>{snapshot.inbox.length ? [...snapshot.inbox].reverse().map(item => <article key={item.id} className="inbox-item"><span className="mono muted">{time(item.createdAt)}</span><p>{item.text}</p>{item.status === 'new' ? <select aria-label="关联项目" value="" onChange={e => act(() => api('/inbox/link', { id: item.id, revision: item.revision, projectId: e.target.value }))}><option value="">关联到项目…</option>{snapshot.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select> : <button onClick={() => open(item.linkedProjectId!)}>打开关联项目 ↗</button>}</article>) : <Empty label="收件箱是空的" detail="在下方输入一句想法，稍后再整理。"/>}</>}
      {view === 'memory' && <MemoryView snapshot={snapshot} act={act}/>}
      {view === 'settings' && <Settings snapshot={snapshot} act={act} refresh={refresh}/>} 
    </main>
    <footer className={composerExpanded ? "composer" : "composer compact"}><div className="composer-scope mono"><span>&gt;_ {project ? project.name : '收件箱'}</span>{project && <select aria-label="执行方式" value={mode} onChange={e => setMode(e.target.value as Run['mode'])}><option value="pi">Pi 助手{snapshot.config.modelConfigured ? '' : ' · 待配置'}</option><option value="fixture">工程样例 · 非 AI</option><option value="node">电脑节点 · 可信验证</option></select>}<button aria-label={composerExpanded ? "收起输入" : "展开输入"} onClick={() => setComposerExpanded(!composerExpanded)}>{composerExpanded ? "收起" : "继续对话 ↗"}</button>{project && mode === 'pi' && <button disabled={busy} aria-pressed={Boolean(newTopics[inputScope])} onClick={() => setNewTopics(previous => ({ ...previous, [inputScope]: !previous[inputScope] }))}>{newTopics[inputScope] ? '本次开始新话题' : '新话题'}</button>}<button aria-label="查看对话记录" onClick={() => setShowHistory(!showHistory)}>记录 {showHistory ? '↓' : '↑'}</button></div>{project && section === "drafts" && draftSelections[project.id] && <div className="composer-hint"><span>当前文章 · {draftSelections[project.id]!.title || "未命名草稿"}</span><span>发送前保存修改</span></div>}{showHistory && <div className="conversation">{historyError && <span role="alert">{historyError}</span>}{history?.olderThan && <button onClick={olderMessages}>更早的对话</button>}{history?.messages.map(m => <p key={m.id} className={m.role}><span className="mono muted">{m.role === "user" ? "你" : "助手"} · {time(m.at)}</span><br/>{m.text}</p>)}{!history?.messages.length && <span className="muted">{selected ? "尚无对话，提交目标后会保存在当前项目。" : "想法保存在收件箱，关联项目后继续处理。"}</span>}</div>}{project && mode === 'pi' && snapshot.config.authMode === 'chatgpt' && snapshot.config.modelConfigured && <div className="composer-hint"><span>使用 ChatGPT 订阅</span><a href="https://chatgpt.com/settings/usage" target="_blank" rel="noopener noreferrer">查看用量 ↗</a></div>}<div className="composer-line"><textarea aria-label="输入目标" placeholder={project ? '有什么想法，想让助手继续做什么？' : '一个链接、一个想法，或一件待办…'} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }}/><button className="send primary" disabled={busy || !input.trim()} onClick={send} aria-label="提交目标">↑</button></div><div className="composer-hint">{busy ? '正在提交…' : 'Ctrl / ⌘ + Enter 发送'}<span>{project ? mode === 'pi' ? newTopics[inputScope] ? '本次开始新话题' : '默认接着当前项目继续' : '提交时固定当前项目与资料版本' : '保存到收件箱'}</span></div></footer>
    {newProject && <div className="modal-backdrop"><form className="modal" onSubmit={e => { e.preventDefault(); act(async () => { const p = await api<Project>('/projects', { name, description }); open(p.id); setNewProject(false); setName(''); setDescription(''); }); }}><div className="eyebrow mono">NEW PROJECT /</div><h2>给想法一个工作空间</h2><label htmlFor="name">项目名称</label><input id="name" autoFocus required maxLength={100} value={name} onChange={e => setName(e.target.value)}/><label htmlFor="description">想完成什么</label><textarea id="description" value={description} onChange={e => setDescription(e.target.value)}/><div className="modal-actions"><button type="button" onClick={() => setNewProject(false)}>取消</button><button className="primary" disabled={busy}>创建项目 ↗</button></div></form></div>}
  </div>;
}
function Empty({ label, detail }: { label: string; detail: string }) { return <div className="empty"><span className="mono">[ — ]</span><h2>{label}</h2><p>{detail}</p></div>; }
function MemoryView({ snapshot, act }: { snapshot: Snapshot; act: (fn: () => Promise<unknown>) => void }) {
  const [value, setValue] = useState(''); const [scope, setScope] = useState('');
  return <><div className="eyebrow mono">MEMORY / EXPLICIT & TRACEABLE</div><div className="page-heading"><div><h1>记住，也可以修正</h1><p>确认的偏好与项目背景，有来源，有适用范围。</p></div></div><form className="memory-form" onSubmit={e => { e.preventDefault(); act(async () => { await api('/memories', { text: value, source: '用户在工作台明确输入', kind: scope ? 'project' : 'preference', confirmed: true, projectId: scope || undefined }); setValue(''); }); }}><input aria-label="记忆内容" placeholder="例如：文章尽量用清晰、简洁的中文" value={value} onChange={e => setValue(e.target.value)} required/><select aria-label="记忆范围" value={scope} onChange={e => setScope(e.target.value)}><option value="">个人共享偏好</option>{snapshot.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="primary">确认并保存</button></form><div>{snapshot.memories.map(m => <article key={m.id} className="memory-item"><span className="mono muted">{m.projectId ? snapshot.projects.find(p => p.id === m.projectId)?.name : '个人'} / {m.active ? '启用' : '停用'} / {m.confirmed ? '已确认' : '待确认'}</span><p>{m.text}</p><small>来源：{m.source}</small><div className="task-actions">{!m.confirmed && <button onClick={() => act(() => api(`/memories/${m.id}/confirm`, { revision: m.revision }))}>确认这条记忆</button>}<button onClick={() => { const next = window.prompt('修正这条记忆', m.text); if (next) act(() => api(`/memories/${m.id}`, { revision: m.revision, text: next }, 'PATCH')); }}>修正</button><button onClick={() => act(() => api(`/memories/${m.id}`, { revision: m.revision, active: !m.active }, 'PATCH'))}>{m.active ? '停用' : '启用'}</button><button onClick={() => act(() => api(`/memories/${m.id}`, { revision: m.revision, deleted: true }, 'PATCH'))}>删除</button></div></article>)}</div></>;
}
function Settings({ snapshot, act, refresh }: { snapshot: Snapshot; act: (fn: () => Promise<unknown>) => void; refresh:()=>Promise<void> }) {
  const [nodeToken, setNodeToken] = useState(''); const [nodeName, setNodeName] = useState('我的电脑');
  const [trash, setTrash] = useState<Asset[]>([]);
  useEffect(() => { api<Asset[]>('/trash').then(setTrash).catch(() => {}); }, [snapshot.cursor]);
  return <><div className="eyebrow mono">SETTINGS / CONNECTIONS</div><div className="page-heading"><div><h1>连接与执行</h1><p>配置留在服务端，界面展示实际能力。</p></div></div><ChatGPTPanel onChanged={refresh}/><section className="settings-section"><h2>执行用量</h2><p>新Pi任务可使用原生文件、搜索、Bash和PowerShell工具，并保留工作台资料与草稿工具。第三方扩展不会自动启用。</p><dl><dt>当前方式</dt><dd>{snapshot.config.authMode === "chatgpt" ? "ChatGPT 订阅" : "API · 按量计费"}</dd><dt>模型</dt><dd>{snapshot.config.model}</dd><dt>{snapshot.config.limitScope === "task" ? "每任务请求保护上限" : "自定义剩余调用上限"}</dt><dd>{snapshot.config.callsRemaining}</dd>{snapshot.config.authMode !== "chatgpt" && <><dt>API费用预算</dt><dd>${snapshot.config.budgetUsd}</dd></>}<dt>并发</dt><dd>{snapshot.config.concurrentLimit} 个执行任务</dd></dl><p className="muted">API是独立计费方式，仅在服务端显式配置密钥及费用预算后可用。订阅连接不会自动使用API余额。</p></section><section className="settings-section"><h2>电脑节点</h2><p className="muted">首版仅提供可信文件验证能力。配对令牌只显示一次，请存入节点本机 .env。</p>{snapshot.nodes.map(n => <div className="node-row" key={n.id}><span>{n.name} · {n.revoked ? '已撤销' : n.lastSeen > Date.now() - 12_000 ? '在线' : '离线'}</span><button disabled={n.revoked} onClick={() => act(() => api('/nodes/revoke', { id: n.id }))}>撤销</button></div>)}<div className="memory-form"><input aria-label="节点名称" value={nodeName} onChange={e => setNodeName(e.target.value)}/><button disabled={!snapshot.projects.length} onClick={() => act(async () => { const result = await api<{ node: { id: string }; token: string }>('/nodes', { name: nodeName, projectIds: snapshot.projects.filter(p => !p.archived).map(p => p.id) }); setNodeToken(`NODE_ID=${result.node.id}\nNODE_TOKEN=${result.token}`); })}>配对现有项目</button></div>{nodeToken && <pre className="token">{nodeToken}<button onClick={() => setNodeToken('')}>隐藏</button></pre>}</section><section className="settings-section"><h2>回收站</h2><p className="muted">被其他成果引用的文件不能删除。删除先停止访问；内容保留30天，已有备份遵循各自保留期。当前自动物理清理尚未启用。</p>{trash.map(a => <div className="node-row" key={a.id}><span>{a.name}</span><button onClick={() => act(() => api(`/assets/${a.id}/restore`, { revision: a.revision }))}>恢复</button></div>)}</section><StoragePanel/><BackupPanel/><SessionsPanel/><section className="settings-section"><h2>运行与备份</h2><a href="/api/diagnostics">导出脱敏诊断 ↗</a><p>{snapshot.config.deployment === 'local' ? '当前为本地工程环境，尚未完成远程手机访问验收。' : '远程入口已配置，真实访问与恢复仍需验证。'}</p><p className="muted">联合备份与恢复：按 README 的本机命令执行。普通备份不包含登录密码、节点令牌或模型密钥。</p></section></>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
