'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MessageCircleReply, SmilePlus } from 'lucide-react';
import type { ChatMessage, MessageReaction } from '@/lib/types';
import { MessageContent } from './MessageContent';
import type { MemberProfile } from './ProfileDialog';
import { PigeonLogo } from './PigeonLogo';

function StreamingAiContent({ content, streaming, messageId }: { content: string; streaming: boolean; messageId: string }) {
  const [animatedMessageId, setAnimatedMessageId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(0);
  const characters = useMemo(() => Array.from(new Intl.Segmenter('th', { granularity: 'grapheme' }).segment(content), (part) => part.segment), [content]);

  useEffect(() => {
    if (!streaming) return;
    setAnimatedMessageId(messageId);
    setRevealed(0);
  }, [messageId, streaming]);

  const animate = streaming || animatedMessageId === messageId;
  useEffect(() => {
    if (!animate || revealed >= characters.length) return;
    const timer = window.setInterval(() => setRevealed((current) => Math.min(current + 2, characters.length)), 24);
    return () => window.clearInterval(timer);
  }, [animate, characters.length, revealed]);

  return <MessageContent content={animate ? characters.slice(0, revealed).join('') : content} />;
}

const REACTION_OPTIONS = [
  { id: 'pigeon-love', name: 'พิราบตาหวาน', image: '/reactions/pigeon-love.png' },
  { id: 'pigeon-rude', name: 'พิราบนิ้วกลาง', image: '/reactions/pigeon-rude.png' },
  { id: 'pigeon-laugh', name: 'พิราบขำ', image: '/reactions/pigeon-laugh.png' },
  { id: 'pigeon-surprised', name: 'พิราบตกใจ', image: '/reactions/pigeon-surprised.png' },
  { id: 'pigeon-crying', name: 'พิราบร้องไห้', image: '/reactions/pigeon-crying.png' },
  { id: 'pigeon-wave', name: 'พิราบทักทาย', image: '/reactions/pigeon-wave.png' },
];

export function ChatPanel({ roomName, messages, typingNames, aiStatus, memberProfiles, reactions, viewerId, onOpenProfile, onJumpToMessage, onReply, onToggleReaction }: {
  roomName: string;
  messages: ChatMessage[];
  typingNames: string[];
  aiStatus?: string;
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
  const reactionPickerRef = useRef<HTMLDivElement>(null);
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  const [reactionPickerPosition, setReactionPickerPosition] = useState<{ left: number; top: number } | null>(null);
  const [jumpingToId, setJumpingToId] = useState<string | null>(null);

  useLayoutEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
  }, []);

  useEffect(() => {
    const addedMessages = messages.length > previousMessageCountRef.current;
    previousMessageCountRef.current = messages.length;
    if ((addedMessages || messages.at(-1)?.isStreaming) && !jumpingToId) {
      bottomRef.current?.scrollIntoView({ behavior: messages.at(-1)?.isStreaming ? 'auto' : 'smooth', block: 'end' });
    }
  }, [messages.length, messages.at(-1)?.text, messages.at(-1)?.isStreaming, jumpingToId]);
  useEffect(() => {
    if (!jumpingToId || !messages.some((message) => message.id === jumpingToId)) return;
    const targetId = jumpingToId;
    const frame = requestAnimationFrame(() => {
      document.getElementById(`chat-message-${targetId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setJumpingToId((current) => current === targetId ? null : current);
    });
    return () => cancelAnimationFrame(frame);
  }, [jumpingToId, messages]);

  useLayoutEffect(() => {
    if (!reactionPickerFor) { setReactionPickerPosition(null); return; }
    const updatePosition = () => {
      const picker = reactionPickerRef.current;
      const anchor = picker?.parentElement;
      if (!picker || !anchor) return;
      const anchorRect = anchor.getBoundingClientRect();
      const pickerRect = picker.getBoundingClientRect();
      const margin = 10;
      const maxLeft = Math.max(margin, window.innerWidth - pickerRect.width - margin);
      const left = Math.min(Math.max(margin, anchorRect.right - pickerRect.width), maxLeft);
      const above = anchorRect.top - pickerRect.height - 8;
      const below = anchorRect.bottom + 8;
      const maxTop = Math.max(margin, window.innerHeight - pickerRect.height - margin);
      const top = above >= margin ? above : Math.min(below, maxTop);
      setReactionPickerPosition({ left, top });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [reactionPickerFor]);

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

  function renderReactionChips(message: ChatMessage) {
    const messageReactions = reactions.filter((reaction) => reaction.message_id === message.id);
    const counts = new Map<string, { count: number; mine: boolean }>();
    messageReactions.forEach(({ emoji, user_id }) => {
      const current = counts.get(emoji) ?? { count: 0, mine: false };
      current.count += 1;
      current.mine ||= user_id === viewerId;
      counts.set(emoji, current);
    });

    if (!counts.size) return null;
    return <div className="chat-reaction-list" aria-label="ปฏิกิริยาต่อข้อความ">
      {[...counts].map(([emoji, value]) => {
        const option = REACTION_OPTIONS.find((item) => item.id === emoji);
        return <button type="button" key={emoji} className={`chat-reaction-chip ${value.mine ? 'selected' : ''}`} aria-label={`${option?.name ?? emoji} ${value.count}`} aria-pressed={value.mine} disabled={!viewerId} title={viewerId ? `กดเพื่อ${value.mine ? 'นำ' : 'เพิ่ม'} ${option?.name ?? emoji}` : 'เข้าร่วมแชทก่อนจึงกด Reaction ได้'} onClick={() => { void onToggleReaction(message.id, emoji); }}>
          {option ? <img src={option.image} alt="" /> : <span className="chat-reaction-legacy">{emoji}</span>}
        </button>;
      })}
    </div>;
  }

  function renderMessageActions(message: ChatMessage, canReact: boolean) {
    return <>
      <div className="chat-message-actions">
        <button type="button" className="chat-message-action" aria-label={`ตอบกลับ ${message.sender}`} title="ตอบกลับ" onClick={() => onReply(message)}><MessageCircleReply size={14} /><span>ตอบกลับ</span></button>
        {canReact && <div className="chat-reaction-picker-wrap">
          <button type="button" className="chat-message-action" aria-label="เพิ่ม Reaction" title="เพิ่ม Reaction" disabled={!viewerId} onClick={() => setReactionPickerFor((current) => current === message.id ? null : message.id)}><SmilePlus size={14} /><span>Reaction</span></button>
          {reactionPickerFor === message.id && <div ref={reactionPickerRef} className="chat-reaction-picker chat-reaction-picker-fixed" style={reactionPickerPosition ?? { left: 10, top: 10 }} aria-label="เลือก Reaction">
            {REACTION_OPTIONS.map((reaction) => <button type="button" key={reaction.id} aria-label={`React ${reaction.name}`} title={reaction.name} onClick={() => { void onToggleReaction(message.id, reaction.id); setReactionPickerFor(null); }}><img src={reaction.image} alt="" /></button>)}
          </div>}
        </div>}
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
        return <article className={`group-message ${message.role === 'self' ? 'own-message' : ''} ${message.isAi ? 'ai-room-message' : ''} ${message.isStreaming ? 'is-streaming' : ''}`} key={message.id}>
          <button type="button" className={`member-avatar avatar-${message.tone} ${message.isAi ? 'ai-room-avatar' : ''}`} aria-label={message.isAi ? 'AI' : `ดูโปรไฟล์ ${senderName}`} onClick={openProfile}>{message.isAi ? <PigeonLogo className="ai-chat-avatar-logo" /> : memberProfile?.avatar_url ? <img src={memberProfile.avatar_url} alt="" /> : message.avatar}</button>
          <div className="group-message-content">
            <div className="member-line"><button type="button" className={`member-name-button ${message.isAi ? 'ai-room-sender' : ''}`} onClick={openProfile}>{senderName}</button><time>{message.time}</time></div>
            <div className="group-message-items">{group.map((item) => {
              const canReact = !item.replyToId && !item.isAi;
              return <div id={`chat-message-${item.id}`} className={`chat-message-entry ${jumpingToId === item.id ? 'jump-highlight' : ''}`} key={item.id}>
                {item.replyToId && <button type="button" className="chat-reply-preview" title="ไปยังข้อความต้นฉบับ" onClick={() => { void jumpTo(item.replyToId!); }}><strong>{item.replyToSender ?? 'ข้อความที่ตอบกลับ'}</strong><span>{item.replyToText || 'ไฟล์แนบ'}</span></button>}
                <div className={`chat-message-bubble-wrap ${item.isAi ? 'ai-room-bubble-wrap' : ''}`}>
                  {item.isAi ? <StreamingAiContent content={item.text} streaming={Boolean(item.isStreaming)} messageId={item.id} /> : <MessageContent content={item.text} />}
                  {canReact && renderReactionChips(item)}
                </div>
                {!item.isAi && renderMessageActions(item, canReact)}
              </div>;
            })}</div>
          </div>
        </article>;
      })}
      {messages.length === 0 && <p className="no-chat-messages">ยังไม่มีข้อความในห้องนี้ เริ่มคุยกันได้เลย</p>}
      {typingText && <div className="typing-indicator" role="status" aria-live="polite">
        <span className="typing-dots" aria-hidden="true"><i /><i /><i /></span>
        <span>{typingText}</span>
      </div>}
      {aiStatus && <div className="typing-indicator ai-room-status" role="status" aria-live="polite"><span className="typing-dots" aria-hidden="true"><i /><i /><i /></span><span>{aiStatus}</span></div>}
      <div ref={bottomRef} />
    </div>
  </section>;
}
