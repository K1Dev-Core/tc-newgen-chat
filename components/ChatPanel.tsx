'use client';

import { useEffect, useRef } from 'react';
import type { ChatMessage } from '@/lib/types';
import { MessageContent } from './MessageContent';
import type { MemberProfile } from './ProfileDialog';

export function ChatPanel({ roomName, messages, typingNames, memberProfiles, onOpenProfile }: { roomName: string; messages: ChatMessage[]; typingNames: string[]; memberProfiles: Record<string, MemberProfile>; onOpenProfile: (profile: MemberProfile) => void }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages.length]);
  const messageGroups: ChatMessage[][] = [];
  for (const message of messages) {
    const previousGroup = messageGroups.at(-1);
    const previousMessage = previousGroup?.at(-1);
    const sameSender = previousMessage
      && previousMessage.senderId === message.senderId
      && previousMessage.sender === message.sender
      && previousMessage.role === message.role;
    const withinGroupingWindow = sameSender
      && new Date(message.createdAt).getTime() - new Date(previousMessage.createdAt).getTime() <= 5 * 60 * 1000;
    if (withinGroupingWindow && previousGroup) previousGroup.push(message);
    else messageGroups.push([message]);
  }
  const typingText = typingNames.length > 3
    ? `มีหลายคนกำลังพิมพ์ (${typingNames.length} คน)`
    : typingNames.length === 3
      ? `${typingNames[0]}, ${typingNames[1]} และ ${typingNames[2]} กำลังพิมพ์`
      : typingNames.length === 2
        ? `${typingNames[0]} และ ${typingNames[1]} กำลังพิมพ์`
        : typingNames.length === 1
          ? `${typingNames[0]} กำลังพิมพ์`
          : '';

  return <section className="conversation" aria-label={`Messages in #${roomName}`}>
    <div className="message-list group-message-list">
      {messageGroups.map((group) => {
        const message = group[0];
        const memberProfile = message.senderId ? memberProfiles[message.senderId] : undefined;
        const senderName = memberProfile?.display_name ?? message.sender;
        const openProfile = () => { if (memberProfile) onOpenProfile(memberProfile); };
        return <article className={`group-message ${message.role === 'self' ? 'own-message' : ''}`} key={message.id}>
          <button type="button" className={`member-avatar avatar-${message.tone}`} aria-label={`ดูโปรไฟล์ ${senderName}`} onClick={openProfile}>{memberProfile?.avatar_url ? <img src={memberProfile.avatar_url} alt="" /> : message.avatar}</button>
          <div className="group-message-content">
            <div className="member-line"><button type="button" className="member-name-button" onClick={openProfile}>{senderName}</button><time>{message.time}</time></div>
            <div className="group-message-items">{group.map((item) => <MessageContent key={item.id} content={item.text} />)}</div>
          </div>
        </article>;
      })}
      {messages.length === 0 && <p className="no-chat-messages">ยังไม่มีข้อความในห้องนี้ เริ่มคุยกันได้เลย</p>}
      {typingText && <div className="typing-indicator" role="status" aria-live="polite">
        <span className="typing-dots" aria-hidden="true"><i /><i /><i /></span>
        <span>{typingText}</span>
      </div>}
      <div ref={bottomRef} />
    </div>
  </section>;
}
