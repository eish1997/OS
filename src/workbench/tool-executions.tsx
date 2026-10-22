import React, {useEffect,useState} from 'react';
import type {Run} from '../../shared/contracts';
import type {ToolExecution} from '../../shared/run-stream';
import {request} from './client';

function ToolRecovery({run,item,onSaved}:{run:Run;item:ToolExecution;onSaved:()=>void}){
  const [outcome,setOutcome]=useState<'performed'|'not_performed'|'partial'>('partial');const [evidence,setEvidence]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  if(item.schemaVersion!==1)return <p>工具记录版本不受支持，不会按当前规则核对。</p>;
  if(item.reconciliation)return <p>用户已核对：{({performed:'已执行',not_performed:'未执行',partial:'部分执行'})[item.reconciliation.outcome]}。依据：{item.reconciliation.evidence}</p>;
  if((item.phase!=='running'&&!item.outcomeUnknown)||!['completed','failed','cancelled','interrupted'].includes(run.status))return null;
  return <fieldset disabled={busy}><legend>核对中断工具</legend><p>先检查文件、外部操作及命令子进程是否已停止。无法确认时保留待核对状态；核对记录会交给后续执行。</p>
    <label>实际结果<select aria-label={`工具 ${item.callId} 核对结论`} value={outcome} onChange={e=>setOutcome(e.target.value as typeof outcome)}><option value="partial">部分执行</option><option value="performed">已执行</option><option value="not_performed">未执行</option></select></label>
    <label>核对依据<textarea aria-label={`工具 ${item.callId} 核对依据`} value={evidence} maxLength={4000} onChange={e=>setEvidence(e.target.value)}/></label>
    <button disabled={!evidence.trim()} onClick={async()=>{setBusy(true);setError('');try{await request(`/runs/${encodeURIComponent(run.id)}/tools/${encodeURIComponent(item.id)}/reconcile`,{revision:item.revision,outcome,evidence});onSaved();}catch(e){setError(String(e));}finally{setBusy(false);}}}>保存核对结论</button>{error&&<p role="alert">{error}</p>}
  </fieldset>;
}

export function ToolExecutionDetails({run}:{run:Run}){
  const [open,setOpen]=useState(false);const [after,setAfter]=useState(0);
  const [page,setPage]=useState<{items:ToolExecution[];nextAfter?:number}>();
  const [error,setError]=useState('');const [refresh,setRefresh]=useState(0);
  useEffect(()=>{
    if(!open)return;
    const controller=new AbortController();
    void request<{items:ToolExecution[];nextAfter?:number}>(`/runs/${encodeURIComponent(run.id)}/tools?after=${after}`,undefined,'GET',controller.signal).then(next=>{setPage(next);setError('');}).catch(e=>{if(!controller.signal.aborted)setError(String(e));});
    return()=>controller.abort();
    // Run snapshots change on the existing shared event connection; no second SSE connection.
  },[run,open,after,refresh]);
  return <details className="wb-plugin-run-details" data-workbench-interactive onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary>本轮工具过程</summary>
    <p>每项是一次实际调用。预览可能缩短；完整记录保存工具返回的内容与附加信息。</p>
    <button onClick={()=>setRefresh(n=>n+1)}>刷新工具进度</button>
    {run.status==='interrupted'&&!run.error?.includes('已对账')&&<p><button onClick={async()=>{try{await request(`/runs/${encodeURIComponent(run.id)}/reconcile`,{});setError('');setRefresh(n=>n+1);}catch(e){setError(String(e));}}}>核对进程与成果</button>：先保存下方每个待核对工具的实际结果，再检查执行进程和已登记成果。通过后可在任务额度中恢复。</p>}
    {error&&<p role="alert">{error}</p>}
    {page&&!page.items.length&&<p>尚无工具调用记录。旧执行可能只有历史起止事件。</p>}
    <ol>{page?.items.map(item=><li key={item.id}><strong>{item.name}</strong> · {item.schemaVersion!==1?'版本不受支持':item.phase==='running'?item.reconciliation?'已人工核对':(run.status==='running'||run.status==='waiting_interaction')?'执行中':'执行已结束，结果待核对':item.phase==='completed'?'已完成':'失败'}
      <p className="wb-caption">来源：{item.source}</p><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{item.preview}</pre>
      {item.schemaVersion===1&&item.outcomeUnknown&&!item.reconciliation&&<p role="alert">调用失败，但操作可能已发生。副作用待核对，不能直接重试。</p>}
      {item.resultMessageId&&<a href={`/api/runs/${encodeURIComponent(run.id)}/messages/${encodeURIComponent(item.resultMessageId)}/text`} target="_blank" rel="noreferrer">查看完整工具结果</a>}
      {item.outputMessageId&&<p><a href={`/api/runs/${encodeURIComponent(run.id)}/messages/${encodeURIComponent(item.outputMessageId)}/text`} target="_blank" rel="noreferrer">查看未截断的命令输出</a></p>}
      <ToolRecovery run={run} item={item} onSaved={()=>setRefresh(n=>n+1)}/>
    </li>)}</ol>
    {after>0&&<button onClick={()=>setAfter(0)}>返回首批调用</button>}
    {page?.nextAfter!==undefined&&<button onClick={()=>setAfter(page.nextAfter!)}>更多工具调用</button>}
  </details>;
}
