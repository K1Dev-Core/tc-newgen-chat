'use client';

import { KeyboardEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { Paperclip, Send } from 'lucide-react';
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

export function Composer({ displayName, canSend, onSetName, onSend, onNotify, onTyping }: {
  displayName: string;
  canSend: boolean;
  onSetName: (name: string) => void;
  onSend: (text: string) => void;
  onNotify: (message: string) => void;
  onTyping: (isTyping: boolean) => void;
}) {
  const [value, setValue] = useState('');
  const [name, setName] = useState(displayName);
  const [attachment, setAttachment] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setName(displayName), [displayName]);

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
  function submitName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSetName(name);
  }
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitMessage();
    }
  }

  return <div className="composer-wrap">
    <div className="composer">
      {!canSend && <form className="chat-name-form" onSubmit={submitName}>
        <label htmlFor="chat-display-name">ใส่ชื่อเพื่อส่งข้อความ</label>
        <div className="chat-name-controls">
          <input id="chat-display-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={32} placeholder="ชื่อที่เพื่อนจะเห็น" autoComplete="nickname" />
          <button type="submit" disabled={!name.trim()}>เข้าร่วมแชต</button>
        </div>
        <small>ยังไม่ใส่ชื่อก็อ่านแชตได้ แต่ส่งข้อความไม่ได้</small>
      </form>}
      {attachment && <div className="attachment-chip" title={attachment}>{attachment}</div>}
      <div className="composer-main">
        <textarea aria-label="Message # นกพิราบสื่อสาร" disabled={!canSend} value={value} onChange={(event) => {
          const nextValue = event.target.value;
          setValue(nextValue);
          onTyping(Boolean(nextValue.trim()));
        }} onBlur={() => onTyping(false)} onKeyDown={onKeyDown} placeholder={canSend ? 'ข้อความถึง # นกพิราบสื่อสาร' : 'ใส่ชื่อก่อนเพื่อเริ่มส่งข้อความ'} rows={1} />
        <button className="send-button" aria-label="ส่งข้อความ" title="ส่งข้อความ" disabled={!canSend || !value.trim()} onClick={submitMessage}><Send size={18} strokeWidth={1.8} /></button>
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
