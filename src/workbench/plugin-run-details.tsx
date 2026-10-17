import React from 'react';
import type { Run } from '../../shared/contracts';

export function PluginRunDetails({run}:{run:Run}) {
  const manifest=run.pluginManifest;if(!manifest?.packages.length)return null;
  return <details className="wb-plugin-run-details" data-workbench-interactive><summary>本次插件 · {manifest.packages.length} 个</summary><p>环境版本 {manifest.environmentRevision} · 配置版本 {manifest.configurationRevision}</p>{manifest.packages.map(pkg=><p key={pkg.id}>{pkg.source}<br/><small>{pkg.version||pkg.commit||'本地开发资源'} · 内容摘要 {pkg.fingerprint.slice(0,12)}</small></p>)}{run.pluginTools?.length ? <p>注册工具：{run.pluginTools.map(t=>t.name).join('、')}</p> : null}<p>启用资源：</p><ul>{manifest.resources.map(resource=><li key={resource.id}>{resource.kind} · {resource.path}</li>)}</ul></details>;
}
