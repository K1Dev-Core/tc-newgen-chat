 'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Download, File as FileIcon, X } from 'lucide-react';
import { CodeBlock } from './CodeBlock';
import { formatFileSize, getChatFileUrls, parseChatContent, type ChatFileAttachment } from '@/lib/chat-files';

type MessagePart =
  | { type: 'text'; value: string }
  | { type: 'code'; language: string; value: string };

function renderLinkedText(text: string) {
  const urlPattern = /https?:\/\/[^\s<>]+/gi;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = urlPattern.exec(text)) !== null) {
    const rawUrl = match[0];
    const url = rawUrl.replace(/[.,!?;:)\]}]+$/u, '');
    if (!url) continue;
    let safeUrl: string | null = null;
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') safeUrl = parsed.href;
    } catch { /* Leave malformed URLs as plain text. */ }
    if (!safeUrl) continue;

    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    nodes.push(<a className="message-link" href={safeUrl} target="_blank" rel="noopener noreferrer" key={`url-${key++}`}>{url}</a>);
    if (url.length < rawUrl.length) nodes.push(rawUrl.slice(url.length));
    cursor = match.index + rawUrl.length;
  }

  if (!nodes.length) return text;
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
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

  useEffect(() => {
    if (!activeImage) return;
    function onKeyDown(event: KeyboardEvent) { if (event.key === 'Escape') setActiveImage(null); }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeImage]);

  return <div className="group-message-bubble message-content">
    {splitMessage(text).map((part, index) => part.type === 'code'
      ? <CodeBlock key={`code-${index}`} code={part.value} language={part.language} />
      : part.value
        ? <p className="message-text" key={`text-${index}`}>{renderLinkedText(part.value)}</p>
        : null)}
    {files.length > 0 && <div className="chat-attachments">{files.map((file) => {
      const urls = getChatFileUrls(file);
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
  </div>;
}
