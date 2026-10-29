 'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Download, Expand, File as FileIcon, X } from 'lucide-react';
import { CodeBlock } from './CodeBlock';
import { formatFileSize, getChatFileUrls, parseChatContent, type ChatFileAttachment } from '@/lib/chat-files';

type MessagePart =
  | { type: 'text'; value: string }
  | { type: 'code'; language: string; value: string };

function renderInline(text: string, prefix: string): ReactNode[] {
  const inlinePattern = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*]+\*|_[^_]+_|https?:\/\/[^\s<>]+)/gi;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = inlinePattern.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const token = match[0];
    const tokenKey = `${prefix}-${key++}`;
    if (token.startsWith('**') || token.startsWith('__')) {
      nodes.push(<strong key={tokenKey}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*') || token.startsWith('_')) {
      nodes.push(<em key={tokenKey}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith('`')) {
      nodes.push(<code className="message-inline-code" key={tokenKey}>{token.slice(1, -1)}</code>);
    } else {
      const url = token.replace(/[.,!?;:)\]}]+$/u, '');
      let safeUrl: string | null = null;
      try {
        const parsed = new URL(url);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') safeUrl = parsed.href;
      } catch { /* Leave malformed URLs as plain text. */ }
      if (safeUrl) nodes.push(<a className="message-link" href={safeUrl} target="_blank" rel="noopener noreferrer" key={tokenKey}>{url}</a>);
      else nodes.push(url);
      if (url.length < token.length) nodes.push(token.slice(url.length));
    }
    cursor = match.index + token.length;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function renderFormattedText(text: string, partIndex: number) {
  const lines = text.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let index = 0;
  let key = 0;
  const isListLine = (line: string) => /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line);
  const isBlockStart = (line: string) => /^\s{0,3}#{1,6}\s+/.test(line) || isListLine(line) || /^\s*>\s?/.test(line);

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    const blockKey = `text-${partIndex}-${key++}`;
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
    if (heading) {
      const Heading = heading[1].length <= 2 ? 'h3' : 'h4';
      blocks.push(<Heading className="message-heading" key={blockKey}>{renderInline(heading[2], blockKey)}</Heading>);
      index += 1;
      continue;
    }

    const listMatch = line.match(/^\s*(?:([-*+])|(\d+)[.)])\s+(.+)$/);
    if (listMatch) {
      const ordered = Boolean(listMatch[2]);
      const items: ReactNode[] = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*(?:([-*+])|(\d+)[.)])\s+(.+)$/);
        if (!item || Boolean(item[2]) !== ordered) break;
        items.push(<li key={`${blockKey}-item-${items.length}`}>{renderInline(item[3], `${blockKey}-item-${items.length}`)}</li>);
        index += 1;
      }
      blocks.push(ordered ? <ol className="message-list-format" key={blockKey}>{items}</ol> : <ul className="message-list-format" key={blockKey}>{items}</ul>);
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) quoteLines.push(lines[index++].replace(/^\s*>\s?/, ''));
      blocks.push(<blockquote className="message-quote" key={blockKey}>{renderInline(quoteLines.join(' '), blockKey)}</blockquote>);
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && (paragraph.length === 0 || !isBlockStart(lines[index]))) paragraph.push(lines[index++]);
    blocks.push(<p className="message-text" key={blockKey}>{renderInline(paragraph.join('\n'), blockKey)}</p>);
  }
  return blocks;
}

function splitMessage(content: string): MessagePart[] {
  const parts: MessagePart[] = [];
  const fencedBlock = /(^|\n)(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)\n\2[ \t]*(?=\n|$)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = fencedBlock.exec(content)) !== null) {
    const contentStart = match.index + match[1].length;
    if (contentStart > cursor) parts.push({ type: 'text', value: content.slice(cursor, contentStart) });
    const language = match[3].trim().split(/\s+/)[0] ?? '';
    parts.push({ type: 'code', language, value: match[4] });
    cursor = match.index + match[0].length;
  }

  if (cursor < content.length) parts.push({ type: 'text', value: content.slice(cursor) });
  return parts.length ? parts : [{ type: 'text', value: content }];
}

