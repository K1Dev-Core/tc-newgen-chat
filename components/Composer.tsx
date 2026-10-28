'use client';

import { KeyboardEvent, useRef, useState } from 'react';
import { LoaderCircle, Paperclip, Send } from 'lucide-react';
import hljs from 'highlight.js';

function detectCodeLanguage(text: string): string | null {
  const source = text.trim();
  if (!source || /^\s*(`{3,}|~{3,})/.test(source)) return null;

  try {
    JSON.parse(source);
    if (/^(?:\{|\[)/.test(source)) return 'json';
  } catch {
    // Continue with syntax detection for non-JSON text.
  }

  const hasHtmlTag = /<[^>]+>/.test(source);
  const hasCallExpression = /^\s*(?:await\s+)?(?:new\s+)?[A-Za-z_$][\w$]*(?:\.[\w$]+)*\s*\([^)]*\)\s*;?\s*$/.test(source);
  const hasStrongCodeSyntax = hasHtmlTag || hasCallExpression || /(?:=>|===?|!==?|&&|\|\||->|::|\b\w+\s*\([^\n]*\)\s*\{|^\s*(?:#!|#include\b|import\s+[\w{*]|from\s+[\w.]+\s+import\b|export\s+(?:default|const|function|class|type|interface)\b|(?:const|let|var)\s+[$\w]+\s*(?:=|:)|function\s+[$\w]+\s*\(|class\s+[$\w]+\b|def\s+\w+\s*\(|async\s+function\b|SELECT\b.+\bFROM\b|INSERT\s+INTO\b|CREATE\s+TABLE\b|UPDATE\s+\w+\s+SET\b|fn\s+\w+\s*\(|func\s+\w+\s*\(|package\s+\w+|use\s+[\w:]+;))/mi.test(source);
  const lines = source.split('\n');
  const codeShapedLines = lines.filter((line) => /^\s{2,}\S/.test(line)
    || /[{};]$/.test(line.trim())
    || /^\s*(?:if|else|for|while|switch|case|try|catch|return|break|continue)\b.*(?:\{|:|;)?\s*$/.test(line)).length;
  const hasSeveralCodeLines = lines.length >= 2 && codeShapedLines >= 2;
  if (!hasStrongCodeSyntax && !hasSeveralCodeLines) return null;

  const result = hljs.highlightAuto(source);
  return result.language && result.relevance >= 2 ? result.language : '';
}

function formatDetectedCode(text: string): string {
  const language = detectCodeLanguage(text);
  return language === null ? text : `\`\`\`${language}\n${text}\n\`\`\``;
}

export function Composer({ canSend, sending, onOpenJoin, onSend, onNotify, onTyping }: {
  canSend: boolean;
  sending: boolean;
  onOpenJoin: () => void;
  onSend: (text: string) => void;
  onNotify: (message: string) => void;
  onTyping: (isTyping: boolean) => void;
}) {
  const [value, setValue] = useState('');
  const [attachment, setAttachment] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function submitMessage() {
    if (!canSend || !value.trim()) return;
    const message = value.trim();
    const formattedMessage = formatDetectedCode(message);
    if (new TextEncoder().encode(formattedMessage).byteLength > 180000) {
      onNotify('ข้อความและโค้ดต้องมีขนาดไม่เกิน 180 KB');
      return;
    }
    onTyping(false);
    onSend(formattedMessage);
    setValue('');
    setAttachment('');
    if (fileRef.current) fileRef.current.value = '';
  }
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitMessage();
    }
  }

  return <div className="composer-wrap">
    <div className="composer">
      {!canSend && <div className="chat-name-form">
        <div className="chat-join-prompt"><div><strong>เข้าร่วมแชทเพื่อส่งข้อความ</strong><small>เลือกชื่อและรูปโปรไฟล์ก่อนเริ่มคุยได้เลย</small></div><button type="button" className="chat-join-trigger" onClick={onOpenJoin}>เข้าร่วมแชท</button></div>
        <small>ยังไม่เข้าร่วมก็อ่านแชทได้ แต่ส่งข้อความไม่ได้</small>
      </div>}
      {attachment && <div className="attachment-chip" title={attachment}>{attachment}</div>}
      <div className="composer-main">
        <textarea aria-label="Message # นกพิราบสื่อสาร" disabled={!canSend} value={value} onChange={(event) => {
          const nextValue = event.target.value;
          setValue(nextValue);
          onTyping(Boolean(nextValue.trim()));
        }} onBlur={() => onTyping(false)} onKeyDown={onKeyDown} placeholder={canSend ? 'ข้อความถึง # นกพิราบสื่อสาร' : 'ใส่ชื่อก่อนเพื่อเริ่มส่งข้อความ'} rows={1} />
        <button className="send-button" aria-label={sending ? 'กำลังส่งข้อความ' : 'ส่งข้อความ'} title={sending ? 'กำลังส่งข้อความ' : 'ส่งข้อความ'} disabled={!canSend || !value.trim() || sending} onClick={submitMessage}>{sending ? <LoaderCircle className="send-spinner" size={17} strokeWidth={2} /> : <Send size={18} strokeWidth={1.8} />}</button>
      </div>
      <div className="composer-footer">
        <button aria-label="แนบไฟล์" title="แนบไฟล์" disabled={!canSend} onClick={() => fileRef.current?.click()}><Paperclip size={16} /></button>
        <input ref={fileRef} type="file" hidden onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setAttachment(file.name);
          onNotify(`เลือกไฟล์ ${file.name} แล้ว`);
        }} />
      </div>
    </div>
  </div>;
}
