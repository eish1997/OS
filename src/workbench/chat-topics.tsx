import React, { useEffect, useRef, useState } from 'react';
import type { Conversation, ConversationSearchHit, ConversationSearchPage } from '../../shared/contracts';
import { ApiError, request } from './client';

type Props = {
  projectId: string;
  conversation: Conversation;
  windowTitle: string;
  modelConfigured: boolean;
  modelLabel: string;
  chatFocused?: boolean;
  showAllRuns?: boolean;
  runCount?: number;
  onOpen: (c: Conversation) => void;
  onTitleChanged: (title: string) => void;
  onLocateMessage: (messageId: string, sequence: number) => void;
  onRevealTools: (which: 'branch' | 'import' | 'compact') => void;
  onOpenSettings: (mode: 'connect' | 'next') => void;
  onFocusChat?: () => void;
  onRestoreChat?: () => void;
  onToggleAllRuns?: () => void;
  refresh: () => Promise<void>;
};

export function ChatTopicBar({
  projectId,
  conversation,
  windowTitle,
  modelConfigured,
  modelLabel,
  chatFocused,
  showAllRuns,
  runCount = 0,
  onOpen,
  onTitleChanged,
  onLocateMessage,
  onRevealTools,
  onOpenSettings,
  onFocusChat,
  onRestoreChat,
  onToggleAllRuns,
  refresh,
}: Props) {
  const [list, setList] = useState<Conversation[]>([]);
  const [topicQuery, setTopicQuery] = useState('');
  const [titleDraft, setTitleDraft] = useState(conversation.title);
  const [renaming, setRenaming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hits, setHits] = useState<ConversationSearchHit[]>([]);
  const [nextAfter, setNextAfter] = useState<number | undefined>();
  const searchAbort = useRef<AbortController | undefined>(undefined);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTitleDraft(conversation.title);
  }, [conversation.id, conversation.title]);

  useEffect(() => {
    let cancelled = false;
    const q = topicQuery.trim();
    const path = q
      ? `/conversations?projectId=${encodeURIComponent(projectId)}&q=${encodeURIComponent(q)}`
      : `/conversations?projectId=${encodeURIComponent(projectId)}`;
    void request<Conversation[]>(path, undefined, 'GET')
      .then((rows) => {
        if (!cancelled) setList(rows);
      })
      .catch((e) => {
        if (!cancelled) setMessage(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, topicQuery, conversation.revision]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const rename = async () => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const next = await request<Conversation>(
        `/conversations/${encodeURIComponent(conversation.id)}`,
        {
          revision: conversation.revision,
          title: titleDraft,
        },
        'PATCH',
      );
      onTitleChanged(next.title);
      setRenaming(false);
      await refresh();
      setMessage('话题名称已更新');
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  };

  const createTopic = async () => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    setMenuOpen(false);
    try {
      const created = await request<Conversation>('/conversations', {
        projectId,
        commandId: crypto.randomUUID(),
      });
      onOpen(created);
      await refresh();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  };

  const runSearch = async (append = false) => {
    const q = searchQuery.trim();
    if (!q) return;
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    setBusy(true);
    setMessage('');
    try {
      const after = append && nextAfter !== undefined ? `&after=${nextAfter}` : '';
      const page = await request<ConversationSearchPage>(
        `/conversations/${encodeURIComponent(conversation.id)}/search?q=${encodeURIComponent(q)}&limit=20${after}`,
        undefined,
        'GET',
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setHits((prev) => (append ? [...prev, ...page.hits] : page.hits));
      setNextAfter(page.nextAfter);
      if (!page.hits.length && !append) setMessage('本话题历史中没有匹配');
    } catch (e) {
      if (e instanceof ApiError && e.status === 499) return;
      if (controller.signal.aborted) return;
      setMessage(String(e));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  const closeMenuThen = (fn: () => void) => {
    setMenuOpen(false);
    fn();
  };

  const displayTitle = conversation.title || windowTitle;

  return (
    <div className="wb-chat-topics" data-chat-topics data-chat-layout="v2">
      <div className="wb-chat-chrome">
        {renaming ? (
          <div className="wb-chat-chrome-rename">
            <input
              aria-label="话题名称"
              value={titleDraft}
              maxLength={120}
              disabled={busy}
              onChange={(e) => setTitleDraft(e.target.value)}
            />
            <button
              type="button"
              className="wb-chat-hit"
              disabled={busy || !titleDraft.trim()}
              onClick={() => void rename()}
            >
              保存名称
            </button>
            <button
              type="button"
              className="wb-chat-hit"
              disabled={busy}
              onClick={() => {
                setRenaming(false);
                setTitleDraft(conversation.title);
              }}
            >
              取消
            </button>
          </div>
        ) : (
          <label className="wb-chat-topic-switch" title="切换话题">
            <span className="wb-chat-sr-only">切换话题</span>
            <strong className="wb-chat-topic-title" data-chat-topic-title>
              {displayTitle}
            </strong>
            <span className="wb-chat-topic-caret" aria-hidden="true">
              ▾
            </span>
            <select
              aria-label="切换话题"
              data-chat-topic-select
              className="wb-chat-topic-select"
              value={conversation.id}
              disabled={busy}
              title={displayTitle}
              onChange={(e) => {
                const next = list.find((c) => c.id === e.target.value);
                if (next && next.id !== conversation.id) onOpen(next);
              }}
            >
              {!list.some((c) => c.id === conversation.id) && (
                <option value={conversation.id}>{displayTitle}</option>
              )}
              {list.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          className="wb-chat-hit wb-chat-chrome-icon"
          data-chat-toggle-search
          aria-label={searchOpen ? '收起查找' : '查找本话题'}
          aria-pressed={searchOpen}
          title={searchOpen ? '收起查找' : '查找本话题'}
          onClick={() => setSearchOpen((v) => !v)}
        >
          {searchOpen ? '收起' : '查找'}
        </button>
        <div className="wb-chat-overflow" data-chat-overflow ref={menuRef}>
          <button
            type="button"
            className="wb-chat-hit wb-chat-chrome-icon"
            data-chat-overflow-toggle
            aria-label="更多操作"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="wb-chat-overflow-menu" role="menu" data-chat-overflow-menu>
              <label className="wb-chat-topics-filter">
                筛选话题
                <input
                  aria-label="筛选话题"
                  value={topicQuery}
                  placeholder="按标题筛选本项目话题"
                  onChange={(e) => setTopicQuery(e.target.value)}
                />
              </label>
              <button
                type="button"
                role="menuitem"
                className="wb-chat-hit"
                data-chat-rename-topic
                onClick={() =>
                  closeMenuThen(() => {
                    setRenaming(true);
                  })
                }
              >
                改名
              </button>
              <button
                type="button"
                role="menuitem"
                className="wb-chat-hit"
                data-chat-new-topic
                disabled={busy}
                onClick={() => void createTopic()}
              >
                新建话题
              </button>
              <button
                type="button"
                role="menuitem"
                className="wb-chat-hit"
                data-chat-topic-branch
                onClick={() => closeMenuThen(() => onRevealTools('branch'))}
              >
                分支 / 来源
              </button>
              <button
                type="button"
                role="menuitem"
                className="wb-chat-hit"
                data-chat-topic-import
                onClick={() => closeMenuThen(() => onRevealTools('import'))}
              >
                导入导出
              </button>
              <button
                type="button"
                role="menuitem"
                className="wb-chat-hit"
                data-chat-topic-compact
                onClick={() => closeMenuThen(() => onRevealTools('compact'))}
              >
                压缩入口
              </button>
              {onToggleAllRuns && (
                <button
                  type="button"
                  role="menuitem"
                  className="wb-chat-hit"
                  data-chat-all-runs
                  aria-pressed={showAllRuns}
                  onClick={() =>
                    closeMenuThen(() => {
                      onToggleAllRuns();
                    })
                  }
                >
                  {showAllRuns ? `收起执行历史（${runCount}）` : `全部执行历史（${runCount}）`}
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                className="wb-chat-hit"
                data-chat-open-next-settings
                onClick={() =>
                  closeMenuThen(() => onOpenSettings(modelConfigured ? 'next' : 'connect'))
                }
              >
                {modelConfigured ? '下次配置与额度' : '连接模型'}
              </button>
              <p className="wb-caption" data-chat-next-model>
                下次使用 · {modelLabel}
              </p>
            </div>
          )}
        </div>
        {chatFocused && onRestoreChat ? (
          <button type="button" className="wb-chat-hit" data-chat-restore onClick={onRestoreChat}>
            还原位置
          </button>
        ) : onFocusChat ? (
          <button type="button" className="wb-chat-hit" data-chat-focus onClick={onFocusChat}>
            聚焦对话
          </button>
        ) : null}
      </div>
      {searchOpen && (
        <div className="wb-chat-search" data-chat-search>
          <label>
            查找本话题全文
            <input
              aria-label="查找本话题全文"
              value={searchQuery}
              placeholder="搜索历史消息（服务端，可取消）"
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void runSearch(false);
                }
              }}
            />
          </label>
          <button
            type="button"
            className="wb-chat-hit"
            disabled={busy || !searchQuery.trim()}
            onClick={() => void runSearch(false)}
          >
            查找
          </button>
          <button
            type="button"
            className="wb-chat-hit"
            disabled={busy}
            onClick={() => {
              searchAbort.current?.abort();
              setBusy(false);
              setMessage('已取消查找');
            }}
          >
            取消查找
          </button>
          {!!hits.length && (
            <ul data-chat-search-hits>
              {hits.map((hit) => (
                <li key={`${hit.messageId}:${hit.sequence}`}>
                  <button
                    type="button"
                    className="wb-chat-hit"
                    data-chat-search-hit={hit.messageId}
                    onClick={() => onLocateMessage(hit.messageId, hit.sequence)}
                  >
                    {hit.role === 'user' ? '你' : 'Pi'} · {hit.snippet}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {nextAfter !== undefined && (
            <button type="button" className="wb-chat-hit" disabled={busy} onClick={() => void runSearch(true)}>
              更多结果
            </button>
          )}
        </div>
      )}
      {message && (
        <p className="wb-caption" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
