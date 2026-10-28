'use client';

import { useEffect, useRef } from 'react';
import type { ChatMessage, ViewId } from '@/lib/types';

export function ChatPanel({ activeView, messages }: { activeView: ViewId; messages: ChatMessage[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages.length]);

  return <section className="conversation" aria-label={`Messages in #${activeView === 'Chat' ? 'chat' : 'server'}`}>
    <div className="message-list group-message-list">
      {messages.map((message) => <article className={`group-message ${message.role === 'self' ? 'own-message' : ''}`} key={message.id}>
        {message.role === 'friend' && <div className={`member-avatar avatar-${message.tone}`} aria-hidden="true">{message.avatar}</div>}
        <div className="group-message-content">
          <div className="member-line"><strong>{message.sender}</strong><time>{message.time}</time></div>
          <div className="group-message-bubble">{message.text}</div>
        </div>
        {message.role === 'self' && <div className={`member-avatar avatar-${message.tone}`} aria-hidden="true">{message.avatar}</div>}
      </article>)}
      {messages.length === 0 && <p className="no-chat-messages">ยังไม่มีข้อความในห้องนี้ เริ่มคุยกันได้เลย</p>}
      <div ref={bottomRef} />
    </div>
  </section>;
}
