import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AssetReader, MarkdownBody, readableAsset } from '../src/document-reader';
import { DraftWorkspace } from '../src/draft-workspace';
import { DraftEditor } from '../src/draft-editor';
import type { Asset, Draft } from '../shared/contracts';

const render = (text: string) => renderToStaticMarkup(createElement(MarkdownBody, { text }));

test('document reading renders Chinese, CRLF, tables, tasks, code and source links', () => {
  const html = render('# 研究结论\r\n\r\n中文 **证据** 与 [原来源](https://example.com/research)。\r\n\r\n| 方案 | 结果 |\r\n| --- | --- |\r\n| 本地 | 保留 |\r\n\r\n- [x] 已核对\r\n\r\n```ts\r\nconst original = "<保持>";\r\n```\r\n\r\n来源[^1]\r\n\r\n[^1]: 真实来源说明');
  assert.match(html, /<h1>研究结论<\/h1>/);
  assert.match(html, /<strong>证据<\/strong>/);
  assert.match(html, /<table>/); assert.match(html, /<td>保留<\/td>/);
  assert.match(html, /href="https:\/\/example.com\/research"[^>]*rel="noopener noreferrer"/);
  assert.match(html, /type="checkbox" disabled="" checked=""/);
  assert.match(html, /&lt;保持&gt;/);
  assert.match(html, /href="#document-[^"]+-fn-1"/);
});

test('untrusted Markdown cannot activate HTML, request remote images or create executable links', () => {
  const html = render('<script>alert(1)</script>\n\n<iframe src="https://example.com/frame"></iframe>\n\n![远程图](https://example.com/private.png)\n\n[执行](javascript:alert%281%29) [文件](file:///C:/private.txt) [数据](data:text/html,evil) [相对路径](/api/something)');
  assert.doesNotMatch(html, /<(script|iframe|img)\b/);
  assert.doesNotMatch(html, /<a[^>]+href="(?:javascript:|file:|data:|\/api\/)/i);
  assert.match(html, /href="https:\/\/example.com\/private.png"/);
  assert.match(html, /图片：远程图/);
  assert.match(html, /&lt;script&gt;/);
});

test('long documents retain their complete original text without parsing a huge Markdown tree', () => {
  const text = '# 开始\n\n' + '中文原文 '.repeat(30_000) + '\n结尾原文048';
  const html = render(text);
  assert.match(html, /已切换为原文阅读/); assert.match(html, /结尾原文048/);
  assert.equal(html.match(/中文原文 /g)?.length,30_000);
  assert.doesNotMatch(html, /<h1>/);
});

test('unavailable, loading and failed assets do not display garbled or false empty content', () => {
  const asset = { id: 'asset-a', name: '研究.md', mime: 'text/markdown', version: 2 } as Asset;
  const display = (a: Asset, loading = false, error = '', text = '') => renderToStaticMarkup(createElement(AssetReader, { asset: a, loading, error, text }));
  assert.match(display(asset,true), /正在读取文件/);
  assert.match(display(asset,false,'读取失败'), /role="alert"/);
  assert.match(display(asset), /这个文件还没有内容/);
  assert.match(display({...asset,mime:'application/pdf'}), /暂不支持内嵌阅读/);
  assert(!readableAsset({mime:'application/octet-stream'}));
  assert(readableAsset({mime:'application/ld+json; charset=utf-8'}));
  assert.match(display(asset,false,'','# 原文'), /<h1>原文<\/h1>/);
});

test('same-name drafts remain identifiable and latest article is selected without creating or saving', () => {
  const drafts = [
    {id:'first-identity',title:'同名稿件',body:'旧稿结论甲',createdAt:'2026-10-07T00:00:00.000Z'},
    {id:'second-identity',title:'同名稿件',body:'新稿结论乙',createdAt:'2026-10-07T01:00:00.000Z'}
  ].map(d=>({...d,projectId:'project-a',updatedAt:d.createdAt,revision:1,sourceIds:[]} as Draft));
  const forbidden = async (): Promise<Draft> => { throw new Error('Rendering must not change data'); };
  const html = renderToStaticMarkup(createElement(DraftWorkspace,{projectId:'project-a',drafts,onSave:forbidden,onCreate:forbidden,refresh:async()=>{}}));
  assert.match(html, /second-i/); assert.match(html, /first-id/);
  assert.match(html, /新稿结论乙/); assert.match(html, /旧稿结论甲/);
  assert.match(html, /class="draft-choice active" aria-pressed="true"[^>]*>[\s\S]*?\[01\]/);
  assert.equal((html.match(/ hidden=""/g)||[]).length,1);
  assert.match(html, /aria-label="草稿查看方式"/);
});

test('draft sources identify their version and reject cross-project or missing asset references in the view', () => {
  const draft = {id:'draft-source',title:'草稿',body:'原文',projectId:'project-a',revision:1,sourceIds:['same','foreign','missing']} as Draft;
  const assets = [{id:'same',projectId:'project-a',name:'实际来源.md',status:'ready',version:3,hash:'a'.repeat(64)}, {id:'foreign',projectId:'project-b',name:'其他项目秘密.md',status:'ready',version:1,hash:'b'.repeat(64)}] as Asset[];
  const html = renderToStaticMarkup(createElement(DraftEditor,{draft,assets,onSave:async()=>draft,refresh:async()=>{},onOpenSource:()=>{throw new Error('Rendering must not open a source');}}));
  assert.match(html,/实际来源.md/); assert.match(html,/v3 · a{12}/);
  assert.doesNotMatch(html,/其他项目秘密/);
  assert.equal((html.match(/来源暂不可用/g)||[]).length,2);
});

test('saved source links allow only exact asset reads, excluding arbitrary local endpoints', () => {
  const id = '12345678-1234-1234-1234-123456789abc';
  const html = render(`[原文](/api/assets/${id}) [管理](/api/diagnostics) [参数](/api/assets/${id}?action=delete) [外部](//example.com)`);
  assert(html.includes(`href="/api/assets/${id}"`));
  assert(!html.includes('href="/api/diagnostics')); assert(!html.includes('?action=')); assert(!html.includes('href="//'));
});
