import { useEffect, useState } from 'react';
import type { Asset, ProjectSummary } from '../shared/contracts';
type Fields = Pick<ProjectSummary, 'goal' | 'progress' | 'decisions' | 'nextStep' | 'sourceIds'>;
const labels = { goal: '项目目标', progress: '当前进展', decisions: '已确认的决定', nextStep: '下一步' } as const;
export function ProjectSummaryEditor({ projectId, summary, assets, initialGoal, onSave }: { projectId: string; summary?: ProjectSummary; assets: Asset[]; initialGoal: string; onSave: (fields: Fields & { revision: number }) => Promise<ProjectSummary> }) {
  const blank = (): Fields => ({ goal: summary?.goal ?? initialGoal, progress: summary?.progress ?? '', decisions: summary?.decisions ?? '', nextStep: summary?.nextStep ?? '', sourceIds: summary?.sourceIds ?? [] });
  const [fields, setFields] = useState<Fields>(blank); const [base, setBase] = useState(summary?.revision ?? 0); const [dirty, setDirty] = useState(false); const [saving, setSaving] = useState(false); const [message, setMessage] = useState(summary?.confirmed ? '已确认' : summary ? '助手提出 · 待确认' : '尚未建立');
  const cacheKey = `wb-summary-${projectId}`;
  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem(cacheKey) || 'null'); if (saved && Object.keys(labels).every(k => typeof saved.fields?.[k] === 'string') && Array.isArray(saved.fields.sourceIds) && saved.fields.sourceIds.every((id: unknown) => typeof id === 'string') && Number.isSafeInteger(saved.revision)) { setFields(saved.fields); setBase(saved.revision); setDirty(true); setMessage('本机未同步修改'); } } catch {}
  }, [cacheKey]);
  useEffect(() => { if (!dirty && (summary?.revision ?? 0) >= base) { setFields(blank()); setBase(summary?.revision ?? 0); setMessage(summary?.confirmed ? '已确认' : summary ? '助手提出 · 待确认' : '尚未建立'); } }, [summary, dirty, base]);
  function update(next: Fields) { setFields(next); setDirty(true); setMessage('尚未保存'); try { localStorage.setItem(cacheKey, JSON.stringify({ fields: next, revision: base })); } catch { setMessage('尚未保存 · 本机缓存不可用'); } }
  async function save() {
    setSaving(true); setMessage('保存中');
    try { const next = await onSave({ ...fields, revision: base }); setFields(next); setBase(next.revision); setDirty(false); setMessage('已确认'); try { localStorage.removeItem(cacheKey); } catch {} }
    catch (error) { setMessage(error instanceof Error ? error.message : '保存失败'); }
    finally { setSaving(false); }
  }
  const conflict = dirty && (summary?.revision ?? 0) !== base;
  return <section className="summary-editor"><div className="draft-toolbar"><span className="mono">PROJECT BRIEF / v{base}</span><span aria-live="polite">{message}</span><button disabled={saving || (summary?.confirmed && !dirty)} onClick={save}>确认并保存摘要</button></div>
    {conflict && <div className="error">另一设备或助手已更新，你的修改仍保留在本机。<button onClick={() => { setFields(blank()); setBase(summary?.revision ?? 0); setDirty(false); try { localStorage.removeItem(cacheKey); } catch {} }}>载入当前版本</button></div>}
    <p className="muted summary-note">这里保存项目背景和决定。只有确认后的版本会进入后续任务；已提交任务保留原版本。</p>
    <div className="summary-fields">{Object.entries(labels).map(([key, label]) => <label key={key}>{label}<textarea aria-label={label} maxLength={3000} value={fields[key as keyof typeof labels]} onChange={e => update({ ...fields, [key]: e.target.value })}/></label>)}</div>
    <fieldset className="summary-sources"><legend>依据与资料</legend>{assets.length ? assets.map(a => <label key={a.id}><input type="checkbox" checked={fields.sourceIds.includes(a.id)} onChange={e => update({ ...fields, sourceIds: e.target.checked ? [...fields.sourceIds, a.id] : fields.sourceIds.filter(id => id !== a.id) })}/><span>{a.name}<small>v{a.version} / SHA256 {a.hash.slice(0, 12)}</small></span></label>) : <p className="muted">可先记录自己的目标，上传资料后补充来源。</p>}</fieldset>
  </section>;
}
