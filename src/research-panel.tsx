import React, { useRef, useState } from 'react';
import type { Asset, ResearchRequest, Run, Task } from '../shared/contracts';

const labels: Record<string, string> = { queued: '排队中', running: '正在研究', waiting_interaction: '等待用户答复', waiting_user: '等待模型连接', waiting_node: '等待执行', completed: '执行结束', failed: '研究失败', cancelled: '已取消', interrupted: '中断，待核对' };
export function ResearchPanel({ projectId, tasks, runs, assets, modelReady, onSubmit, onOpen, onTasks }: {
  projectId: string; tasks: Task[]; runs: Run[]; assets: Asset[]; modelReady: boolean;
  onSubmit: (research: ResearchRequest, commandId: string) => Promise<void>;
  onOpen: (assetId: string) => void; onTasks: () => void;
}) {
  const key = `wb-research-input-${projectId}`;
  const [input, setInput] = useState<ResearchRequest>(() => {
    try { const saved = JSON.parse(localStorage.getItem(key) || '{}'); if (typeof saved.url === 'string' && typeof saved.purpose === 'string') return saved; } catch {}
    return { url: '', purpose: '' };
  });
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef<{ fingerprint: string; id: string } | undefined>(undefined);
  const update = (next: ResearchRequest) => { setInput(next); setNotice(''); try { localStorage.setItem(key, JSON.stringify(next)); } catch {} };
  const researchTasks = tasks.filter(t => t.projectId === projectId && t.context.research);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return;
    const fingerprint = JSON.stringify(input);
    if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, id: crypto.randomUUID() };
    setBusy(true); setError(''); setNotice('');
    try { await onSubmit(input, pending.current.id); pending.current = undefined; update({ url: '', purpose: '' }); setNotice('研究任务已提交，进度和研究卡会显示在下方。'); }
    catch (e) { setError(e instanceof Error ? e.message : '提交失败，输入已保留'); }
    finally { setBusy(false); }
  }
  return <section className="research-panel" aria-label="开源项目研究">
    <div className="research-intro"><span className="mono">[ 01 ] 研究 → [ 02 ] 试用 → [ 03 ] 接入</span><h2>把一个链接，变成有依据的判断。</h2><p>告诉助手你想用它解决什么问题。研究卡会留下用途、条件、建议和原始资料。</p><p className="muted">本页先生成资料研究卡；需要运行验证时可在对话中提出。第三方扩展不会自动启用。</p></div>
    <form className="research-form" onSubmit={submit}>
      <label htmlFor="research-url">GitHub 仓库链接</label><input id="research-url" type="url" required maxLength={300} placeholder="https://github.com/作者/仓库" value={input.url} disabled={busy} onChange={e => update({ ...input, url: e.target.value })}/>
      <label htmlFor="research-purpose">你希望它帮你做什么？</label><textarea id="research-purpose" required maxLength={2000} placeholder="例如：把网页整理成干净的 Markdown，方便我收集研究资料。" value={input.purpose} disabled={busy} onChange={e => update({ ...input, purpose: e.target.value })}/>
      <div className="research-actions"><span className="muted">{modelReady ? '提交后使用当前模型连接研究，并保存到这个项目。' : '请先在设置中连接模型。输入会保留在本机。'}</span><button className="primary" disabled={busy || !modelReady || !input.url.trim() || !input.purpose.trim()}>{busy ? '正在提交…' : '开始研究 ↗'}</button></div>
      {error && <p role="alert" className="error">{error}</p>}{notice && <p role="status">{notice}</p>}
    </form>
    <div className="research-heading"><h2>我的研究记录</h2><button onClick={onTasks}>查看任务与过程 ↗</button></div>
    {!researchTasks.length && <div className="empty"><span className="mono">[ ? ]</span><h2>第一张研究卡，从你的用途开始</h2><p>这里只展示实际研究结果。资料未能读取时，会保留失败状态。</p></div>}
    {[...researchTasks].reverse().map(task => {
      const attempts = runs.filter(r => r.taskId === task.id); const latest = attempts.at(-1);
      const ids = new Set(attempts.map(r => r.id));
      const cards = assets.filter(a => a.projectId === projectId && a.kind === 'research' && a.status === 'ready' && a.runId && ids.has(a.runId));
      return <article className="research-record" key={task.id}>
        <div className="research-heading"><h3>{task.context.research!.url.replace('https://github.com/', '')}</h3><span>{latest ? labels[latest.status] : '等待执行'}</span></div>
        <p>{task.context.research!.purpose}</p><small className="muted">资料研究 · 尚未试用 · 尚未接入</small>
        {latest?.error && <p role="status">{latest.error}</p>}
        <div className="research-actions">{cards.map(card => <button key={card.id} onClick={() => onOpen(card.id)}>阅读研究卡 ↗</button>)}</div>
        {!cards.length && latest?.status === 'completed' && <p className="muted">本次执行未保存研究卡，请查看任务与对话记录。</p>}
      </article>;
    })}
  </section>;
}
