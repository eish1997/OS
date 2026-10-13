import { config, modelConfigured } from './config.js';
import type { Policy, Run } from '../shared/contracts.js';
import type { ChatGPTAuth } from './chatgpt-auth.js';
import type { Service } from './service.js';
import { AppError, type Store } from './store.js';
export class ModelAccess {
  constructor(readonly chatgpt: ChatGPTAuth, private readonly store: Store) {}
  settings() {
    const c = this.chatgpt.status();
    const kind = c.selected ? 'chatgpt' as const : 'api' as const;
    const binding = kind === 'chatgpt' ? {kind,provider:'openai',model:c.model,connectionId:c.connectionId} : {kind,provider:config.provider,model:config.model};
    const maxCalls = kind === 'chatgpt' ? c.maxCalls : config.maxCalls;
    const limitScope = kind==='chatgpt' && c.limitsMode==='automatic' ? 'task' as const : 'connection' as const;
    const used = this.store.list<Run>('run').filter(r=>kind==='chatgpt' ? r.policy.modelBinding?.kind==='chatgpt' && r.policy.modelBinding.connectionId===c.connectionId : r.policy.modelBinding?.kind!=='chatgpt').reduce((n,r)=>n+r.calls,0);
    return {binding,modelConfigured:kind==='chatgpt'?this.chatgpt.ready():modelConfigured(),limitScope,maxCalls,callsRemaining:limitScope==='task'?maxCalls:Math.max(0,maxCalls-used),budgetUsd:kind==='chatgpt'?0:config.budgetUsd,reservePerCallUsd:kind==='chatgpt'?0:config.reservePerCallUsd,timeoutMs:kind==='chatgpt'?c.timeoutMs:config.timeoutMs};
  }
  matches(policy: Policy) {
    const current=this.settings(); const frozen=policy.modelBinding;
    if(!current.modelConfigured) return false;
    if(!frozen) return current.binding.kind==='api'; // Old API-only runs remain API-only.
    return frozen.kind===current.binding.kind && frozen.provider===current.binding.provider && frozen.model===current.binding.model && frozen.connectionId===current.binding.connectionId;
  }
  async credential(runId:string) {
    let run=this.store.get<Run>('run',runId); if(!this.matches(run.policy))throw new AppError(403,'本次模型连接已改变，需重新提交目标');
    if(run.status!=='running'||run.cancelRequested||run.timedOutAt||(run.startedAt&&Date.now()-Date.parse(run.startedAt)>=run.policy.timeoutMs)||!run.policy.allowModel)throw new AppError(403,'本次模型调用未获许可或已到期');
    const key=run.policy.modelBinding?.kind==='chatgpt'?await this.chatgpt.access(run.policy.modelBinding.connectionId!):config.apiKey;
    run=this.store.get<Run>('run',runId);if(!this.matches(run.policy))throw new AppError(403,'本次模型许可已改变');
    if(run.status!=='running'||run.cancelRequested||run.timedOutAt||(run.startedAt&&Date.now()-Date.parse(run.startedAt)>=run.policy.timeoutMs)||!run.policy.allowModel)throw new AppError(403,'本次模型调用许可已撤销或到期');
    return {apiKey:key};
  }
  async reserve(service: Service,runId:string) {
    const credential=await this.credential(runId);
    const settings=this.settings();const reserved=service.reserveCall(runId,settings.limitScope==='task'?undefined:settings.maxCalls,settings.budgetUsd);return {...credential,callNumber:reserved.calls};
  }
}
