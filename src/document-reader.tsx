import { memo, useId, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Asset } from '../shared/contracts';

// Reading a document never embeds its remote images or executes its HTML.
function externalLink(value: string): string | undefined {
  if (!/^https?:\/\//i.test(value)) return;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined; } catch { return; }
}

export const MarkdownBody = memo(function MarkdownBody({ text }: { text: string }) {
  const id = useId();
  if (text.length > 128 * 1024) return <div className="markdown-body"><p className="document-empty">这份内容较长，已切换为原文阅读。</p><pre className="document-source">{text}</pre></div>;
  return <div className="markdown-body"><Markdown remarkPlugins={[remarkGfm]} remarkRehypeOptions={{ clobberPrefix: `document-${id}-` }} urlTransform={value => value.startsWith('#') || /^\/api\/assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : externalLink(value) ?? ''} components={{
    a: ({ href, children }) => href ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>,
    img: ({ src, alt }) => { const href = typeof src === 'string' ? externalLink(src) : undefined; return <span className="document-image">图片：{alt || '未命名'} {href && <a href={href} target="_blank" rel="noopener noreferrer">查看图片 ↗</a>}</span>; },
    table: ({ children }) => <div className="document-table"><table>{children}</table></div>
  }}>{text}</Markdown></div>;
});

export function readableAsset(asset: Pick<Asset, 'mime'>): boolean {
  const mime = asset.mime.split(';')[0].trim().toLowerCase();
  return mime.startsWith('text/') || ['application/json', 'application/xml', 'application/yaml', 'application/x-yaml', 'application/javascript'].includes(mime) || mime.endsWith('+json') || mime.endsWith('+xml');
}

export function AssetReader({ asset, text, loading, error }: { asset: Asset; text: string; loading: boolean; error: string }) {
  const markdown = /\.(md|markdown)$/i.test(asset.name) || asset.mime.split(';')[0].trim().toLowerCase() === 'text/markdown';
  const [source, setSource] = useState(false);
  if (!readableAsset(asset)) return <div className="document-unavailable"><p>此格式暂不支持内嵌阅读。</p><a href={`/api/assets/${asset.id}`} download>下载原文件 ↗</a></div>;
  if (loading) return <div className="document-unavailable" role="status">正在读取文件…</div>;
  if (error) return <div className="document-unavailable" role="alert">{error}</div>;
  return <section className="document-reader" aria-label="文件阅读区">
    <div className="document-toolbar"><span className="mono">{markdown ? 'DOCUMENT' : 'TEXT'} / v{asset.version}</span>{markdown && <div role="group" aria-label="文件查看方式"><button aria-pressed={!source} onClick={() => setSource(false)}>阅读</button><button aria-pressed={source} onClick={() => setSource(true)}>原文</button></div>}</div>
    <div className="paper document-paper">{!text ? <p className="document-empty">这个文件还没有内容。</p> : markdown && !source ? <MarkdownBody text={text}/> : <pre className="document-source">{text}</pre>}</div>
  </section>;
}

export function draftExcerpt(body: string): string {
  return body.replace(/\s+/g, ' ').trim().slice(0, 96);
}
