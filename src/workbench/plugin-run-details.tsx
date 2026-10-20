import React from 'react';
import type { Run } from '../../shared/contracts';
import {mcpConnectionLabels,mcpDiagnosticLabels} from '../../shared/mcp';
import {PluginInteractions} from './plugin-interactions';

export function PluginRunDetails({run}:{run:Run}) {
  const manifest=run.pluginManifest;
  return <><PluginInteractions run={run}/>{run.mcpConnections?.length?<details className="wb-plugin-run-details" data-workbench-interactive open><summary>MCP 当前传输 · {run.mcpConnections.length} 项</summary><p>这是本次执行观察到的传输状态。服务进程退出后，已连通会变为已断开。它不是持续打开的原生连接面板。</p><ul>{run.mcpConnections.map(item=><li key={item.server}>{item.server}：{mcpConnectionLabels[item.code]}</li>)}</ul></details>:null}{run.mcpDiagnostics?.length?<details className="wb-plugin-run-details" data-workbench-interactive open><summary>MCP 连接提醒 · {run.mcpDiagnostics.length} 项</summary><p>以下是本次运行收到的提醒，不代表服务当前连接状态。请在插件管理中检查 MCP 配置和凭据。</p><ul>{run.mcpDiagnostics.map((item,index)=><li key={index}>{item.server?`${item.server}：`:''}{mcpDiagnosticLabels[item.code]}</li>)}</ul></details>:null}{manifest?.packages.length?<details className="wb-plugin-run-details" data-workbench-interactive><summary>本次插件 · {manifest.packages.length} 个</summary><p>环境版本 {manifest.environmentRevision} · 配置版本 {manifest.configurationRevision}</p>{manifest.packages.map(pkg=><p key={pkg.id}>{pkg.source}<br/><small>{pkg.version||pkg.commit||'本地开发资源'} · 内容摘要 {pkg.fingerprint.slice(0,12)}</small></p>)}{run.pluginTools?.length ? <p>注册工具：{run.pluginTools.map(t=>t.name).join('、')}</p> : null}<p>启用资源：</p><ul>{manifest.resources.map(resource=><li key={resource.id}>{resource.kind} · {resource.path}</li>)}</ul></details>:null}</>;
}
