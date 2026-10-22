/** Host version ops: edit-resend and answer regenerate (CHAT-12). Never guess anchors from DOM/preview text. */

export type ChatVersionKind = 'edit_resend' | 'regenerate';

export interface ChatVersionNativeMessage {
  id: string;
  parentId: string | null;
  role: 'user' | 'assistant' | 'toolResult';
  stopReason?: string;
  content?: unknown;
  toolName?: string;
  isError?: boolean;
  /** Compaction / branch_summary markers on the leaf path. */
  summaryKind?: 'compaction' | 'branch_summary';
}

export interface ChatVersionEditTarget {
  kind: 'edit_resend';
  /** User entry being replaced; excluded from the fork base. */
  userEntryId: string;
  /** Parent of the user entry, or null for first-message empty history. */
  baseEntryId: string | null;
  preview: string;
  imageCount: number;
  firstMessage: boolean;
}

export interface ChatVersionRegenerateTarget {
  kind: 'regenerate';
  /** Final assistant answer to exclude. */
  targetEntryId: string;
  /** Legal base: prior user or completed toolResult (keeps tools, drops old final). */
  baseEntryId: string;
  baseRole: 'user' | 'toolResult';
  preview: string;
  keptToolResults: number;
  afterCompaction: boolean;
}

export interface ChatVersionTargets {
  editResend?: ChatVersionEditTarget;
  regenerate?: ChatVersionRegenerateTarget;
  unavailableReason?: string;
}

function textPreview(content: unknown): { preview: string; imageCount: number } {
  const blocks = Array.isArray(content) ? content : typeof content === 'string' ? [{ type: 'text', text: content }] : [];
  let imageCount = 0;
  const parts: string[] = [];
  for (const part of blocks as { type?: string; text?: string }[]) {
    if (part?.type === 'image') imageCount += 1;
    else if (typeof part?.text === 'string') parts.push(part.text);
    else if (typeof part === 'string') parts.push(part);
  }
  if (!parts.length && typeof content === 'string') parts.push(content);
  const preview = parts.join('\n').slice(0, 400);
  return { preview, imageCount };
}

export function isFinalAssistantMessage(message: Pick<ChatVersionNativeMessage, 'role' | 'stopReason' | 'content'>): boolean {
  if (message.role !== 'assistant') return false;
  if (!['stop', 'length'].includes(message.stopReason ?? '')) return false;
  const content = message.content;
  if (!Array.isArray(content)) return true;
  return !content.some((part) => part && typeof part === 'object' && (part as { type?: string }).type === 'toolCall');
}

/** Bases allowed for regenerate: user turn or a completed (non-error) tool result. */
export function isRegenerateBaseMessage(message: Pick<ChatVersionNativeMessage, 'role' | 'isError'>): boolean {
  if (message.role === 'user') return true;
  return message.role === 'toolResult' && message.isError !== true;
}

/** Walk tip → root. Tip is the last entry that still appears in the parent chain of the file order. */
export function leafAncestorIds(messages: readonly ChatVersionNativeMessage[]): string[] {
  if (!messages.length) return [];
  const byId = new Map(messages.map((m) => [m.id, m]));
  const hasChild = new Set(messages.map((m) => m.parentId).filter((id): id is string => Boolean(id)));
  const tip = [...messages].reverse().find((m) => !hasChild.has(m.id)) ?? messages[messages.length - 1];
  const path: string[] = [];
  let current: ChatVersionNativeMessage | undefined = tip;
  const seen = new Set<string>();
  while (current) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    path.push(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path.reverse();
}

/** Entries owned by this run: after the continuation branch point, or the full leaf path. */
export function ownedLeafMessages(
  messages: readonly ChatVersionNativeMessage[],
  continuationEntryId?: string | null,
): ChatVersionNativeMessage[] | { unavailableReason: string } {
  const byId = new Map(messages.map((m) => [m.id, m]));
  const pathIds = leafAncestorIds(messages);
  if (!pathIds.length) return { unavailableReason: '原生会话尚无可用历史节点' };
  let start = 0;
  if (continuationEntryId) {
    const index = pathIds.indexOf(continuationEntryId);
    if (index < 0) return { unavailableReason: '接续节点不在当前会话路径上，版本操作暂不可用' };
    start = index + 1;
  }
  const owned = pathIds.slice(start).map((id) => byId.get(id)!).filter(Boolean);
  if (!owned.length) return { unavailableReason: '本次执行尚未留下可版本操作的原生消息' };
  return owned;
}

export function resolveVersionTargets(
  messages: readonly ChatVersionNativeMessage[],
  continuationEntryId?: string | null,
): ChatVersionTargets {
  const owned = ownedLeafMessages(messages, continuationEntryId);
  if ('unavailableReason' in owned) return owned;

  const pathIds = leafAncestorIds(messages);
  const afterCompaction = owned.some((m) => m.summaryKind === 'compaction');

  const users = owned.filter((m) => m.role === 'user');
  const user = users[0];
  let editResend: ChatVersionEditTarget | undefined;
  if (user) {
    const { preview, imageCount } = textPreview(user.content);
    const firstMessage = !user.parentId || !pathIds.slice(0, pathIds.indexOf(user.id)).some((id) => {
      const row = messages.find((m) => m.id === id);
      return row?.role === 'user' || row?.role === 'assistant' || row?.role === 'toolResult';
    });
    editResend = {
      kind: 'edit_resend',
      userEntryId: user.id,
      baseEntryId: firstMessage ? null : user.parentId,
      preview,
      imageCount,
      firstMessage,
    };
  }

  const finals = owned.filter((m) => isFinalAssistantMessage(m));
  const target = finals[finals.length - 1];
  let regenerate: ChatVersionRegenerateTarget | undefined;
  if (target) {
    const base = target.parentId ? messages.find((m) => m.id === target.parentId) : undefined;
    if (!base || !isRegenerateBaseMessage(base)) {
      return {
        editResend,
        unavailableReason: '无法构造合法重新生成基点：最终答复之前不是用户消息或已完成的工具结果',
      };
    }
    const { preview } = textPreview(target.content);
    const baseIndex = owned.findIndex((m) => m.id === base.id);
    const keptToolResults = owned
      .slice(0, baseIndex + 1)
      .filter((m) => m.role === 'toolResult' && m.isError !== true).length;
    regenerate = {
      kind: 'regenerate',
      targetEntryId: target.id,
      baseEntryId: base.id,
      baseRole: base.role as 'user' | 'toolResult',
      preview,
      keptToolResults,
      afterCompaction,
    };
  }

  if (!editResend && !regenerate) {
    return { unavailableReason: '本次执行没有可编辑重发或重新生成的原生锚点' };
  }
  return { editResend, regenerate };
}
