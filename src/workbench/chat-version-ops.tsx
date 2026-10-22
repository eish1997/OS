import React, { useEffect, useRef, useState } from 'react';
import type { Asset, Conversation, Run } from '../../shared/contracts';
import type { ChatVersionTargets } from '../../shared/chat-version-ops';
import { ApiError, request } from './client';

type Props = {
  projectId: string;
  run: Run;
  role: 'user' | 'assistant';
  hostText: string;
  assets: Asset[];
  taskAssetIds: string[];
  enabled: boolean;
  onOpen: (conversation: Conversation) => void;
  refresh: () => Promise<void>;
};

type Intent = {
  projectId: string;
  sourceId: string;
  kind: 'edit_resend' | 'regenerate';
  sourceHash: string;
  title: string;
  goal: string;
  assetIds: string[];
  commandId: string;
};

export function ChatVersionActions({
  projectId,
  run,
  role,
  hostText,
  assets,
  taskAssetIds,
  enabled,
  onOpen,
  refresh,
}: Props) {
  const key = `wb-version-v1:${projectId}:${run.id}:${role}`;
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'edit_resend' | 'regenerate' | null>(null);
  const [targets, setTargets] = useState<(ChatVersionTargets & { sourceHash?: string }) | null>(null);
  const [goal, setGoal] = useState(hostText);
  const [title, setTitle] = useState('');
  const [assetIds, setAssetIds] = useState<string[]>(taskAssetIds);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Intent | undefined>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || 'null');
      return saved?.projectId === projectId && typeof saved?.commandId === 'string' ? saved : undefined;
    } catch {
      return undefined;
    }
  });
  const [created, setCreated] = useState<Conversation>();
  const active = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (pending) {
      setKind(pending.kind);
      setOpen(true);
      setTitle(pending.title);
      setGoal(pending.goal);
      setAssetIds(pending.assetIds);
    }
  }, [pending]);

  async function loadTargets() {
    setBusy(true);
    setError('');
    try {
      const page = await request<ChatVersionTargets & { sourceHash?: string }>(
        `/runs/${encodeURIComponent(run.id)}/version-targets?projectId=${encodeURIComponent(projectId)}`,
        undefined,
        'GET',
      );
      if (mounted.current) setTargets(page);
      return page;
    } catch (e) {
      if (mounted.current) setError(String(e));
      return null;
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function begin(next: 'edit_resend' | 'regenerate') {
    const page = targets ?? (await loadTargets());
    if (!page) return;
    if (page.unavailableReason) {
      setError(page.unavailableReason);
      setKind(next);
      setOpen(true);
      return;
    }
    if (next === 'edit_resend' && !page.editResend) {
      setError('当前执行没有可编辑重发的用户输入');
      setKind(next);
      setOpen(true);
      return;
    }
    if (next === 'regenerate' && !page.regenerate) {
      setError('当前执行没有可重新生成的最终答复');
      setKind(next);
      setOpen(true);
      return;
    }
    setKind(next);
    setTitle(next === 'edit_resend' ? `编辑重发 · ${new Date().toLocaleString()}` : `重新生成 · ${new Date().toLocaleString()}`);
    if (next === 'edit_resend') {
      setGoal(hostText);
      setAssetIds(taskAssetIds);
    } else {
      setGoal('重新生成答复（保留已完成工具结果，排除旧答案）');
    }
    setOpen(true);
    setTargets(page);
  }

  async function submit(next: 'edit_resend' | 'regenerate') {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setError('');
    const page = targets ?? (await loadTargets());
    if (!page?.sourceHash) {
      setError(page?.unavailableReason || '无法读取版本目标');
      active.current = false;
      setBusy(false);
      return;
    }
    const intent =
      pending ??
      ({
        projectId,
        sourceId: run.id,
        kind: next,
        sourceHash: page.sourceHash,
        title: title.trim(),
        goal: goal.trim(),
        assetIds: next === 'edit_resend' ? assetIds : [],
        commandId: crypto.randomUUID(),
      } satisfies Intent);
    try {
      localStorage.setItem(key, JSON.stringify(intent));
      setPending(intent);
      const result = await request<{ conversation: Conversation }>(`/runs/${encodeURIComponent(intent.sourceId)}/version`, intent);
      if (mounted.current) {
        setCreated(result.conversation);
        setPending(undefined);
        localStorage.removeItem(key);
        await refresh();
      }
    } catch (e) {
      if (mounted.current) {
        if (e instanceof ApiError && e.status < 500) {
          localStorage.removeItem(key);
          setPending(undefined);
        }
        setError(String(e));
      }
    } finally {
      active.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const activeKind = pending?.kind || kind;
  const canEdit = role === 'user' && ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status);
  const canRegen = role === 'assistant' && ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status);
  if (!canEdit && !canRegen && !pending && !created) return null;

  return (
    <>
      {canEdit && (
        <button
          type="button"
          className="wb-chat-hit"
          data-chat-edit-resend={run.id}
          disabled={busy || !enabled}
          onClick={() => void begin('edit_resend')}
        >
          编辑重发
        </button>
      )}
      {canRegen && (
        <button
          type="button"
          className="wb-chat-hit"
          data-chat-regenerate={run.id}
          disabled={busy || !enabled}
          onClick={() => void begin('regenerate')}
        >
          重新生成
        </button>
      )}
      {(open || pending || created) && (
        <div className="wb-version-form" data-chat-version-form role="region" aria-label="版本操作">
          {created ? (
            <>
              <p role="status">已创建独立副本：{created.title}</p>
              <button type="button" className="wb-chat-hit" data-chat-version-open onClick={() => onOpen(created)}>
                打开新话题
              </button>
            </>
          ) : (
            <>
              <p className="wb-caption">
                {activeKind === 'regenerate'
                  ? '重新生成答复：保留原用户输入与已完成工具结果，排除旧答案；会创建新执行并按任务额度记账，不是免费刷新。'
                  : '编辑重发：以该次输入之前的上下文为基点；修改指令会触发新一轮工具执行。原话题保留。'}
              </p>
              {targets?.regenerate && activeKind === 'regenerate' && (
                <p className="wb-caption" data-chat-version-tool-base>
                  基点：{targets.regenerate.baseRole}
                  {targets.regenerate.keptToolResults
                    ? ` · 保留 ${targets.regenerate.keptToolResults} 个已完成工具结果`
                    : ' · 无工具轮次'}
                  {targets.regenerate.afterCompaction ? ' · 位于压缩之后' : ''}
                </p>
              )}
              {targets?.editResend && activeKind === 'edit_resend' && (
                <p className="wb-caption" data-chat-version-edit-base>
                  {targets.editResend.firstMessage ? '首条输入，空历史基点' : `基点节点 ${targets.editResend.baseEntryId}`}
                  {targets.editResend.imageCount ? ` · 原输入含 ${targets.editResend.imageCount} 张图` : ''}
                </p>
              )}
              <label>
                新话题名称
                <input
                  aria-label="版本话题名称"
                  maxLength={120}
                  value={title}
                  disabled={busy || !!pending}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              {activeKind === 'edit_resend' && (
                <>
                  <label>
                    修改后的指令
                    <textarea
                      aria-label="编辑重发指令"
                      value={goal}
                      disabled={busy || !!pending}
                      onChange={(e) => setGoal(e.target.value)}
                    />
                  </label>
                  <div className="wb-attachments" aria-label="继承附件">
                    {taskAssetIds.length === 0 && <p className="wb-caption">原输入无资料附件</p>}
                    {taskAssetIds.map((id) => {
                      const asset = assets.find((a) => a.id === id);
                      const kept = assetIds.includes(id);
                      return (
                        <label key={id} className="wb-attachment-chip" data-version-asset={id}>
                          <input
                            type="checkbox"
                            checked={kept}
                            disabled={busy || !!pending || asset?.status !== 'ready'}
                            onChange={(e) =>
                              setAssetIds((ids) => (e.target.checked ? [...new Set([...ids, id])] : ids.filter((x) => x !== id)))
                            }
                          />
                          <strong>{asset?.name || id.slice(0, 8)}</strong>
                          <small>{asset?.status === 'ready' ? '可继承' : '不可用'}</small>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
              {pending && <p role="status">提交结果待确认：{pending.title}。重试使用同一命令。</p>}
              <button
                type="button"
                className="wb-chat-hit"
                data-chat-version-submit
                disabled={
                  busy ||
                  (!pending && (!enabled || !title.trim() || (activeKind === 'edit_resend' && !goal.trim()) || !activeKind))
                }
                onClick={() => void submit(pending?.kind || activeKind || 'edit_resend')}
              >
                {busy ? '处理中…' : pending ? '重试版本操作' : activeKind === 'regenerate' ? '创建并重新生成' : '创建并编辑重发'}
              </button>
              <button type="button" className="wb-chat-hit" disabled={busy} onClick={() => setOpen(false)}>
                收起
              </button>
            </>
          )}
          {error && (
            <p role="alert" data-chat-version-error>
              {error}
            </p>
          )}
        </div>
      )}
    </>
  );
}
