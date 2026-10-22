import { NativeImportPanel } from './native-import';
import { ConversationBranch } from './conversation-branch';
import { ImageUpload, type ImageUploadHandle } from './image-upload';
import { MessageImages } from './message-images';
import { PluginRunDetails } from './plugin-run-details';
import { PiRunSettings } from './pi-settings';
import { ChatConnectionPanel, type ChatConnectionMode } from './chat-connection';
import { ChatTopicBar } from './chat-topics';
import { ChatVersionActions } from './chat-version-ops';
import React, { useEffect, useRef, useState } from 'react';
import type { Conversation, ConversationMessage, ConversationPage, Snapshot } from '../../shared/contracts';
import { isOperationalRun } from '../../shared/chat-visible-runs';
import { CHAT_UI_DESIGN } from '../../shared/chat-ui-design';
import { buildChatTurns, messageAnchor, shouldApplyHistoryPage } from '../../shared/chat-turn-model';
import type { WindowInstance } from '../../shared/workbench-layout';
import { ApiError, request } from './client';
import type { ViewPatch } from './window-contract';
import { ChatMarkdown, copyMessageText } from './chat-markdown';

const runLabels: Record<string, string> = {
  queued: '排队中',
  running: '执行中',
  waiting_interaction: '等待用户答复',
  waiting_user: '等待配置',
  waiting_node: '等待节点',
  completed: '已完成',
  failed: '执行失败',
  cancelled: '已取消',
  interrupted: '中断待核对',
};

const followUpLabels: Record<string, string> = {
  queued: '已排队，等待接续',
  running: '追问已开始',
  waiting_interaction: '等待用户答复',
  waiting_user: '等待运行条件',
  waiting_node: '等待执行节点',
  completed: '本次追问执行结束',
  failed: '追问未能完成',
  cancelled: '已取消追问',
  interrupted: '追问中断待核对',
};

const inputStateLabels: Record<string, string> = {
  accepted: '已接收，等待送达',
  queued: '等待原生轮次',
  applied: '已进入当前轮次',
  handled: '插件已接管处理',
  not_applied: '未应用',
  unknown: '状态待核对',
};

const phaseLabels: Record<string, string> = {
  partial: '正在生成…',
  error: '这段回复未正常完成',
  cancelled: '这段回复已停止',
  interrupted: '执行已中断，保留已收到内容',
};

type Props = {
  window: WindowInstance;
  snapshot?: Snapshot;
  patch: (value: ViewPatch) => void;
  refresh: () => Promise<void>;
  conversation?: Conversation;
  onOpen?: (c: Conversation) => void;
  onSwitch?: (c: Conversation) => void;
  onTitle?: (title: string) => void;
  onFocusChat?: () => void;
  onRestoreChat?: () => void;
  chatFocused?: boolean;
};

