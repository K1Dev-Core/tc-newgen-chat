'use client';

import { useEffect, useRef } from 'react';
import type { ChatMessage, ViewId } from '@/lib/types';
import { MessageContent } from './MessageContent';

export function ChatPanel({ activeView, messages, typingNames }: { activeView: ViewId; messages: ChatMessage[]; typingNames: string[] }) {
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
        {message.role === 'friend' && <div className={`member-avatar avatar-${message.tone}`} aria-hidden="true">{message.avatar}</div>}
        <div className="group-message-content">
          <div className="member-line"><strong>{message.sender}</strong><time>{message.time}</time></div>
        <MessageContent content={message.text} />
        </div>
        {message.role === 'self' && <div className={`member-avatar avatar-${message.tone}`} aria-hidden="true">{message.avatar}</div>}
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
