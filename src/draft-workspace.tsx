import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import type { Asset, Draft } from '../shared/contracts';
import { DraftEditor, type DraftEditorStatus, type DraftEditorHandle, type PreparedDraft } from './draft-editor';
import { draftExcerpt } from './document-reader';

export interface DraftWorkspaceHandle { selection: () => PreparedDraft | undefined; prepare: (id: string) => Promise<PreparedDraft> }
export function DraftWorkspace({ projectId, drafts, onSave, onCreate, refresh, assets, onOpenSource, workspaceRef, onSelection }: {
  projectId: string; drafts: Draft[];
  onSave: (id: string, value: Pick<Draft, 'title' | 'body'> & { revision: number }) => Promise<Draft>;
  onCreate: () => Promise<Draft>; refresh: () => Promise<void>;
  assets?: Asset[]; onOpenSource?: (id: string) => void;
  workspaceRef?: Ref<DraftWorkspaceHandle>; onSelection?: (projectId: string, draft: PreparedDraft | undefined) => void;
}) {
  const ordered = [...drafts].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const key = `wb-project-draft-${projectId}`;
  const [selection, setSelection] = useState(() => {
    try { return localStorage.getItem(key) || ''; } catch { return ''; }
  });
  const current = ordered.find(d => d.id === selection) ?? ordered[0];
  const [editorStates, setEditorStates] = useState<Record<string, DraftEditorStatus>>({});
  const editors = useRef(new Map<string, DraftEditorHandle>());
  const selectedDraft = current ? { id: current.id, projectId, title: editorStates[current.id]?.title ?? current.title, revision: editorStates[current.id]?.revision ?? current.revision } : undefined;
  useEffect(() => { onSelection?.(projectId, selectedDraft); }, [onSelection, projectId, selectedDraft?.id, selectedDraft?.title, selectedDraft?.revision]);
  useImperativeHandle(workspaceRef, () => ({ selection: () => selectedDraft, prepare: async id => {
    const editor = editors.current.get(id); if (!editor) throw new Error('当前草稿不可用，指令已保留');
    return editor.prepare();
  } }));
  const [creating, setCreating] = useState(false); const [error, setError] = useState('');
  useEffect(() => { if (current) { try { localStorage.setItem(key, current.id); } catch {} } }, [key, current?.id]);
  const report = useCallback((id: string, state: DraftEditorStatus) => {
    setEditorStates(previous => {
      const old = previous[id];
      return old?.title === state.title && old.status === state.status && old.dirty === state.dirty && old.excerpt === state.excerpt && old.revision === state.revision ? previous : { ...previous, [id]: state };
    });
  }, []);
  async function create() {
    if (creating) return; setCreating(true); setError('');
    try { const next = await onCreate(); setSelection(next.id); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : '创建草稿失败'); }
    finally { setCreating(false); }
  }
  return <section className="draft-workspace" aria-label="项目草稿工作区">
    <aside className="draft-list" aria-label="草稿列表">
      <div className="draft-list-heading"><span className="eyebrow mono">DRAFTS / {drafts.length}</span><button disabled={creating} onClick={() => void create()}>{creating ? '创建中…' : '＋ 新建草稿'}</button></div>
      {error && <p role="alert">{error}</p>}
      {ordered.map((d, index) => {
        const state = editorStates[d.id];
        return <button key={d.id} className={d.id === current?.id ? 'draft-choice active' : 'draft-choice'} aria-pressed={d.id === current?.id} onClick={() => setSelection(d.id)}>
          <span className="draft-choice-title">{(state?.title ?? d.title) || '未命名草稿'}</span>
          <span className="draft-choice-identity mono" title={`${d.createdAt} / ${d.id}`}>[{String(index + 1).padStart(2, '0')}] {new Date(d.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} · {d.id.slice(0, 8)}</span>
          <span className="draft-choice-excerpt">{(state?.excerpt ?? draftExcerpt(d.body)) || '尚无正文'}</span>
          <small>{state?.status || '已同步'} · {d.sourceIds.length} 个素材</small>
        </button>;
      })}
      {!drafts.length && <p className="muted">还没有草稿。从一篇文章开始，或让助手整理项目成果。</p>}
    </aside>
    <div className="draft-stage">
      {/* Keep editors mounted so switching drafts does not cancel pending saves. */}
      {drafts.map(d => <div key={d.id} hidden={d.id !== current?.id}>
        <DraftEditor draft={d} editorRef={handle => { if (handle) editors.current.set(d.id, handle); else editors.current.delete(d.id); }} onSave={value => onSave(d.id, value)} refresh={refresh} onStatus={state => report(d.id, state)} assets={assets} onOpenSource={onOpenSource}/>
      </div>)}
      {!current && <div className="empty-stage"><span className="mono">[ · ]</span><h2>让过程成为内容</h2><p>项目的资料、结果和观点，可以在这里整理成文章。</p></div>}
    </div>
  </section>;
}
