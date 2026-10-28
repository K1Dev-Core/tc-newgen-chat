'use client';

import { KeyboardEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { Paperclip, Send } from 'lucide-react';

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
    onTyping(false);
    onSend(value.trim());
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