export function MessageContent({ content }: { content: string }) {
  const { text, files } = parseChatContent(content);
  const [activeImage, setActiveImage] = useState<ChatFileAttachment | null>(null);
  const [activeVideo, setActiveVideo] = useState<ChatFileAttachment | null>(null);

  useEffect(() => {
    if (!activeImage && !activeVideo) return;
    function onKeyDown(event: KeyboardEvent) { if (event.key === 'Escape') { setActiveImage(null); setActiveVideo(null); } }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeImage, activeVideo]);

  return <div className="group-message-bubble message-content">
    {splitMessage(text).map((part, index) => part.type === 'code'
      ? <CodeBlock key={`code-${index}`} code={part.value} language={part.language} />
      : part.value
        ? <div className="message-formatted-text" key={`text-${index}`}>{renderFormattedText(part.value, index)}</div>
        : null)}
    {files.length > 0 && <div className="chat-attachments">{files.map((file) => {
      const urls = getChatFileUrls(file);
      if (urls.videoPreview) return <article className="chat-video-attachment" key={file.id}>
        <video className="chat-video-preview" src={urls.videoPreview} controls playsInline preload="metadata" aria-label={`วิดีโอ ${file.filename}`} />
        <div className="chat-file-caption"><span title={file.filename}>{file.filename}<small>{file.mimeType || 'วิดีโอ'} · {formatFileSize(file.size)}</small></span><div className="chat-media-actions"><button type="button" aria-label={`ขยายวิดีโอ ${file.filename} เต็มจอ`} title="ขยายเต็มจอ" onClick={() => setActiveVideo(file)}><Expand size={15} /></button><a href={urls.download} aria-label={`ดาวน์โหลด ${file.filename}`} title="ดาวน์โหลด"><Download size={15} /></a></div></div>
      </article>;
      return urls.preview
        ? <article className="chat-image-attachment" key={file.id}>
          <button type="button" className="chat-image-preview-button" aria-label={`ดูรูป ${file.filename} เต็มจอ`} onClick={() => setActiveImage(file)}><img src={urls.preview} alt={file.filename} loading="lazy" /></button>
          <div className="chat-file-caption"><span title={file.filename}>{file.filename}<small>{formatFileSize(file.size)}</small></span><a href={urls.download} aria-label={`ดาวน์โหลด ${file.filename}`} title="ดาวน์โหลด"><Download size={15} /></a></div>
        </article>
        : <a className="chat-file-card" href={urls.download} key={file.id} aria-label={`ดาวน์โหลด ${file.filename}`}>
          <span className="chat-file-icon"><FileIcon size={18} /></span><span className="chat-file-details"><strong title={file.filename}>{file.filename}</strong><small>{file.mimeType || 'ไฟล์'} · {formatFileSize(file.size)}</small></span><Download className="chat-file-download" size={16} />
        </a>;
    })}</div>}
    {activeImage && createPortal(<div className="chat-image-modal" role="dialog" aria-modal="true" aria-label={`รูป ${activeImage.filename}`} onClick={() => setActiveImage(null)}>
      <header className="chat-image-modal-toolbar" onClick={(event) => event.stopPropagation()}><span title={activeImage.filename}>{activeImage.filename}</span><a href={getChatFileUrls(activeImage).download}><Download size={17} /> ดาวน์โหลด</a><button type="button" aria-label="ปิดรูป" onClick={() => setActiveImage(null)}><X size={20} /></button></header>
      <img src={getChatFileUrls(activeImage).preview ?? ''} alt={activeImage.filename} onClick={(event) => event.stopPropagation()} />
    </div>, document.body)}
    {activeVideo && createPortal(<div className="chat-image-modal chat-video-modal" role="dialog" aria-modal="true" aria-label={`วิดีโอ ${activeVideo.filename}`} onClick={() => setActiveVideo(null)}>
      <header className="chat-image-modal-toolbar" onClick={(event) => event.stopPropagation()}><span title={activeVideo.filename}>{activeVideo.filename}</span><a href={getChatFileUrls(activeVideo).download} aria-label={`ดาวน์โหลด ${activeVideo.filename}`}><Download size={17} /> ดาวน์โหลด</a><button type="button" aria-label="ปิดวิดีโอ" onClick={() => setActiveVideo(null)}><X size={20} /></button></header>
      <video className="chat-video-fullscreen" src={getChatFileUrls(activeVideo).videoPreview ?? undefined} controls playsInline autoPlay onClick={(event) => event.stopPropagation()} />
    </div>, document.body)}
  </div>;
}
