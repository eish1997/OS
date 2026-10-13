import { useEffect, useRef, useState } from 'react';
import type { Asset, AssetSearchPage } from '../shared/contracts';
export function AssetList({ projectId, assets, selectedId, query, onQuery, onSelect }: { projectId: string; assets: Asset[]; selectedId?: string; query: string; onQuery: (query: string) => void; onSelect: (asset: Asset) => void }) {
  const [result, setResult] = useState<AssetSearchPage>(); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const generation = useRef(0);
  const versions = assets.map(a => `${a.id}:${a.revision}`).join(',');
  useEffect(() => {
    const current = ++generation.current; let cancelled = false;const controller=new AbortController(); setResult(undefined); setError('');
    if (!query.trim()) { setLoading(false); return; }
    setLoading(true); const timer = setTimeout(async () => {
      try { const response = await fetch(`/api/projects/${projectId}/assets/search?q=${encodeURIComponent(query)}`,{signal:controller.signal}); const value = await response.json(); if (!response.ok) throw new Error(value.error); if (!cancelled) setResult(value); }
      catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : '查找失败'); }
      finally { if (!cancelled) setLoading(false); }
    }, 250);
    return () => { cancelled = true; generation.current++; clearTimeout(timer);controller.abort(); };
  }, [projectId, query, versions]);
  async function more() {
    if (result?.nextOffset === undefined || loading) return; const request = generation.current; setLoading(true);
    try { const response = await fetch(`/api/projects/${projectId}/assets/search?q=${encodeURIComponent(query)}&offset=${result.nextOffset}`); const next = await response.json() as AssetSearchPage & { error?: string }; if (!response.ok) throw new Error(next.error); if (generation.current === request) setResult(current => ({ items: [...(current?.items ?? []), ...next.items].filter((r, i, all) => all.findIndex(v => v.asset.id === r.asset.id) === i), issues: [...(current?.issues ?? []), ...next.issues], total: next.total, nextOffset: next.nextOffset })); }
    catch (e) { if (generation.current === request) setError(e instanceof Error ? e.message : '查找失败'); } finally { if (generation.current === request) setLoading(false); }
  }
  const entries = query.trim() ? (result?.items ?? []).filter(r => assets.some(a => a.id === r.asset.id && a.revision === r.asset.revision)) : assets.map(asset => ({ asset, snippet: '', matched: 'name' as const }));
  return <div className="file-list"><div className="eyebrow mono">ASSETS /</div><input className="asset-search" type="search" aria-label="查找项目资产" placeholder="名称、标签、文本内容" maxLength={120} value={query} onChange={e => onQuery(e.target.value)}/><div className="search-note">UTF-8 文本可查内容，其他文件按名称和标签查找。</div>
    {loading && <p className="muted" aria-live="polite">正在查找…</p>}{error && <p role="alert">{error}</p>}
    {entries.map(({ asset: a, snippet, matched }) => <button key={a.id} className={selectedId === a.id ? 'file active' : 'file'} onClick={() => onSelect(a)}><span className="mono">└</span><span>{a.name}<small>v{a.version} · {(a.size / 1024).toFixed(1)} KB{a.tags?.length ? ` · ${a.tags.join(' / ')}` : ''}</small>{query.trim() && <small className="search-snippet">{matched === 'content' ? '内容：' : matched === 'tags' ? '标签：' : '名称匹配'}{snippet}</small>}</span></button>)}
    {!entries.length && !loading && !error && <p className="muted">{query.trim() ? '没有匹配的可用资产。' : '还没有资产。上传资料或发起任务。'}</p>}
    {result?.issues.map(issue => <p key={issue.assetId} className="search-issue">{issue.name}：{issue.error}</p>)}{result && <p className="muted">匹配 {result.total} 条记录</p>}{result?.nextOffset !== undefined && <button disabled={loading} onClick={more}>更多结果</button>}
  </div>;
}
export function AssetMetadataEditor({ asset, onSave }: { asset: Asset; onSave: (fields: { name: string; tags: string[]; revision: number }) => Promise<Asset> }) {
  const [name, setName] = useState(asset.name); const [tags, setTags] = useState((asset.tags ?? []).join(', ')); const [base, setBase] = useState(asset.revision); const [dirty, setDirty] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  useEffect(() => { if (!dirty && asset.revision >= base) { setName(asset.name); setTags((asset.tags ?? []).join(', ')); setBase(asset.revision); } }, [asset, dirty, base]);
  const conflict = dirty && asset.revision > base && !saving;
  async function save() { setSaving(true); setError(''); try { const next = await onSave({ name, tags: tags.split(/[,，]/).map(t => t.trim()).filter(Boolean), revision: base }); setName(next.name); setTags((next.tags ?? []).join(', ')); setBase(next.revision); setDirty(false); } catch (e) { setError(e instanceof Error ? e.message : '保存失败'); } finally { setSaving(false); } }
  return <details className="asset-metadata"><summary>名称与标签</summary><div className="asset-metadata-fields"><label>文件名称<input aria-label="资产名称" maxLength={180} disabled={saving} value={name} onChange={e => { setName(e.target.value); setDirty(true); }}/></label><label>标签（逗号分隔）<input aria-label="资产标签" disabled={saving} value={tags} onChange={e => { setTags(e.target.value); setDirty(true); }}/></label><button disabled={!dirty || saving} onClick={save}>{saving ? '保存中…' : '保存文件信息'}</button></div>{error && <p role="alert">{error}</p>}{conflict && <p>文件信息已更新，你的输入仍在这里。<button onClick={() => { setName(asset.name); setTags((asset.tags ?? []).join(', ')); setBase(asset.revision); setDirty(false); setError(''); }}>载入最新文件信息</button></p>}</details>;
}
