import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { PluginAction, PluginPackage, PluginSnapshot } from '../../shared/plugins';
import type { WindowContentProps } from './window-contract';
import { ApiError, request } from './client';
import './plugins.css';

const labels = { extensions: '扩展', skills: 'Skills', prompts: '提示词', themes: '终端主题' };
const phases: Record<string, string> = { queued: '已排队', waiting_for_environment: '等待现有执行结束', preparing: '准备中', applying: '正在处理文件', committing: '保存配置', completed: '已完成', failed: '失败', reconcile_required: '需要修复' };
const discoveryLimitNotice = '显示最近 10 次执行的发现记录，每次最多展示 500 项资源和 100 条诊断。';

export function PluginsPane({ snapshot, window: w, patch }: WindowContentProps) {
  const [data, setData] = useState<PluginSnapshot>(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<PluginAction>(); const [source, setSource] = useState(''); const [trusted, setTrusted] = useState(false);
  const [commandId, setCommandId] = useState(() => crypto.randomUUID());
  const submitted = useRef<{ action: PluginAction; source: string; trusted: boolean; revision: number; commandId: string } | undefined>(undefined);
  const mounted = useRef(true); const query = String(w.view.query || ''); const selected = String(w.view.selected || '');
  const querySequence = useRef(0);
  const reload = useCallback(async () => {
    const sequence = ++querySequence.current;
    try {
      const value = await request<PluginSnapshot>('/plugins');
      if (mounted.current && sequence === querySequence.current) setData(value);
    } catch (e) { if (mounted.current && sequence === querySequence.current) setError(String(e)); }
  }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { void reload(); }, [snapshot?.cursor, reload]);
  const pkg = data?.configuration.packages.find(p => p.id === selected);
  const pending = data?.operations.some(o => !['completed', 'failed', 'reconcile_required'].includes(o.phase));
  const openAction = (next: PluginAction, item?: PluginPackage) => { setAction(next); setSource(item?.source || String(w.view.installSource || '')); setTrusted(false); setCommandId(crypto.randomUUID()); setError(''); };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!data || !action || busy) return;
    setBusy(true); setError('');
    try {
      // A lost response may have committed the operation. Retry its exact request,
      // including revision, rather than reusing its id with a refreshed revision.
      const payload = submitted.current?.commandId === commandId ? submitted.current : { action, source, trusted, revision: data.configuration.revision, commandId };
      submitted.current = payload;
      await request('/plugins/operations', payload);
      submitted.current = undefined;
      setAction(undefined); patch({ installSource: '' }); await reload();
    } catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        submitted.current = undefined; setCommandId(crypto.randomUUID());
      }
      setError(String(e)); await reload();
    } finally { setBusy(false); }
  };
  const configure = async (item: PluginPackage, enabled: boolean, resourceIds?: string[]) => {
    if (!data || busy) return; setBusy(true); setError('');
    try { await request(`/plugins/${item.id}`, { revision: data.configuration.revision, enabled, resourceIds }, 'PATCH'); await reload(); }
    catch (e) { setError(String(e)); await reload(); } finally { setBusy(false); }
  };
  return <div className="wb-plugins" data-workbench-interactive aria-label="插件管理">
    <header className="wb-plugin-toolbar"><input aria-label="搜索已安装插件" placeholder="搜索已安装插件" value={query} onChange={e => patch({ query: e.target.value })}/><button className="wb-primary" disabled={busy || pending} onClick={() => openAction('install')}>安装插件</button><a href="https://pi.dev/packages" target="_blank" rel="noreferrer">浏览官方目录 ↗</a></header>
    <p className="wb-caption">当前工作台统一管理 · 后续开始的执行使用新配置</p>
    {error && <p role="alert" className="wb-inline-error">{error}</p>}
    {data?.configuration.health === 'reconcile_required' && <p role="alert" className="wb-inline-error">环境需要修复：{data.configuration.error}。新执行暂停使用此环境。</p>}
    {action && <form className="wb-plugin-install" onSubmit={submit} aria-label="插件操作">
      <h3>{({ install: '安装插件', update: '更新插件', remove: '卸载插件', repair: '修复插件' })[action]}</h3>
      <label>npm / Git 来源或服务端本地绝对路径<input autoFocus required aria-label="插件来源" readOnly={action === 'remove'} placeholder="npm:包名@版本 / git:仓库地址 / C:\插件路径" value={source} onChange={e => { setSource(e.target.value); setCommandId(crypto.randomUUID()); if (action === 'install') patch({ installSource: e.target.value }); }}/></label>
      {action !== 'remove' && <p className="wb-caption">npm 示例：npm:@scope/plugin 或 npm install @scope/plugin。一次填写一个包，不含额外参数。</p>}
      {action === 'remove' ? <p>移除工作台登记和托管安装。本地源目录保留；运行中的执行结束后再处理。</p> : <><p>安装和更新可能执行第三方代码。插件拥有宿主权限；未启用不代表安装时没有执行代码。</p><label className="wb-plugin-trust"><input type="checkbox" checked={trusted} onChange={e => setTrusted(e.target.checked)}/>我信任此来源，允许安装所需代码执行</label></>}
      <div className="wb-plugin-actions"><button type="submit" className="wb-primary" disabled={busy || pending || (action !== 'remove' && !trusted)}>{busy ? '提交中…' : '确认操作'}</button><button type="button" disabled={busy} onClick={() => setAction(undefined)}>取消</button></div>
    </form>}
    {!data && <p role="status">正在读取插件…</p>}
    {data && <div className={`wb-plugin-columns ${pkg ? 'has-selection' : ''}`}>
      <nav className="wb-plugin-list" aria-label="已安装插件">
        {!data.configuration.packages.length && <div className="wb-plugin-empty"><h3>还没有安装插件</h3><p>从 npm、Git 或服务端本地路径添加扩展、Skills 和提示词。</p></div>}
        {data.configuration.packages.filter(p => `${p.name} ${p.source}`.toLowerCase().includes(query.toLowerCase())).map(p => <button key={p.id} aria-pressed={p.id === selected} className={p.id === selected ? 'selected' : ''} onClick={() => patch({ selected: p.id })}><strong>{p.name}</strong><span>{p.version || p.commit?.slice(0, 8) || '本地开发资源'}</span><small>{p.enabled ? '已启用' : '未启用'} · {p.lastLoad ? p.lastLoad.error ? '最近加载失败' : '最近加载成功' : '待首次验证'}</small></button>)}
      </nav>
      {pkg ? <section className="wb-plugin-detail" aria-label="插件详情">
        <button className="wb-plugin-back" onClick={() => patch({ selected: '' })}>← 返回列表</button>
        <h2>{pkg.name}</h2><p className="wb-caption">{pkg.version || pkg.commit || '开发路径，内容可能变化'}</p><code>{pkg.source}</code>
        <div className="wb-plugin-actions"><label><input type="checkbox" checked={pkg.enabled} disabled={busy || pending} onChange={e => void configure(pkg, e.target.checked)}/>启用插件</label><button disabled={busy || pending} onClick={() => openAction('update', pkg)}>更新 / 指定版本</button><button disabled={busy || pending} onClick={() => openAction('repair', pkg)}>修复</button><button disabled={busy || pending} onClick={() => openAction('remove', pkg)}>卸载</button></div>
        {pkg.installationState === 'missing' && <p role="alert">插件文件缺失，请修复安装；本地源请核对服务端路径。</p>}<h3>包内资源</h3><p className="wb-caption">扩展能力需实际验证。终端界面不会自动转换为网页界面。</p>
        {pkg.resources.map(resource => <label className="wb-plugin-resource" key={resource.id}><input type="checkbox" checked={resource.enabled && resource.kind !== 'themes'} disabled={busy || pending || resource.kind === 'themes'} onChange={e => void configure(pkg, pkg.enabled, pkg.resources.filter(r => r.kind !== 'themes' && (r.id === resource.id ? e.target.checked : r.enabled)).map(r => r.id))}/><span>{labels[resource.kind]}{resource.kind === 'themes' && ' · 网页不支持'}<small>{resource.path}</small></span></label>)}
        {!pkg.resources.length && <p>此包没有发现可加载资源。</p>}
        {pkg.lastLoad && <p className="wb-caption">最近加载：{new Date(pkg.lastLoad.at).toLocaleString()}<br/>项目 {pkg.lastLoad.projectId} · 执行 {pkg.lastLoad.runId}<br/>环境版本 {pkg.lastLoad.environmentRevision}{pkg.lastLoad.error && ` · ${pkg.lastLoad.error}`}</p>}
      </section> : <section className="wb-plugin-detail wb-plugin-placeholder"><p>选择插件查看资源与运行状态。</p></section>}
    </div>}
    <details className="wb-plugin-operations"><summary>最近执行发现的 Skills 与提示词来源</summary><p className="wb-caption">{discoveryLimitNotice}</p><p className="wb-caption">自动发现的用户/项目资源保持原有行为，不能用托管包开关关闭。以下是实际执行记录，不代表常驻加载。</p>{!data?.discoveries?.length && <p>开始一次 Pi 执行后可查看来源与资源冲突。</p>}{data?.discoveries?.map(discovery => <article key={discovery.id}><strong>{snapshot?.projects.find(p => p.id === discovery.projectId)?.name || discovery.projectId}</strong><small>执行 {discovery.runId} · {new Date(discovery.createdAt).toLocaleString()}</small>{discovery.resources.map((resource,index) => <p key={index}>{labels[resource.kind]} · {resource.name}<small>{resource.managed ? '托管资源' : `自动发现 / ${resource.source}`} · {resource.path}</small></p>)}{discovery.diagnostics.map((diagnostic,index) => <p key={index} className="wb-inline-error">{diagnostic.message} {diagnostic.path}</p>)}</article>)}</details>
    {!!data?.operations.length && <section className="wb-plugin-operations" aria-label="插件操作记录"><h3>最近操作</h3>{[...data.operations].reverse().slice(0, 12).map(op => <article key={op.id}><strong>{phases[op.phase]}</strong><span>{op.source}</span><small>{op.progress}</small>{op.error && <p className="wb-inline-error">{op.error}</p>}{op.phase === 'reconcile_required' && <button disabled={busy || pending} onClick={() => { setAction('repair'); setSource(op.source); setTrusted(false); setCommandId(crypto.randomUUID()); }}>核对来源并修复</button>}</article>)}</section>}
  </div>;
}
