'use client';

import { KeyboardEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { Code2, Paperclip, Send, X } from 'lucide-react';

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
  const [codeMode, setCodeMode] = useState(false);
  const [codeLanguage, setCodeLanguage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setName(displayName), [displayName]);

  function submitMessage() {
    if (!canSend || !value.trim()) return;
    const message = value.trim();
    const alreadyFormatted = /^\s*(`{3,}|~{3,})/.test(message);
    const language = codeLanguage.trim().split(/\s+/)[0]?.replace(/[^a-zA-Z0-9_+.-]/g, '').slice(0, 24) ?? '';
    const formattedMessage = codeMode && !alreadyFormatted ? `\`\`\`${language}\n${message}\n\`\`\`` : message;
    if (new TextEncoder().encode(formattedMessage).byteLength > 180000) {
      onNotify('ข้อความและโค้ดต้องมีขนาดไม่เกิน 180 KB');
      return;
    }
    onTyping(false);
    onSend(formattedMessage);
    setValue('');
    setCodeMode(false);
    setCodeLanguage('');
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
      {codeMode && <div className="composer-code-toolbar">
        <span><Code2 size={14} /> ส่งเป็นโค้ด</span>
        <label htmlFor="code-language">ภาษา</label>
        <input id="code-language" aria-label="ภาษาโค้ด" list="code-language-options" value={codeLanguage} onChange={(event) => setCodeLanguage(event.target.value)} placeholder="อัตโนมัติ เช่น js, py, rust" />
        <datalist id="code-language-options">
          {['javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'php', 'ruby', 'swift', 'kotlin', 'html', 'css', 'json', 'yaml', 'sql', 'bash', 'markdown', 'dockerfile'].map((language) => <option value={language} key={language} />)}
        </datalist>
        <button type="button" aria-label="ปิดโหมดโค้ด" title="ปิดโหมดโค้ด" onClick={() => { setCodeMode(false); setCodeLanguage(''); }}><X size={14} /></button>
      </div>}
      <div className="composer-main">
        <textarea aria-label="Message # นกพิราบสื่อสาร" disabled={!canSend} value={value} onChange={(event) => {
          const nextValue = event.target.value;
          setValue(nextValue);
          onTyping(Boolean(nextValue.trim()));
        }} onBlur={() => onTyping(false)} onKeyDown={onKeyDown} placeholder={codeMode ? 'วางโค้ดที่นี่…' : canSend ? 'ข้อความถึง # นกพิราบสื่อสาร' : 'ใส่ชื่อก่อนเพื่อเริ่มส่งข้อความ'} rows={1} />
        <button className="send-button" aria-label="ส่งข้อความ" title="ส่งข้อความ" disabled={!canSend || !value.trim()} onClick={submitMessage}><Send size={18} strokeWidth={1.8} /></button>
      </div>
      <div className="composer-footer">
        <button type="button" className={codeMode ? 'code-mode-button active' : 'code-mode-button'} aria-label={codeMode ? 'ปิดโหมดโค้ด' : 'ส่งเป็นโค้ด'} title={codeMode ? 'ปิดโหมดโค้ด' : 'ส่งเป็นโค้ด'} aria-pressed={codeMode} disabled={!canSend} onClick={() => setCodeMode((enabled) => !enabled)}><Code2 size={16} /><span>โค้ด</span></button>
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
