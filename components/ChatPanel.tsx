'use client';

import { useEffect, useRef } from 'react';
import type { ChatMessage, ViewId } from '@/lib/types';
import { MessageContent } from './MessageContent';
import type { MemberProfile } from './ProfileDialog';

export function ChatPanel({ activeView, messages, typingNames, memberProfiles, onOpenProfile }: { activeView: ViewId; messages: ChatMessage[]; typingNames: string[]; memberProfiles: Record<string, MemberProfile>; onOpenProfile: (profile: MemberProfile) => void }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages.length]);
  const typingText = typingNames.length > 3
    ? `มีหลายคนกำลังพิมพ์ (${typingNames.length} คน)`
    : typingNames.length === 3
      ? `${typingNames[0]}, ${typingNames[1]} และ ${typingNames[2]} กำลังพิมพ์`
      : typingNames.length === 2
        ? `${typingNames[0]} และ ${typingNames[1]} กำลังพิมพ์`
        : typingNames.length === 1
          ? `${typingNames[0]} กำลังพิมพ์`
          : '';

  return <section className="conversation" aria-label={`Messages in #${activeView === 'Chat' ? 'chat' : 'server'}`}>
    <div className="message-list group-message-list">
      {messages.map((message) => <article className={`group-message ${message.role === 'self' ? 'own-message' : ''}`} key={message.id}>
        {message.role === 'friend' && <button type="button" className={`member-avatar avatar-${message.tone}`} aria-label={`ดูโปรไฟล์ ${memberProfiles[message.senderId ?? '']?.display_name ?? message.sender}`} onClick={() => { const profile = message.senderId ? memberProfiles[message.senderId] : undefined; if (profile) onOpenProfile(profile); }}>{memberProfiles[message.senderId ?? '']?.avatar_url ? <img src={memberProfiles[message.senderId ?? ''].avatar_url!} alt="" /> : message.avatar}</button>}
        <div className="group-message-content">
          <div className="member-line"><button type="button" className="member-name-button" onClick={() => { const profile = message.senderId ? memberProfiles[message.senderId] : undefined; if (profile) onOpenProfile(profile); }}>{memberProfiles[message.senderId ?? '']?.display_name ?? message.sender}</button><time>{message.time}</time></div>
          <MessageContent content={message.text} />
        </div>
        {message.role === 'self' && <button type="button" className={`member-avatar avatar-${message.tone}`} aria-label="แก้ไขโปรไฟล์ของฉัน" onClick={() => { const profile = message.senderId ? memberProfiles[message.senderId] : undefined; if (profile) onOpenProfile(profile); }}>{memberProfiles[message.senderId ?? '']?.avatar_url ? <img src={memberProfiles[message.senderId ?? ''].avatar_url!} alt="" /> : message.avatar}</button>}
      </article>)}
      {messages.length === 0 && <p className="no-chat-messages">ยังไม่มีข้อความในห้องนี้ เริ่มคุยกันได้เลย</p>}
      {typingText && <div className="typing-indicator" role="status" aria-live="polite">
        <span className="typing-dots" aria-hidden="true"><i /><i /><i /></span>
        <span>{typingText}</span>
      </div>}
      <div ref={bottomRef} />
    </div>
  </section>;
}
