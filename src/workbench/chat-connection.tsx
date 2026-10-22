import React from 'react';
import { ChatGPTPanel } from '../chatgpt-panel';
import { PiExecutionSettings } from './pi-settings';
import { Icon } from './icons';

export type ChatConnectionMode = 'connect' | 'next';

type Props = {
  mode: ChatConnectionMode;
  modelConfigured: boolean;
  modelLabel: string;
  authMode?: 'api' | 'chatgpt';
  onChanged: () => Promise<void>;
  onClose: () => void;
};

/**
 * In-chat entry to existing connection + next-run settings.
 * Does not invent auth: reuses ChatGPTPanel / PiExecutionSettings.
 * Closing returns to the same topic; draft lives in window view, untouched.
 */
export function ChatConnectionPanel({ mode, modelConfigured, modelLabel, authMode, onChanged, onClose }: Props) {
  const title = mode === 'connect' ? '连接模型后继续对话' : '下次提交使用的模型与额度';
  const caption =
    mode === 'connect'
      ? '使用现有连接模块。完成后返回原话题；输入草稿会保留。不会另建一套认证。'
      : '仅影响之后新任务。已有执行仍按当时冻结的模型、思考与时限。';
  return (
    <div className="wb-modal-backdrop" data-chat-connection-panel onMouseDown={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <section className="wb-modal wb-chat-connection" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <div>
            <p className="wb-caption">对话 / 连接与下次设置</p>
            <h2>{title}</h2>
          </div>
          <button type="button" aria-label="关闭连接面板" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        <p className="wb-caption">{caption}</p>
        <p role="status" data-chat-connection-status>
          {modelConfigured
            ? `当前可对话 · ${authMode === 'chatgpt' ? 'ChatGPT 订阅' : 'API'} · ${modelLabel}`
            : '尚未就绪：请连接 ChatGPT 并准备默认模型，或由本机配置获准 API。'}
        </p>
        <ChatGPTPanel onChanged={onChanged} />
        {authMode === 'api' && modelConfigured && (
          <p className="wb-caption" data-chat-api-ready>
            本机 API 已获准用于新任务。ChatGPT 面板仅在你需要订阅连接时使用；测试不会断开已有账户。
          </p>
        )}
        <PiExecutionSettings />
        <footer>
          <button type="button" className="wb-primary" data-chat-connection-return onClick={onClose}>
            返回对话
          </button>
        </footer>
      </section>
    </div>
  );
}
