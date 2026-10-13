import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import type { Asset, Draft } from '../shared/contracts';
import { MarkdownBody, draftExcerpt } from './document-reader';
interface LocalDraft { title: string; body: string; revision: number; dirty: boolean; blocked: boolean; status: string }
export interface DraftEditorStatus { title: string; status: string; dirty: boolean; excerpt: string; revision: number }
export interface PreparedDraft { id: string; projectId: string; title: string; revision: number }
export interface DraftEditorHandle { prepare: () => Promise<PreparedDraft> }
export function DraftEditor({ draft, onSave, refresh, onStatus, assets = [], onOpenSource, editorRef }: { draft: Draft; onSave: (value: Pick<Draft, 'title' | 'body'> & { revision: number }) => Promise<Draft>; refresh: () => Promise<void>; onStatus?: (status: DraftEditorStatus) => void; assets?: Asset[]; onOpenSource?: (id: string) => void; editorRef?: Ref<DraftEditorHandle> }) {
  const key = `wb-draft-${draft.id}`;
  const [value, setValue] = useState<LocalDraft>(() => {
    try { const saved = JSON.parse(localStorage.getItem(key) || 'null'); if (saved && typeof saved.title === 'string' && typeof saved.body === 'string' && Number.isSafeInteger(saved.revision) && saved.revision > 0) return { ...saved, dirty: true, blocked: false, status: '本机未同步草稿' }; } catch {}
    return { title: draft.title, body: draft.body, revision: draft.revision, dirty: false, blocked: false, status: '已同步' };
  });
  const latest = useRef(value); const inFlight = useRef<Promise<void> | null>(null); const mounted = useRef(true); const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const [sourceNotice, setSourceNotice] = useState('');
  useEffect(() => { onStatus?.({ title: value.title, status: value.status, dirty: value.dirty, excerpt: draftExcerpt(value.body), revision: value.revision }); }, [value.title, value.body, value.status, value.dirty, value.revision, onStatus]);
  useImperativeHandle(editorRef, () => ({ prepare: async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!mounted.current) throw new Error('稿件工作区已切换，请返回原稿后重新发送');
      if (inFlight.current) await inFlight.current;
      else if (latest.current.dirty) await save();
      if (!mounted.current) throw new Error('稿件工作区已切换，指令保留，请重新发送');
      const current = latest.current;
      if (!current.dirty) return { id: draft.id, projectId: draft.projectId, title: current.title, revision: current.revision };
      if (current.blocked) throw new Error(`当前稿件尚未保存：${current.status}`);
    }
    throw new Error('稿件仍在编辑，请等待保存后发送；本次指令已保留');
  } }));
  function publish(next: LocalDraft) {
    latest.current = next; setValue(next);
    try { if (next.dirty) localStorage.setItem(key, JSON.stringify({ title: next.title, body: next.body, revision: next.revision })); else localStorage.removeItem(key); } catch {}
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const current = latest.current;
    if (!current.dirty && draft.revision > current.revision) publish({ title: draft.title, body: draft.body, revision: draft.revision, dirty: false, blocked: false, status: '已同步' });
    else if (current.dirty && draft.revision > current.revision && !inFlight.current && !current.blocked) publish({ ...current, blocked: true, status: '版本冲突 · 本机修改保留' });
  }, [draft]);
  function change(field: 'title' | 'body', text: string) { publish({ ...latest.current, [field]: text, dirty: true, blocked: false, status: navigator.onLine ? '等待自动保存' : '离线未同步' }); }
  function save(): Promise<void> {
    if (inFlight.current) return inFlight.current;
    if (!latest.current.dirty) return Promise.resolve();
    if (!navigator.onLine) { publish({ ...latest.current, blocked: true, status: '离线未同步' }); return Promise.resolve(); }
    const sent = { ...latest.current }; setSaving(true); publish({ ...sent, status: '保存中' });
    const pending = Promise.resolve().then(async () => {
    try {
      const next = await onSave({ title: sent.title, body: sent.body, revision: sent.revision });
      // Switching projects must not let a late response delete a newer local edit.
      if (!mounted.current) return;
      const current = latest.current; const moreEdits = current.title !== sent.title || current.body !== sent.body;
      publish(moreEdits ? { ...current, revision: next.revision, dirty: true, blocked: false, status: '等待自动保存' } : { title: next.title, body: next.body, revision: next.revision, dirty: false, blocked: false, status: '已同步' });
      await refresh();
    } catch (error) { if (mounted.current) publish({ ...latest.current, blocked: true, status: navigator.onLine ? error instanceof Error ? error.message : '同步失败，本机修改保留' : '离线未同步' }); }
    finally { inFlight.current = null; if (mounted.current) setSaving(false); }
    }); inFlight.current = pending; return pending;
  }
  useEffect(() => {
    if (!value.dirty || value.blocked || saving || draft.revision > value.revision) return;
    const timer = setTimeout(() => { void save(); }, 900); return () => clearTimeout(timer);
  }, [value.title, value.body, value.revision, value.dirty, value.blocked, saving, draft.revision]);
  useEffect(() => {
    const online = () => { if (latest.current.dirty) publish({ ...latest.current, blocked: false, status: '等待同步' }); void refresh().catch(() => {}); };
    const offline = () => { if (latest.current.dirty) publish({ ...latest.current, blocked: true, status: '离线未同步' }); };
    window.addEventListener('online', online); window.addEventListener('offline', offline); return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); };
  }, [refresh]);
  function downloadLocal() { const blob = new Blob([`# ${latest.current.title}\n\n${latest.current.body}\n`], { type: 'text/markdown;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${latest.current.title || '草稿'}-本机修改.md`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  async function openSource(id: string) {
    setSourceNotice('');
    if (latest.current.dirty) await save();
    if (!mounted.current) return;
    if (latest.current.dirty) { setSourceNotice('当前修改尚未保存，请保留或处理后再打开来源。'); return; }
    onOpenSource?.(id);
  }
  const conflict = value.dirty && draft.revision > value.revision;
  return <article className="draft-editor"><div className="draft-toolbar"><span className="mono">DRAFT / v{value.revision}</span><span aria-live="polite">{value.status}</span><button disabled={!value.dirty || saving} onClick={() => void save()}>保存</button><a href={`/api/drafts/${draft.id}/export`} onClick={e => { if (latest.current.dirty) { e.preventDefault(); publish({ ...latest.current, status: '请先保存再导出' }); } }}>导出 Markdown ↗</a></div>
    {conflict && <div className="error">这篇草稿已有新版本。你的修改保留在本机，合并后再保存。<button onClick={downloadLocal}>下载本机修改</button><button onClick={() => publish({ title: draft.title, body: draft.body, revision: draft.revision, dirty: false, blocked: false, status: '已加载服务端版本' })}>载入服务端版本</button></div>}
    <div className="document-toolbar"><div role="group" aria-label="草稿查看方式"><button aria-pressed={!reading} onClick={() => setReading(false)}>编辑</button><button aria-pressed={reading} onClick={() => setReading(true)}>预览</button></div><span className="muted">{reading ? '预览包含本机当前修改' : '编辑后自动保存'}</span></div>
    <div className="paper">{reading ? <div className="draft-reading"><h1>{value.title || '未命名草稿'}</h1>{value.body ? <MarkdownBody text={value.body}/> : <p className="document-empty">这篇草稿还没有正文。</p>}</div> : <><input aria-label="文章标题" maxLength={150} value={value.title} onChange={e => change('title', e.target.value)}/><textarea aria-label="文章内容" value={value.body} onChange={e => change('body', e.target.value)}/></>}<div className="draft-sources"><span>{reading ? '返回编辑可继续修改' : '编辑后自动保存'}</span><details><summary>素材来源 · {draft.sourceIds.length} 个引用</summary>{draft.sourceIds.length ? <ul>{draft.sourceIds.map(id => {
      const source = assets.find(a => a.id === id && a.projectId === draft.projectId && a.status === 'ready');
      return <li key={id}>{source ? <><button disabled={!onOpenSource || saving} onClick={() => void openSource(id)}>{source.name} ↗</button><small className="mono">v{source.version} · {source.hash.slice(0, 12)}</small></> : <span>来源暂不可用 · {id.slice(0, 8)}</span>}</li>;
    })}</ul> : <p>还没有关联素材。</p>}</details>{sourceNotice && <p role="status">{sourceNotice}</p>}</div></div>
  </article>;
}
