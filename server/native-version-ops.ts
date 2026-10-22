import { dirname } from 'node:path';
import type { Run } from '../shared/contracts.js';
import {
  leafAncestorIds,
  resolveVersionTargets,
  type ChatVersionNativeMessage,
  type ChatVersionTargets,
} from '../shared/chat-version-ops.js';
import { AppError, type Store } from './store.js';
import { scanNative } from './native-inspection.js';
import { inspectNative, sourceInspection } from './native-session.js';

function collectMessages(path: string, sessionId: string, root: string, projectId: string): {
  sha256: string;
  messages: ChatVersionNativeMessage[];
  compactionIds: Set<string>;
  /** Full entry parent links (messages + compaction/branch_summary) for leaf-path walks. */
  entryParent: Map<string, string | null>;
} {
  const messages: ChatVersionNativeMessage[] = [];
  const compactionIds = new Set<string>();
  const entryParent = new Map<string, string | null>();
  const inspected = scanNative({ path, sessionId, root, projectId }, (row) => {
    const id = String(row.id);
    entryParent.set(id, (row.parentId as string | null) ?? null);
    if (row.type === 'compaction' || row.type === 'branch_summary') {
      compactionIds.add(id);
      return;
    }
    if (row.type !== 'message') return;
    const message = row.message as {
      role?: string;
      stopReason?: string;
      content?: unknown;
      toolName?: string;
      isError?: boolean;
    };
    if (!message?.role || !['user', 'assistant', 'toolResult'].includes(message.role)) return;
    messages.push({
      id,
      parentId: (row.parentId as string | null) ?? null,
      role: message.role as ChatVersionNativeMessage['role'],
      stopReason: message.stopReason,
      content: message.content,
      toolName: message.toolName,
      isError: message.isError === true,
    });
  });
  return { sha256: inspected.sha256, messages, compactionIds, entryParent };
}

/** True when the tip→root chain (including non-message entries) crosses a compaction. */
function pathAfterCompaction(
  tipId: string | undefined,
  entryParent: Map<string, string | null>,
  compactionIds: Set<string>,
): boolean {
  if (!tipId || !compactionIds.size) return false;
  let current: string | null | undefined = tipId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    if (compactionIds.has(current)) return true;
    current = entryParent.has(current) ? entryParent.get(current) : null;
  }
  return false;
}

export function versionTargetsForRun(store: Store, run: Run): ChatVersionTargets & { sourceHash?: string } {
  const input = sourceInspection(store, run);
  if (run.mode !== 'pi' || !input || !['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)) {
    return { unavailableReason: '原会话尚不可读取，版本操作暂不可用' };
  }
  if (!run.sessionPath || !run.sessionId) {
    return { unavailableReason: '原生会话未落盘，版本操作暂不可用' };
  }
  const root = dirname(store.path);
  const native = inspectNative(run.sessionPath, run.sessionId, root, run.projectId);
  const { sha256, messages, compactionIds, entryParent } = collectMessages(
    run.sessionPath,
    run.sessionId,
    root,
    run.projectId,
  );
  if (sha256 !== native.sha256) throw new AppError(409, '原生会话已变化，请重新读取后再试');
  const unknownOps = store
    .list<import('../shared/contracts.js').Operation>('operation')
    .some((o) => o.runId === run.id && ['started', 'unknown'].includes(o.state));
  const targets = resolveVersionTargets(messages, run.continuation?.entryId);
  if (targets.regenerate) {
    const pathIds = leafAncestorIds(messages);
    const tipId = pathIds[pathIds.length - 1] ?? targets.regenerate.targetEntryId;
    const afterCompaction = pathAfterCompaction(tipId, entryParent, compactionIds);
    targets.regenerate = { ...targets.regenerate, afterCompaction };
  }
  if (unknownOps) {
    return {
      ...targets,
      sourceHash: sha256,
      unavailableReason: '存在结果未确认的操作，请先核对后再做编辑重发或重新生成',
    };
  }
  return { ...targets, sourceHash: sha256 };
}
