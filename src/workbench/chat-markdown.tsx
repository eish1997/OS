import React, { useState, type ComponentPropsWithoutRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

function CodeBlock({ className, children, ...rest }: ComponentPropsWithoutRef<'code'>) {
  const text = String(children ?? '').replace(/\n$/, '');
  const isBlock = Boolean(className) || text.includes('\n');
  const [copied, setCopied] = useState(false);
  if (!isBlock) {
    return (
      <code className={className} {...rest}>
        {children}
      </code>
    );
  }
  const language = /language-([\w-]+)/.exec(className || '')?.[1];
  return (
    <div className="wb-code-block" data-chat-code-block>
      <div className="wb-code-toolbar">
        <span className="wb-caption">{language || '代码'}</span>
        <button
          type="button"
          className="wb-chat-hit"
          data-chat-copy-code
          onClick={async () => {
            const ok = await copyText(text);
            if (ok) {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }
          }}
        >
          {copied ? '已复制' : '复制代码'}
        </button>
      </div>
      <pre>
        <code className={className} {...rest}>
          {children}
        </code>
      </pre>
    </div>
  );
}

export function ChatMarkdown({ text }: { text: string }) {
  return (
    <div className="wb-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: CodeBlock,
          table: ({ children }) => (
            <div className="wb-table-scroll" data-chat-table>
              <table>{children}</table>
            </div>
          ),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export async function copyMessageText(text: string): Promise<boolean> {
  return copyText(text);
}
