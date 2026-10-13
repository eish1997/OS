import { useEffect, useState } from 'react';
interface Usage { groups: Record<string, { bytes: number; files: number }>; measuredBytes: number; assetQuotaBytes: number; disk: { availableBytes: number } | null; issues: string[]; limits: Record<string,number>; totalOverLimit: boolean; overLimits: string[]; log: {droppedRecords:number} }
export function StoragePanel() {
  const [usage, setUsage] = useState<Usage>(); const [error, setError] = useState('');
  const refresh = async () => { try { const result = await fetch('/api/storage'); if (!result.ok) throw new Error('存储状态读取失败'); setUsage(await result.json()); setError(''); } catch { setError('存储状态读取失败，请重试'); } };
  useEffect(() => { void refresh(); }, []);
  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
  const labels: Record<string, string> = { database: '数据库与搜索索引', assets: '资产原文件（含保留期）', uploads: '上传暂存', sessions: '代理会话', workspaces: '执行工作目录', logs:'运行日志' };
  return <section className="settings-section"><h2>存储</h2>{error && <p role="alert">{error}</p>}{usage && <><dl><dt>整体用量 / 上限</dt><dd>{mb(usage.measuredBytes)} / {mb(usage.limits.totalBytes)}</dd>{Object.entries(usage.groups).map(([key, value]) => <div key={key} style={{display:'contents'}}><dt>{labels[key] ?? key}</dt><dd>{mb(value.bytes)} / {mb(usage.limits[`${key}Bytes`])} · {value.files} 个文件</dd></div>)}<dt>恢复预留</dt><dd>{mb(usage.limits.controlReserveBytes)}</dd><dt>磁盘可用空间</dt><dd>{usage.disk ? mb(usage.disk.availableBytes) : '暂时无法读取'}</dd></dl>{(usage.totalOverLimit || usage.overLimits.length > 0 || usage.measuredBytes >= usage.limits.totalBytes - usage.limits.controlReserveBytes) && <p role="alert">部分空间已达写入上限。已有成果保留；请导出、按保留规则清理或调整配额。</p>}{usage.issues.length > 0 && <p role="alert">部分目录未能测量，暂停新增写入，请检查目录权限。</p>}{usage.log.droppedRecords > 0 && <p>部分运行日志因容量或写入锁限制未追加，已有记录保留。</p>}</>}<p className="muted">新增写入前检查容量，登录、取消和对账有恢复预留。搜索索引计入数据库。外部备份不在以上统计内，当前不会自动删除成果。</p><button onClick={() => void refresh()}>刷新存储状态</button></section>;
}
