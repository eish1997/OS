/** Host instruction appended to every Pi summarization request. Soft constraint; fork scrub is the hard boundary. */
export const compactionMemoryGuard = '不要复述或转写历史里「固定项目上下文」与「已确认记忆」宿主注入块的内容；已删除或不再有效的记忆不得出现在摘要里。只保留完成当前目标仍需要的用户意图与工作进展。';

type DefaultCompaction = (preparation: unknown, model: unknown, customInstructions: string | undefined, signal: AbortSignal, reason: string) => Promise<unknown>;

/** Ensure manual and automatic summarization both receive the host memory guard. */
export function guardSessionCompaction(session: object) {
  const target = session as { _runDefaultCompaction?: DefaultCompaction };
  const original = target._runDefaultCompaction;
  if (typeof original !== 'function') return;
  target._runDefaultCompaction = (preparation, model, customInstructions, signal, reason) =>
    original.call(session, preparation, model, customInstructions ? `${compactionMemoryGuard}\n\n${customInstructions}` : compactionMemoryGuard, signal, reason);
}
