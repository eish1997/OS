import type { AgentSession, AgentSessionEvent } from '@earendil-works/pi-coding-agent';
import type { ModelRequestPurpose, PiCompactionState } from '../shared/pi-runtime.js';

/** Synchronous observation: Pi emits compaction_start before opening its summary stream. */
export class PiSessionLifecycle {
  purpose: ModelRequestPurpose = 'agent';
  modelFailed = false;
  compaction?: PiCompactionState;
  constructor(private readonly publish: (state: PiCompactionState) => void = () => {}) {}
  /** Branch summarization has no compaction_start; wrap navigateTree before the model stream opens. */
  bind(session: Pick<AgentSession, 'navigateTree'>) {
    const original = session.navigateTree.bind(session);
    session.navigateTree = async (targetId, options) => {
      const previous = this.purpose;
      if (options?.summarize) this.purpose = 'branch_summary';
      try { return await original(targetId, options); }
      finally { this.purpose = previous === 'compaction' ? previous : 'agent'; }
    };
  }
  observe(event: AgentSessionEvent) {
    if (event.type === 'compaction_start') {
      this.purpose = 'compaction';
      this.compaction = { phase: 'running', reason: event.reason };
      this.publish(this.compaction);
    } else if (event.type === 'compaction_end') {
      this.purpose = 'agent';
      this.compaction = { phase: event.aborted ? 'cancelled' : event.result ? 'completed' : 'failed', reason: event.reason, tokensBefore: event.result?.tokensBefore, estimatedTokensAfter: event.result?.estimatedTokensAfter };
      this.publish(this.compaction);
    } else if (event.type === 'summarization_retry_attempt_start') {
      // First branch attempt is marked by bind(navigateTree); retries only emit this event.
      this.purpose = event.source === 'branchSummary' ? 'branch_summary' : 'compaction';
    } else if (event.type === 'message_end' && event.message.role === 'assistant') {
      // A recovered overflow/retry must not remain failed because an earlier attempt failed.
      this.modelFailed = ['error', 'aborted'].includes(event.message.stopReason);
    }
  }
}
