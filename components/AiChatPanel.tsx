'use client';

import { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Clock3, Send, Sparkles } from 'lucide-react';
import { MessageContent } from './MessageContent';
import { PigeonLogo } from './PigeonLogo';
import type { MemberProfile } from './ProfileDialog';
import { stripThinkBlocks } from '@/lib/ai-chat';

export type AiChatMessage = {
  id: string;
  job_id: string;
  role: 'user' | 'assistant';
  sender_id: string | null;
  sender_name: string;
  content: string;
  created_at: string;
};

export type AiChatJob = {
  id: string;
  requester_id: string;
  requester_name: string;
  prompt: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  error_message: string | null;
  created_at: string;
};

export function AiChatPanel({ messages, activeJob, latestFailedJob, loading, configured, error, userId, displayName, memberProfiles, sending, onJoin, onSend }: {
  messages: AiChatMessage[];
  activeJob: AiChatJob | null;
  latestFailedJob: AiChatJob | null;
  loading: boolean;
  configured: boolean | null;
  error: string;
  userId: string | null;
  displayName: string;
  memberProfiles: Record<string, MemberProfile>;
  sending: boolean;
  onJoin: () => void;
  onSend: (prompt: string) => Promise<boolean>;
}) {
  const [prompt, setPrompt] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const canJoin = Boolean(userId && displayName);
  const busy = Boolean(activeJob || sending);
  const ready = configured === true && !loading && !error;
  const latestContent = messages.at(-1)?.content ?? '';

  useLayoutEffect(() => {
    const conversation = bottomRef.current?.closest('.conversation') as HTMLElement | null;
    if (!conversation) return;
    const nearBottom = conversation.scrollHeight - conversation.scrollTop - conversation.clientHeight < 180;
    if (!nearBottom) return;
    conversation.scrollTop = conversation.scrollHeight;
  }, [latestContent]);

  useLayoutEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, activeJob?.status]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = prompt.trim();
    if (!text || !ready || !canJoin || busy) return;
    if (await onSend(text)) setPrompt('');
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return <>
    <section className="conversation ai-chat-conversation" aria-label="บทสนทนากับ AI">
      <div className="message-list group-message-list ai-chat-message-list">
        <div className="ai-chat-intro"><span className="ai-chat-intro-icon"><Sparkles size={17} /></span><div><strong>ห้องคุยกับ AI</strong><span>ทุกคนเห็นคำถามและคำตอบร่วมกัน · ใช้คิวกลางทีละคำถาม</span></div></div>
        {loading && <div className="chat-loading">กำลังโหลดประวัติ AI…</div>}
        {error && <div className="chat-status-error">{error}</div>}
        {!loading && !error && messages.map((message) => {
          const own = message.role === 'user' && message.sender_id === userId;
          const initial = Array.from(message.sender_name.trim())[0] || 'A';
          const profile = message.role === 'user' && message.sender_id ? memberProfiles[message.sender_id] : null;
          const streaming = message.role === 'assistant' && activeJob?.status === 'running' && message.job_id === activeJob.id;
          return <article className={`group-message ai-chat-message ${own ? 'own-message' : ''} ${message.role === 'assistant' ? 'ai-chat-answer' : ''} ${streaming ? 'is-streaming' : ''}`} key={message.id}>
            <span className={`member-avatar ${message.role === 'assistant' ? 'ai-chat-avatar' : 'avatar-lavender'}`} aria-label={message.role === 'assistant' ? 'AI' : message.sender_name} title={message.role === 'assistant' ? 'AI' : message.sender_name}>{message.role === 'assistant' ? <PigeonLogo className="ai-chat-avatar-logo" /> : profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : initial}</span>
            <div className="group-message-content">
              <div className="member-line"><strong className="ai-chat-sender">{message.role === 'assistant' ? 'AI' : message.sender_name}</strong><time>{new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit' }).format(new Date(message.created_at))}</time></div>
              <div className="group-message-items"><div className="chat-message-bubble-wrap"><MessageContent content={message.role === 'assistant' ? stripThinkBlocks(message.content) : message.content} /></div></div>
            </div>
          </article>;
        })}
        {activeJob && <div className="typing-indicator ai-chat-queue-status" role="status" aria-live="polite">
          {activeJob.status === 'queued' ? <Clock3 size={14} /> : <span className="typing-dots" aria-hidden="true"><i /><i /><i /></span>}
          <span>{activeJob.status === 'queued' ? `กำลังเข้าคิว: ${activeJob.requester_name}` : `${activeJob.requester_name} กำลังคุยกับ AI · ทุกคนรอคิวถัดไป`}</span>
        </div>}
        {!activeJob && latestFailedJob?.error_message && <div className="ai-chat-error" role="status">คำขอของ {latestFailedJob.requester_name}: {latestFailedJob.error_message.replace(/ThaiLLM/gi, 'AI').replace(/AI ตอบกลับไม่สำเร็จ \(HTTP 5\d\d\)/gi, 'ระบบกำลังตอบช้า ลองส่งใหม่อีกครั้ง')}</div>}
        {!loading && !error && messages.length === 0 && <p className="no-chat-messages">ยังไม่มีประวัติ ลองถาม AI ได้เลย ทุกคนในห้องจะเห็นคำตอบ</p>}
        <div ref={bottomRef} />
      </div>
    </section>
    <div className="composer-wrap ai-chat-composer-wrap">
      <form className="composer ai-chat-composer" onSubmit={(event) => { void submit(event); }}>
        {!canJoin && <div className="chat-join-prompt"><div><strong>เข้าร่วมแชทก่อนถาม AI</strong><small>ใส่ชื่อและเลือกรูปโปรไฟล์เพื่อส่งคำถาม</small></div><button type="button" className="chat-join-trigger" onClick={onJoin}>เข้าร่วมแชท</button></div>}
        {configured === null && !error && <p className="ai-chat-not-configured">กำลังตรวจสอบการเชื่อมต่อ AI…</p>}
        {configured === false && !error && <p className="ai-chat-not-configured">ระบบ AI ยังตั้งค่าไม่ครบ</p>}
        {error && <p className="ai-chat-not-configured">ห้อง AI ยังไม่พร้อมใช้งาน</p>}
        {busy && <p className="ai-chat-input-hint">มีคำถามอยู่ในคิวแล้ว รอให้ AI ตอบก่อนจึงส่งคำถามถัดไปได้</p>}
        <div className="ai-chat-input-row">
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={onComposerKeyDown} maxLength={6000} rows={2} disabled={!ready || !canJoin || busy} placeholder={activeJob ? 'รอคิว AI ว่างก่อน…' : ready ? 'ถาม AI… (Enter เพื่อส่ง, Shift+Enter ขึ้นบรรทัดใหม่)' : 'เชื่อมต่อ AI ไม่พร้อม'} aria-label="พิมพ์คำถามถึง AI" />
          <button type="submit" className="send-button" disabled={!ready || !canJoin || busy || !prompt.trim()} aria-label="ส่งคำถามให้ AI" title="ส่งคำถามให้ AI">{sending ? <span className="send-spinner" aria-hidden="true">◌</span> : <Send size={18} />}</button>
        </div>
        <div className="ai-chat-composer-footer"><span>{busy ? 'คิวเดียวสำหรับทุกคน' : 'คำถามและคำตอบจะแสดงให้สมาชิกทุกคนเห็น'}</span><span>{prompt.length}/6000</span></div>
      </form>
    </div>
  </>;
}
