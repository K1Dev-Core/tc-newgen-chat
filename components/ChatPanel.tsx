'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircleReply, SmilePlus } from 'lucide-react';
import type { ChatMessage, MessageReaction } from '@/lib/types';
import { MessageContent } from './MessageContent';
import type { MemberProfile } from './ProfileDialog';

const REACTION_OPTIONS = ['👍', '❤️', '😂', '😮', '🙏'];

export function ChatPanel({ roomName, messages, typingNames, memberProfiles, reactions, viewerId, onOpenProfile, onJumpToMessage, onReply, onToggleReaction }: {
  roomName: string;
  messages: ChatMessage[];
  typingNames: string[];
  memberProfiles: Record<string, MemberProfile>;
  reactions: MessageReaction[];
  viewerId: string | null;
  onOpenProfile: (profile: MemberProfile) => void;
  onJumpToMessage: (messageId: string) => Promise<void>;
  onReply: (message: ChatMessage) => void;
  onToggleReaction: (messageId: string, emoji: string) => Promise<void>;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const previousMessageCountRef = useRef(messages.length);
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  const [jumpingToId, setJumpingToId] = useState<string | null>(null);

  useEffect(() => {
    const addedMessages = messages.length > previousMessageCountRef.current;
    previousMessageCountRef.current = messages.length;
    if (addedMessages && !jumpingToId) bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, jumpingToId]);
  useEffect(() => {
    if (!jumpingToId || !messages.some((message) => message.id === jumpingToId)) return;
    const targetId = jumpingToId;
    const frame = requestAnimationFrame(() => {
      document.getElementById(`chat-message-${targetId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setJumpingToId((current) => current === targetId ? null : current);
    });
    return () => cancelAnimationFrame(frame);
  }, [jumpingToId, messages]);

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

  async function jumpTo(messageId: string) {
    setJumpingToId(messageId);
    await onJumpToMessage(messageId);
  }

  function renderReactions(message: ChatMessage) {
    const messageReactions = reactions.filter((reaction) => reaction.message_id === message.id);
    const counts = new Map<string, { count: number; mine: boolean }>();
    messageReactions.forEach(({ emoji, user_id }) => {
      const current = counts.get(emoji) ?? { count: 0, mine: false };
      current.count += 1;
      current.mine ||= user_id === viewerId;
      counts.set(emoji, current);
    });

    return <>
      {counts.size > 0 && <div className="chat-reaction-list" aria-label="ปฏิกิริยาต่อข้อความ">
        {[...counts].map(([emoji, value]) => <button type="button" key={emoji} className={`chat-reaction-chip ${value.mine ? 'selected' : ''}`} aria-pressed={value.mine} disabled={!viewerId} title={viewerId ? `กดเพื่อ${value.mine ? 'นำ' : 'เพิ่ม'} ${emoji}` : 'เข้าร่วมแชทก่อนจึงกด Reaction ได้'} onClick={() => { void onToggleReaction(message.id, emoji); }}>{emoji}<span>{value.count}</span></button>)}
      </div>}
      <div className="chat-message-actions">
        <button type="button" className="chat-message-action" aria-label={`ตอบกลับ ${message.sender}`} title="ตอบกลับ" onClick={() => onReply(message)}><MessageCircleReply size={14} /><span>ตอบกลับ</span></button>
        <div className="chat-reaction-picker-wrap">
          <button type="button" className="chat-message-action" aria-label="เพิ่ม Reaction" title="เพิ่ม Reaction" disabled={!viewerId} onClick={() => setReactionPickerFor((current) => current === message.id ? null : message.id)}><SmilePlus size={14} /><span>Reaction</span></button>
          {reactionPickerFor === message.id && <div className="chat-reaction-picker" aria-label="เลือก Reaction">
            {REACTION_OPTIONS.map((emoji) => <button type="button" key={emoji} aria-label={`React ${emoji}`} title={emoji} onClick={() => { void onToggleReaction(message.id, emoji); setReactionPickerFor(null); }}>{emoji}</button>)}
          </div>}
        </div>
      </div>
    </>;
  }

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
            <div className="group-message-items">{group.map((item) => <div id={`chat-message-${item.id}`} className={`chat-message-entry ${jumpingToId === item.id ? 'jump-highlight' : ''}`} key={item.id}>
              {item.replyToId && <button type="button" className="chat-reply-preview" title="ไปยังข้อความต้นฉบับ" onClick={() => { void jumpTo(item.replyToId!); }}><strong>{item.replyToSender ?? 'ข้อความที่ตอบกลับ'}</strong><span>{item.replyToText || 'ไฟล์แนบ'}</span></button>}
              <MessageContent content={item.text} />
              {renderReactions(item)}
            </div>)}</div>
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