export function ChatPane({
  window: w,
  snapshot,
  patch,
  refresh,
  conversation,
  onOpen,
  onSwitch,
  onTitle,
  onFocusChat,
  onRestoreChat,
  chatFocused,
}: Props) {
  const [history, setHistory] = useState<ConversationPage>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [showJumpLatest, setShowJumpLatest] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [showAllRuns, setShowAllRuns] = useState(false);
  const [connectionMode, setConnectionMode] = useState<ChatConnectionMode | null>(null);
  const [branchPreset, setBranchPreset] = useState<string>('');
  const [branchForceOpen, setBranchForceOpen] = useState(false);
  const [importForceOpen, setImportForceOpen] = useState(false);
  const [toolsVisible, setToolsVisible] = useState(false);
  const historyRef = useRef(history);
  historyRef.current = history;
  const historyGeneration = useRef(0);
  const appliedHistory = useRef(0);
  const project = snapshot?.projects.find((p) => p.id === w.binding.projectId);
  const conversationId = w.binding.conversationId;
  const runs = snapshot?.runs.filter((r) => r.conversationId === conversationId) || [];
  /** layout-v2: activity band shows operational runs only; closed history via ⋯ → 全部执行历史 */
  const displayedRuns = showAllRuns ? [...runs] : runs.filter(isOperationalRun);
  const turns = buildChatTurns(history?.messages || [], runs);
  const callsRemaining = snapshot?.config.callsRemaining;
  const budgetUsd = snapshot?.config.budgetUsd;
  const authMode = snapshot?.config.authMode;
  const limitScope = snapshot?.config.limitScope;
  const accountedUsd =
    authMode === 'api'
      ? runs.reduce((sum, run) => sum + (run.spentUsd || 0) + (run.reservedUsd || 0), 0)
      : undefined;
  const nearCallLimit = typeof callsRemaining === 'number' && Number.isFinite(callsRemaining) && callsRemaining <= 1;
  const nearBudgetLimit =
    authMode === 'api' &&
    typeof budgetUsd === 'number' &&
    Number.isFinite(budgetUsd) &&
    budgetUsd > 0 &&
    typeof accountedUsd === 'number' &&
    accountedUsd >= budgetUsd * 0.8;
  const nearLimit = nearCallLimit || nearBudgetLimit;
  const limitSummary =
    authMode === 'chatgpt'
      ? `连接剩余约 ${callsRemaining ?? '未知'} 次模型请求${limitScope === 'task' ? '（按任务额度）' : ''}`
      : [
          typeof callsRemaining === 'number' && Number.isFinite(callsRemaining)
            ? `剩余约 ${callsRemaining} 次`
            : '请求剩余未知',
          typeof budgetUsd === 'number' && Number.isFinite(budgetUsd)
            ? `费用含预留约 $${(accountedUsd ?? 0).toFixed(4)} / $${budgetUsd.toFixed(4)}`
            : '费用上限未知',
        ].join(' · ');
  const input = String(w.view.input || '');
  const assetIds = (Array.isArray(w.view.assetIds) ? w.view.assetIds : []).filter(
    (id): id is string => typeof id === 'string',
  );
  const activeRun = [...runs]
    .reverse()
    .find(
      (r) =>
        r.mode === 'pi' &&
        (r.status === 'running' || r.status === 'waiting_interaction') &&
        !r.cancelRequested &&
        !r.timedOutAt &&
        r.sessionAction !== 'compact',
    );
  const thread = useRef<HTMLDivElement>(null);
  const uploadRef = useRef<ImageUploadHandle>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const draftKey = `wb-chat-draft-v1:${w.id}:${conversationId}`;
  useEffect(() => {
    if (!input) {
      try {
        const draft = localStorage.getItem(draftKey) || localStorage.getItem(`wb-chat-reopen-v1:${conversationId}`);
        if (draft) patch({ input: draft });
      } catch {
        /* ignore */
      }
    }
  }, []);
  const edit = (value: string) => {
    patch({ input: value });
    try {
      if (value) {
        localStorage.setItem(draftKey, value);
        localStorage.setItem(`wb-chat-reopen-v1:${conversationId}`, value);
      } else {
        localStorage.removeItem(draftKey);
        localStorage.removeItem(`wb-chat-reopen-v1:${conversationId}`);
      }
    } catch {
      setError('本地草稿缓存不可用，请保留窗口直到布局保存成功');
    }
  };
  useEffect(() => {
    if (!conversationId) return;
    const generation = ++historyGeneration.current;
    const c = new AbortController();
    request<ConversationPage>(`/conversations/${conversationId}/messages`, undefined, 'GET', c.signal)
      .then((page) => {
        if (!shouldApplyHistoryPage(generation, appliedHistory.current)) return;
        appliedHistory.current = generation;
        setHistory((old) => {
          const earlier = old?.messages.filter((m) => m.sequence < (page.messages[0]?.sequence ?? Infinity)) || [];
          return { messages: [...earlier, ...page.messages], olderThan: earlier.length ? old?.olderThan : page.olderThan };
        });
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(String(e));
      });
    return () => c.abort();
  }, [conversationId, snapshot?.cursor]);

  const stickToBottom = useRef(w.view.stickToBottom !== false);
  const scrollRestored = useRef(false);
  const lastScrollTop = useRef(0);
  const suppressScroll = useRef(false);
  const jumpVisible = useRef(false);
  const scrollPatchTimer = useRef(0);
  const suppressScrollTimer = useRef(0);
  const armScrollSuppress = (ms = 320) => {
    suppressScroll.current = true;
    window.clearTimeout(suppressScrollTimer.current);
    suppressScrollTimer.current = window.setTimeout(() => {
      suppressScroll.current = false;
    }, ms);
  };
  const setJumpLatest = (want: boolean) => {
    if (jumpVisible.current === want) return;
    jumpVisible.current = want;
    setShowJumpLatest(want);
  };
  const distanceFromBottom = (el: HTMLElement) => el.scrollHeight - el.scrollTop - el.clientHeight;
  const pinHistoryToBottom = (persist = true) => {
    const el = thread.current;
    if (!el) return;
    stickToBottom.current = true;
    setJumpLatest(false);
    armScrollSuppress(320);
    el.scrollTop = el.scrollHeight;
    lastScrollTop.current = el.scrollTop;
    if (persist) patch({ stickToBottom: true, scroll: el.scrollTop });
  };
  useEffect(() => {
    scrollRestored.current = false;
    stickToBottom.current = w.view.stickToBottom !== false;
    jumpVisible.current = !stickToBottom.current;
    setShowJumpLatest(jumpVisible.current);
  }, [conversationId]);
  useEffect(() => {
    const el = thread.current;
    if (!el || !history) return;
    if (!scrollRestored.current) {
      armScrollSuppress(320);
      el.scrollTop = stickToBottom.current ? el.scrollHeight : Number(w.view.scroll) || 0;
      lastScrollTop.current = el.scrollTop;
      scrollRestored.current = true;
      setJumpLatest(!stickToBottom.current);
      return;
    }
    if (stickToBottom.current) pinHistoryToBottom(false);
  }, [history?.messages.length, history?.messages.at(-1)?.text, history?.messages.at(-1)?.phase]);
  useEffect(
    () => () => {
      window.clearTimeout(scrollPatchTimer.current);
      window.clearTimeout(suppressScrollTimer.current);
    },
    [],
  );

  async function older() {
    if (!history?.olderThan || !thread.current) return;
    setLoadingOlder(true);
    const generation = ++historyGeneration.current;
    const el = thread.current;
    const firstId = history.messages[0]?.id;
    const beforeTop = firstId
      ? (el.querySelector(`[data-message-id="${CSS.escape(firstId)}"]`) as HTMLElement | null)?.getBoundingClientRect().top
      : undefined;
    const historyTop = el.getBoundingClientRect().top;
    try {
      const page = await request<ConversationPage>(
        `/conversations/${conversationId}/messages?before=${history.olderThan}`,
      );
      if (!shouldApplyHistoryPage(generation, appliedHistory.current)) return;
      appliedHistory.current = generation;
      setHistory((old) => ({
        messages: [...page.messages, ...(old?.messages || [])].filter(
          (m, i, all) => all.findIndex((x) => x.id === m.id) === i,
        ),
        olderThan: page.olderThan,
      }));
      requestAnimationFrame(() => {
        if (!thread.current || beforeTop === undefined || !firstId) return;
        const after = thread.current.querySelector(`[data-message-id="${CSS.escape(firstId)}"]`) as HTMLElement | null;
        if (!after) return;
        const delta = after.getBoundingClientRect().top - historyTop - (beforeTop - historyTop);
        if (Math.abs(delta) > CHAT_UI_DESIGN.scroll.anchorOffsetTolerancePx) thread.current.scrollTop += delta;
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingOlder(false);
    }
  }

  const composerExpanded = Boolean(w.view.composerExpanded);
  const runAction = (w.view.runAction === 'steer' ? 'steer' : 'queue') as 'queue' | 'steer';
  const pureImageBlocked = assetIds.length > 0 && !input.trim();
  const primaryKind: 'task' | 'steer' = activeRun && runAction === 'steer' ? 'steer' : 'task';
  const actionLabel = busy
    ? '提交中…'
    : w.view.pending
      ? '重试提交'
      : !activeRun
        ? '发送 ↑'
        : primaryKind === 'steer'
          ? '指导当前执行'
          : '排队追问';

  function acceptIncomingFiles(list: FileList | File[] | null | undefined) {
    if (!list || busy || Boolean(w.view.pending)) return;
    const files = [...list];
    if (!files.length) return;
    void uploadRef.current?.uploadFiles(files);
  }

  const resizeComposer = (el: HTMLTextAreaElement) => {
    if (composerExpanded) {
      el.style.height = '';
      return;
    }
    el.style.height = 'auto';
    const line = Number.parseFloat(getComputedStyle(el).lineHeight) || 22;
    const max = line * CHAT_UI_DESIGN.composer.maxAutoRows;
    el.style.height = `${Math.min(Math.max(el.scrollHeight, line * CHAT_UI_DESIGN.composer.initialRows), max)}px`;
  };

  async function send(kind: 'task' | 'steer' = primaryKind) {
    if (busy || !conversationId) return;
    if (!input.trim()) {
      if (assetIds.length) setError(CHAT_UI_DESIGN.pureImagePrompt);
      return;
    }
    if (kind === 'steer' && (!activeRun || assetIds.length)) {
      setError('指导当前执行仅支持文字，请移除附件或选择排队追问');
      return;
    }
    setBusy(true);
    setError('');
    const pending = w.view.pending as
      | { commandId: string; goal: string; assetIds: string[]; kind?: 'task' | 'steer'; targetRunId?: string }
      | undefined;
    const command =
      pending || {
        commandId: crypto.randomUUID(),
        goal: input,
        assetIds: [...assetIds],
        kind,
        targetRunId: kind === 'steer' ? activeRun?.id : undefined,
      };
    patch({ pending: command });
    try {
      if (command.kind === 'steer') {
        await request(`/runs/${encodeURIComponent(command.targetRunId!)}/steer`, {
          conversationId,
          commandId: command.commandId,
          text: command.goal,
        });
      } else {
        await request('/tasks', {
          projectId: w.binding.projectId,
          conversationId,
          goal: command.goal,
          commandId: command.commandId,
          assetIds: command.assetIds,
          mode: 'pi',
        });
      }
      patch((current) => ({
        pending: undefined,
        input: current.input === command.goal ? '' : current.input,
        assetIds: (Array.isArray(current.assetIds) ? current.assetIds : []).filter(
          (id) => !command.assetIds.includes(String(id)),
        ),
      }));
      try {
        if (localStorage.getItem(draftKey) === command.goal) localStorage.removeItem(draftKey);
        if (localStorage.getItem(`wb-chat-reopen-v1:${conversationId}`) === command.goal) {
          localStorage.removeItem(`wb-chat-reopen-v1:${conversationId}`);
        }
      } catch {
        /* ignore */
      }
      await refresh();
    } catch (e) {
      const rejected = e instanceof ApiError && e.status < 500;
      if (rejected) patch({ pending: undefined });
      if (mounted.current) {
        setError(
          `${rejected ? '请求被拒绝，请修改后重新提交。' : '提交未确认，重试将使用同一命令，避免重复任务。'}${String(e)}`,
        );
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  if (!project || !conversationId) {
    return <div className="wb-empty">对话绑定不可用，请从窗口库重新打开对话。</div>;
  }

  const hasNative = runs.some((r) => Boolean(r.sessionId));

  function quoteSelection(message: ConversationMessage) {
    const selection = window.getSelection()?.toString().trim();
    const body = selection || message.text.trim();
    if (!body) {
      setError('没有可引用的文字');
      return;
    }
    const who = message.role === 'user' ? '你' : 'Pi';
    const stamp = new Date(message.at).toLocaleString();
    const block = `> （引用来自 ${who} · ${stamp} · 消息 ${message.id.slice(0, 8)}）\n> ${body.replace(/\n/g, '\n> ')}\n\n`;
    edit(`${input ? `${input.replace(/\s+$/, '')}\n\n` : ''}${block}`);
  }

  function focusRun(runId: string) {
    setShowAllRuns(true);
    requestAnimationFrame(() => {
      const card = document.querySelector(
        `.wb-chat-pane .wb-chat-runs > [data-run-id="${CSS.escape(runId)}"]`,
      ) as HTMLElement | null;
      card?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      card?.classList.add('is-run-flash');
      window.setTimeout(() => card?.classList.remove('is-run-flash'), 1200);
    });
  }

  async function locateSearchHit(messageId: string, _sequence: number) {
    const anchor = () =>
      document.querySelector(`.wb-chat-pane [data-message-id="${CSS.escape(messageId)}"]`) as HTMLElement | null;
    for (let guard = 0; guard < 24; guard += 1) {
      const node = anchor();
      if (node) {
        stickToBottom.current = false;
        setShowJumpLatest(true);
        node.scrollIntoView({ block: 'center', behavior: 'smooth' });
        node.classList.add('is-message-flash');
        window.setTimeout(() => node.classList.remove('is-message-flash'), 1400);
        return;
      }
      if (!historyRef.current?.olderThan) break;
      await older();
    }
    setError('命中消息不在当前已加载历史，请继续加载更早消息后重试');
  }

  const showActivityBand = runs.some(isOperationalRun) || showAllRuns;

  return (
    <div className="wb-chat-pane" data-chat-design={CHAT_UI_DESIGN.version} data-chat-layout="v2">
      {conversation && (onSwitch || onOpen) ? (
        <ChatTopicBar
          projectId={project.id}
          conversation={conversation}
          windowTitle={w.title}
          modelConfigured={Boolean(snapshot?.config.modelConfigured)}
          modelLabel={snapshot?.config.model || '模型未配置'}
          chatFocused={chatFocused}
          showAllRuns={showAllRuns}
          runCount={runs.length}
          onOpen={onSwitch || onOpen!}
          onTitleChanged={(title) => onTitle?.(title)}
          onLocateMessage={(messageId, sequence) => void locateSearchHit(messageId, sequence)}
          onOpenSettings={(mode) => setConnectionMode(mode)}
          onFocusChat={onFocusChat}
          onRestoreChat={onRestoreChat}
          onToggleAllRuns={() => setShowAllRuns((value) => !value)}
          onRevealTools={(which) => {
            setToolsVisible(true);
            if (which === 'branch') {
              setBranchForceOpen(true);
              requestAnimationFrame(() => {
                document.querySelector('[data-chat-branch-panel]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
              });
            } else if (which === 'import') {
              setImportForceOpen(true);
              requestAnimationFrame(() => {
                document.querySelector('[data-chat-import-panel]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
              });
            } else {
              setShowAllRuns(true);
              requestAnimationFrame(() => {
                const target = [...document.querySelectorAll('.wb-chat-runs button')].find((el) =>
                  /压缩上下文/.test(el.textContent || ''),
                );
                target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                if (!target) setError('请先完成一次可接续的执行，再在该执行卡片中使用「压缩上下文」。压缩会触发模型请求。');
              });
            }
          }}
          refresh={refresh}
        />
      ) : (
        <div className="wb-chat-chrome wb-chat-chrome-solo">
          {chatFocused && onRestoreChat ? (
            <button type="button" className="wb-chat-hit" data-chat-restore onClick={onRestoreChat}>
              还原位置
            </button>
          ) : onFocusChat ? (
            <button type="button" className="wb-chat-hit" data-chat-focus onClick={onFocusChat}>
              {CHAT_UI_DESIGN.defaultPlacement.focusActionLabel}
            </button>
          ) : null}
        </div>
      )}
      <div className="wb-chat-thread">
        {showJumpLatest && (
          <button type="button" className="wb-chat-jump-latest wb-chat-hit" onClick={() => pinHistoryToBottom(true)}>
            回到最新
          </button>
        )}
        <div
          className="wb-chat-history"
          ref={thread}
          onScroll={(e) => {
            if (suppressScroll.current) return;
            const el = e.currentTarget;
            const fromBottom = distanceFromBottom(el);
            // Hysteresis: leave bottom only when clearly away; re-enter within 64px
            if (fromBottom > 120) stickToBottom.current = false;
            else if (fromBottom < 64) stickToBottom.current = true;
            lastScrollTop.current = el.scrollTop;
            setJumpLatest(!stickToBottom.current);
            window.clearTimeout(scrollPatchTimer.current);
            scrollPatchTimer.current = window.setTimeout(() => {
              if (!thread.current) return;
              patch({
                scroll: thread.current.scrollTop,
                stickToBottom: stickToBottom.current,
              });
            }, 180);
          }}
        >
        {(toolsVisible || branchForceOpen || importForceOpen) && (
          <div data-chat-topic-tools className="wb-chat-topic-tools">
            <NativeImportPanel
              key={project.id}
              projectId={project.id}
              forceOpen={importForceOpen}
              onOpen={
                onOpen
                  ? (c) => {
                      void refresh()
                        .then(() => onOpen(c))
                        .catch((e) => setError(String(e)));
                    }
                  : undefined
              }
            />
            {onOpen && conversation && (
              <ConversationBranch
                projectId={project.id}
                conversation={conversation}
                runs={runs}
                onOpen={onOpen}
                onOpenSource={onSwitch || onOpen}
                refresh={refresh}
                enabled={Boolean(snapshot?.config.modelConfigured)}
                presetSource={branchPreset || undefined}
                forceOpen={branchForceOpen}
              />
            )}
          </div>
        )}
        {history?.olderThan && (
          <button type="button" disabled={loadingOlder} onClick={() => void older()}>
            更早的消息
          </button>
        )}
        {turns.map((turn) => (
          <section
            key={turn.turnId}
            className="wb-chat-turn"
            data-turn-id={turn.turnId}
            data-run-id={turn.runId}
            data-turn-operational={turn.operational ? '1' : '0'}
            data-native-entry-state={turn.nativeEntryState}
          >
            {turn.messages.map((m) => {
              const anchor = messageAnchor(m, runs, hasNative);
              return (
                <article
                  key={m.id}
                  className={`wb-message ${m.role}`}
                  data-message-id={m.id}
                  data-host-sequence={anchor.hostSequence}
                  data-turn-id={anchor.turnId}
                  data-run-id={anchor.runId}
                  data-native-entry-state={anchor.nativeEntryState}
                >
                  <header className="wb-message-head">
                    <span className="wb-message-role">{m.role === 'user' ? '你' : 'Pi'}</span>
                    <time className="wb-message-time" dateTime={m.at}>
                      {new Date(m.at).toLocaleTimeString()}
                    </time>
                  </header>
                  <div className="wb-message-body">
                    <ChatMarkdown text={m.text} />
                    <MessageImages images={m.images} />
                    {!!m.images?.length && (
                      <div className="wb-message-results" aria-label="本条附件成果">
                        {m.images.map((image) => (
                          <a
                            key={image.assetId}
                            className="wb-result-card"
                            href={image.url || `/api/assets/${encodeURIComponent(image.assetId)}`}
                            target="_blank"
                            rel="noreferrer"
                            data-result-asset={image.assetId}
                          >
                            <strong>{image.name}</strong>
                            <small>打开预览 / 下载</small>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="wb-message-actions" data-message-actions>
                    {m.runId && (
                      <button
                        type="button"
                        className="wb-chat-hit"
                        data-chat-branch-from-message={m.id}
                        onClick={() => {
                          setToolsVisible(true);
                          setBranchPreset(m.runId!);
                          setBranchForceOpen(true);
                          requestAnimationFrame(() => {
                            document
                              .querySelector('[data-chat-branch-panel]')
                              ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                          });
                        }}
                      >
                        从此分支
                      </button>
                    )}
                    {m.runId &&
                      (() => {
                        const versionRun = runs.find((r) => r.id === m.runId);
                        if (!versionRun || !project || !onOpen) return null;
                        const task = snapshot?.tasks.find((t) => t.id === versionRun.taskId);
                        return (
                          <ChatVersionActions
                            projectId={project.id}
                            run={versionRun}
                            role={m.role}
                            hostText={m.text}
                            assets={snapshot?.assets || []}
                            taskAssetIds={task?.context.assetIds || []}
                            enabled={!busy && Boolean(snapshot?.config.modelConfigured)}
                            onOpen={onSwitch || onOpen}
                            refresh={refresh}
                          />
                        );
                      })()}
                    <button
                      type="button"
                      className="wb-chat-hit"
                      data-chat-copy-message
                      onClick={async () => {
                        const ok = await copyMessageText(m.text);
                        if (!ok) setError('复制失败，请手动选择文字');
                      }}
                    >
                      复制
                    </button>
                    <button type="button" className="wb-chat-hit" data-chat-quote-message onClick={() => quoteSelection(m)}>
                      引用
                    </button>
                    {m.runId && (
                      <button type="button" className="wb-chat-hit" data-chat-focus-run onClick={() => focusRun(m.runId!)}>
                        定位执行
                      </button>
                    )}
                  </div>
                  {m.followUp &&
                    !['completed', 'cancelled'].includes(m.followUp.state) && (
                      <small className="wb-message-status" role="status">
                        排队追问 · {followUpLabels[m.followUp.state] || m.followUp.state}
                        {m.followUp.reason ? ` · ${m.followUp.reason}` : ''}
                      </small>
                    )}
                  {m.inputState &&
                    !['applied', 'handled'].includes(m.inputState) && (
                      <small className="wb-message-status" role="status">
                        指导 · {inputStateLabels[m.inputState] || m.inputState}
                        {m.inputReason ? ` · ${m.inputReason}` : ''}
                      </small>
                    )}
                  {m.phase && m.phase !== 'final' && (
                    <small className="wb-message-status" role="status">
                      {phaseLabels[m.phase] || m.phase}
                    </small>
                  )}
                  {m.fullTextUrl && (
                    <a className="wb-message-more" href={m.fullTextUrl} target="_blank" rel="noreferrer">
                      查看完整回复
                    </a>
                  )}
                </article>
              );
            })}
          </section>
        ))}
        {!history?.messages.length && (
          <div className="wb-empty">
            <h3>开始一段独立对话</h3>
            <p>当前项目内保持独立对话，切换项目会保留草稿。</p>
          </div>
        )}
        </div>
      </div>
      {showActivityBand && (
        <div
          className="wb-chat-runs"
          data-chat-activity-band
          data-visible-run-count={displayedRuns.length}
          data-show-all-runs={showAllRuns ? '1' : '0'}
        >
          {showAllRuns && (
            <div className="wb-chat-runs-toolbar">
              <button
                type="button"
                className="wb-chat-hit"
                data-chat-all-runs
                aria-pressed={showAllRuns}
                onClick={() => setShowAllRuns(false)}
              >
                收起执行历史（{runs.length}）
              </button>
            </div>
          )}
          {displayedRuns.map((r) => (
            <div key={r.id} data-run-id={r.id} data-run-status={r.status}>
              <span>
                {runLabels[r.status]}
                {r.cancelRequested && r.status !== 'cancelled' ? ' · 正在停止' : ''}
                {r.error ? ` · ${r.error}` : ''}
              </span>
              <PluginRunDetails run={r} />
              <PiRunSettings run={r} />
              {(['running', 'waiting_interaction', 'queued', 'waiting_user', 'waiting_node'].includes(r.status) ||
                r.cancelRequested) &&
                r.status !== 'cancelled' && (
                  <button
                    type="button"
                    className="wb-chat-hit"
                    data-run-stop={r.id}
                    disabled={r.cancelRequested}
                    aria-busy={r.cancelRequested || undefined}
                    onClick={async () => {
                      if (r.cancelRequested) return;
                      try {
                        await request(`/runs/${r.id}/cancel`, {});
                        await refresh();
                      } catch (e) {
                        setError(String(e));
                      }
                    }}
                  >
                    {r.cancelRequested ? '正在停止…' : '停止'}
                  </button>
                )}
            </div>
          ))}
        </div>
      )}
      {error && (
        <p className="wb-inline-error" role="alert">
          {error}
        </p>
      )}
      <div
        className={`wb-chat-composer${composerExpanded ? ' is-expanded' : ''}${dragOver ? ' is-drop-target' : ''}`}
        data-chat-dropzone
        onDragEnter={(e) => {
          if ([...e.dataTransfer.types].includes('Files')) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragOver={(e) => {
          if ([...e.dataTransfer.types].includes('Files')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            setDragOver(true);
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          acceptIncomingFiles(e.dataTransfer.files);
        }}
      >
        <ImageUpload
          ref={uploadRef}
          key={conversationId}
          conversationId={conversationId}
          projectId={project.id}
          disabled={busy || Boolean(w.view.pending)}
          onBusy={setBusy}
          onError={setError}
          onUploaded={(asset) => {
            patch((current) => ({
              assetIds: [...new Set([...(Array.isArray(current.assetIds) ? current.assetIds : []), asset.id])],
            }));
            void refresh();
          }}
        />
        {!!assetIds.length && (
          <div className="wb-attachments" aria-label="待发送附件">
            {assetIds.map((id) => {
              const asset = snapshot?.assets.find((a) => a.id === id);
              const image = asset?.mime.startsWith('image/');
              return (
                <div
                  key={id}
                  className="wb-attachment-chip"
                  data-attachment-id={id}
                  data-attachment-mime={asset?.mime || ''}
                >
                  {image ? (
                    <img src={`/api/assets/${encodeURIComponent(id)}`} alt="" loading="lazy" />
                  ) : (
                    <span className="wb-attachment-glyph" aria-hidden="true">
                      档
                    </span>
                  )}
                  <div className="wb-attachment-meta">
                    <strong>{asset?.name || '资料不可用'}</strong>
                    <small>{asset ? `${asset.mime} · ${asset.size} B` : '归属待核对'}</small>
                  </div>
                  <button
                    type="button"
                    className="wb-chat-hit"
                    aria-label={`移除附件 ${asset?.name || id}`}
                    onClick={() => patch({ assetIds: assetIds.filter((x) => x !== id) })}
                  >
                    移除
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {pureImageBlocked && (
          <p className="wb-caption" role="status" data-chat-pure-image-hint>
            {CHAT_UI_DESIGN.pureImagePrompt}
          </p>
        )}
        {nearLimit && (
          <>
            <p className="wb-caption wb-chat-limit-line is-near" role="status" data-chat-limit-hint>
              {nearCallLimit
                ? `连接剩余约 ${callsRemaining} 次模型请求，接近上限`
                : `已确认用量加预留已达费用上限约 80%（$${accountedUsd!.toFixed(4)} / $${budgetUsd!.toFixed(4)}）`}
            </p>
            <p
              className="wb-caption wb-chat-limit-line"
              data-chat-limit-summary
              title="详情见各执行的「模型请求」与「追加额度后恢复」"
            >
              提交前限制：{limitSummary}
            </p>
          </>
        )}
        {dragOver && (
          <p className="wb-caption" role="status" data-chat-drop-hint>
            松开以附加图片
          </p>
        )}
        {activeRun && (
          <div className="wb-chat-run-actions" role="radiogroup" aria-label="运行中提交方式">
            <label>
              <input
                type="radio"
                name={`run-action-${w.id}`}
                checked={runAction === 'queue'}
                onChange={() => patch({ runAction: 'queue' })}
              />
              排队追问
            </label>
            <label>
              <input
                type="radio"
                name={`run-action-${w.id}`}
                checked={runAction === 'steer'}
                disabled={assetIds.length > 0}
                onChange={() => patch({ runAction: 'steer' })}
              />
              指导当前执行
            </label>
          </div>
        )}
        <textarea
          aria-label="对话输入"
          rows={CHAT_UI_DESIGN.composer.initialRows}
          value={input}
          placeholder="告诉 Pi 你想完成什么… 也可粘贴或拖入图片"
          onChange={(e) => {
            edit(e.target.value);
            resizeComposer(e.currentTarget);
          }}
          onInput={(e) => resizeComposer(e.currentTarget)}
          ref={(el) => {
            if (el) resizeComposer(el);
          }}
          onPaste={(e) => {
            const files = [...e.clipboardData.files];
            if (!files.length) return;
            e.preventDefault();
            acceptIncomingFiles(files);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void send(primaryKind);
            }
          }}
        />
        <div className="wb-chat-composer-bar">
          <span className="wb-caption wb-chat-composer-hint" title={`Enter 换行 · Ctrl/Meta+Enter 执行「${actionLabel}」`}>
            ⌘↵ 发送
          </span>
          <button
            type="button"
            className="wb-chat-hit wb-chat-model-chip"
            data-chat-open-next-settings
            data-chat-next-model={snapshot?.config.model || ''}
            title={snapshot?.config.modelConfigured ? `下次使用 ${snapshot?.config.model || ''}` : '连接模型'}
            onClick={() => setConnectionMode(snapshot?.config.modelConfigured ? 'next' : 'connect')}
          >
            {snapshot?.config.modelConfigured ? '下次配置与额度' : '连接模型'}
          </button>
          <button
            type="button"
            className="wb-chat-hit"
            onClick={() => patch({ composerExpanded: !composerExpanded })}
          >
            {composerExpanded ? CHAT_UI_DESIGN.composer.collapseLabel : CHAT_UI_DESIGN.composer.expandLabel}
          </button>
          <button
            type="button"
            className="wb-chat-hit wb-chat-send"
            data-chat-primary-action
            disabled={
              busy ||
              !input.trim() ||
              !snapshot?.config.modelConfigured ||
              (primaryKind === 'steer' && assetIds.length > 0)
            }
            onClick={() => void send(primaryKind)}
          >
            {actionLabel}
          </button>
        </div>
        {!snapshot?.config.modelConfigured && (
          <div className="wb-chat-connect-prompt" data-chat-connect-prompt>
            <p className="wb-caption" role="status">
              模型尚未就绪。请先连接，再返回本话题继续（草稿会保留）。
            </p>
            <button
              type="button"
              className="wb-chat-hit"
              data-chat-open-connect
              onClick={() => setConnectionMode('connect')}
            >
              打开连接设置
            </button>
          </div>
        )}
      </div>
      {connectionMode && (
        <ChatConnectionPanel
          mode={connectionMode}
          modelConfigured={Boolean(snapshot?.config.modelConfigured)}
          modelLabel={snapshot?.config.model || '尚未配置'}
          authMode={snapshot?.config.authMode}
          onChanged={refresh}
          onClose={() => setConnectionMode(null)}
        />
      )}
    </div>
  );
}
