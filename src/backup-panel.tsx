import { useEffect,useState } from 'react';
import type { BackupStatus } from '../server/automatic-backup';
export function BackupPanel(){
  const [status,setStatus]=useState<BackupStatus>();const [error,setError]=useState('');
  const refresh=async()=>{try{const response=await fetch('/api/backup/status');if(!response.ok)throw new Error();setStatus(await response.json());setError('');}catch{setError('备份状态暂时无法读取');}};
  useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),30000);return()=>clearInterval(timer);},[]);
  const time=(at?:string)=>at?new Date(at).toLocaleString('zh-CN'):'尚无记录';
  const offsite=status?.offsite;
  return <section className="settings-section"><h2>自动备份</h2>{error&&<p role="alert">{error}</p>}{status&&<>
    <dl><dt>状态</dt><dd>{status.checking?'正在后台检查恢复点 · 可以继续使用':status.enabled?status.running?'正在后台备份 · 可以继续使用':status.waitingForIdle?'等待任务结束后备份':'已启用 · 空闲时维护':'尚未找到可用的独立备份位置'}</dd><dt>频率与保留</dt><dd>每 {status.intervalHours} 小时 · 保留最近 {status.retainCount} 个有效恢复点，另保留等待转存的副本</dd><dt>最近备份</dt><dd>{time(status.lastSuccessAt)}</dd><dt>最近恢复检查</dt><dd>{time(status.restoreCheckedAt)}</dd><dt>下一次到期</dt><dd>{time(status.nextDueAt)}</dd><dt>当前恢复点</dt><dd>{status.checking?'正在校验':status.retained}</dd>
    <dt>加密转存</dt><dd>{offsite?.enabled?offsite.running?'正在后台转存 · 可以继续工作':offsite.pending?`等待转存 ${offsite.pending} 份 · 来源副本保留`:'已配置 · 等待下一份备份':'尚未配置转存位置'}</dd><dt>最近转存确认</dt><dd>{time(offsite?.lastSuccessAt)}</dd></dl>
    {status.error&&<p role="alert">{status.error}</p>}{offsite?.error&&<p role="alert">{offsite.error}</p>}
    </>}<p className="muted">新备份通过恢复检查后才清理超出保留数量的自动副本。等待转存的副本会保留，空间不足时停止新增备份。普通副本不包含登录及模型凭据，恢复后重新连接账户。转存是否真正位于另一台机器，需要部署时验证。</p><button onClick={()=>void refresh()}>刷新备份状态</button></section>;
}
