import type { ConversationMessage, Run } from './contracts.js';
import { isOperationalRun } from './chat-visible-runs.js';

/** Host ↔ native anchor for one rendered conversation message. */
export interface ChatMessageAnchor {
  hostMessageId: string;
  hostSequence: number;
  runId?: string;
  turnId: string;
  /** Verified native session entry; never guessed from DOM order or preview text. */
  nativeEntryId?: string;
  nativeEntryState: 'bound' | 'pending' | 'unavailable';
}

export interface ChatTurn {
  turnId: string;
  runId: string;
  messages: ConversationMessage[];
  operational: boolean;
  runStatus?: Run['status'];
  nativeEntryId?: string;
  nativeEntryState: ChatMessageAnchor['nativeEntryState'];
}

function turnIdFor(message: ConversationMessage, runs: readonly Run[]): string {
  if (message.runId) {
    const run = runs.find((item) => item.id === message.runId);
    return run?.continueAfterRunId || message.runId;
  }
  return `host:${message.id}`;
}

function nativeState(run: Run | undefined): Pick<ChatMessageAnchor, 'nativeEntryId' | 'nativeEntryState'> {
  if (!run) return { nativeEntryState: 'unavailable' };
  if (run.continuation?.entryId) return { nativeEntryId: run.continuation.entryId, nativeEntryState: 'bound' };
  if (run.sessionId || run.status === 'running' || run.status === 'waiting_interaction' || run.status === 'queued') {
    return { nativeEntryState: 'pending' };
  }
  return { nativeEntryState: 'unavailable' };
}

export function messageAnchor(
  message: ConversationMessage,
  runs: readonly Run[],
  conversationHasNativeSession: boolean,
): ChatMessageAnchor {
  const turnId = turnIdFor(message, runs);
  const run = message.runId ? runs.find((item) => item.id === message.runId) : undefined;
  const native = conversationHasNativeSession ? nativeState(run) : { nativeEntryState: 'unavailable' as const };
  return {
    hostMessageId: message.id,
    hostSequence: message.sequence,
    runId: message.runId,
    turnId,
    ...native,
  };
}

/** Group host messages into turns for rendering; order follows message sequence. */
export function buildChatTurns(messages: readonly ConversationMessage[], runs: readonly Run[]): ChatTurn[] {
  const byTurn = new Map<string, ChatTurn>();
  const order: string[] = [];
  for (const message of messages) {
    const turnId = turnIdFor(message, runs);
    const run = message.runId ? runs.find((item) => item.id === message.runId) : undefined;
    const rootRun = run?.continueAfterRunId ? runs.find((item) => item.id === run.continueAfterRunId) || run : run;
    const native = nativeState(rootRun || run);
    let turn = byTurn.get(turnId);
    if (!turn) {
      turn = {
        turnId,
        runId: rootRun?.id || run?.id || turnId,
        messages: [],
        operational: rootRun ? isOperationalRun(rootRun) : false,
        runStatus: rootRun?.status,
        ...native,
      };
      byTurn.set(turnId, turn);
      order.push(turnId);
    }
    turn.messages.push(message);
    if (rootRun) {
      turn.operational = isOperationalRun(rootRun);
      turn.runStatus = rootRun.status;
      Object.assign(turn, nativeState(rootRun));
    }
  }
  return order.map((id) => byTurn.get(id)!);
}

/** Drop stale history pages when a newer request generation finished first. */
export function shouldApplyHistoryPage(requestGeneration: number, appliedGeneration: number): boolean {
  return requestGeneration >= appliedGeneration;
}
