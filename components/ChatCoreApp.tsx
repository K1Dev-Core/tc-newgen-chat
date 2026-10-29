'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ChatPanel } from './ChatPanel';
import { BoardPanel } from './BoardPanel';
import { Composer } from './Composer';
import { Toast } from './Toast';
import { LoadingOverlay } from './LoadingOverlay';
import { ProfileDialog } from './ProfileDialog';
import { JoinChatDialog } from './JoinChatDialog';
import type { MemberProfile } from './ProfileDialog';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { ChatMessage, ChatRoom, ChatServer, MessageReaction } from '@/lib/types';
import { parseChatContent, serializeChatContent, type ChatFileAttachment } from '@/lib/chat-files';
import { uploadChatFile } from '@/lib/file-upload-client';
import { SFX_CATALOG, type RemoteSfxItem } from '@/lib/sfx-catalog';

const DEFAULT_ROOM_SLUG = 'nok-phirab-sue-sarn';
const SFX_COOLDOWN_MS = 30_000;
const SFX_CLIENT_ID_KEY = 'tc-newgen:sfx-client-id';
const SFX_COOLDOWN_KEY = 'tc-newgen:sfx-cooldown-until';
const SFX_EVENT_KEY_PREFIX = 'tc-newgen:sfx-event:';

function claimSfxEvent(eventId: string): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const key = `${SFX_EVENT_KEY_PREFIX}${eventId}`;
    if (window.localStorage.getItem(key)) return false;
    const now = Date.now();
    window.localStorage.setItem(key, String(now));
    const eventKeys: Array<{ key: string; time: number }> = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const existingKey = window.localStorage.key(index);
      if (!existingKey?.startsWith(SFX_EVENT_KEY_PREFIX)) continue;
      const time = Number(window.localStorage.getItem(existingKey));
      if (!Number.isFinite(time) || now - time > 120_000) window.localStorage.removeItem(existingKey);
      else eventKeys.push({ key: existingKey, time });
    }
    eventKeys.sort((a, b) => a.time - b.time);
    eventKeys.slice(0, Math.max(0, eventKeys.length - 200)).forEach(({ key: oldKey }) => window.localStorage.removeItem(oldKey));
    return true;
  } catch {
    // Storage can be unavailable in private browsing; in-memory event IDs still dedupe.
    return true;
  }
}

function runSfxEventOnce(eventId: string, play: () => void) {
  if (!eventId) return;
  const claimAndPlay = () => {
    if (claimSfxEvent(eventId)) play();
  };
  if (typeof navigator !== 'undefined' && navigator.locks) {
    void navigator.locks.request(`tc-newgen:sfx:${eventId}`, { ifAvailable: true }, (lock) => {
      if (lock) claimAndPlay();
    }).catch(claimAndPlay);
  } else {
    claimAndPlay();
  }
}

type MessageRow = {
  id: string;
  sender_id: string | null;
  sender_name: string;
  content: string;
  created_at: string;
  reply_to_id?: string | null;
};

type ReplyTargetRow = { id: string; sender_name: string; content: string };

async function hydrateMessageReplies(supabase: SupabaseClient, rows: MessageRow[], currentUserId?: string): Promise<ChatMessage[]> {
  const messages = rows.map((row) => toChatMessage(row, currentUserId));
  const replyIds = [...new Set(messages.map((message) => message.replyToId).filter((id): id is string => Boolean(id)))];
  if (!replyIds.length) return messages;

  const { data } = await supabase.from('messages').select('id,sender_name,content').in('id', replyIds);
  const replies = new Map<string, ReplyTargetRow>();
  (data as ReplyTargetRow[] | null)?.forEach((row) => replies.set(row.id, row));
  return messages.map((message) => {
    if (!message.replyToId) return message;
    const reply = replies.get(message.replyToId);
    if (!reply) return message;
    const parsed = parseChatContent(reply.content);
    const preview = parsed.text.trim() || (parsed.files.length ? `ไฟล์แนบ: ${parsed.files.map((file) => file.filename).join(', ')}` : '');
    return { ...message, replyToSender: reply.sender_name, replyToText: preview.slice(0, 180) };
  });
}

type TypingPayload = {
  client_id: string;
  user_id: string;
  display_name: string;
  is_typing: boolean;
};

type SfxPayload = {
  event_id: string;
  sfx_id: string;
  sender_name: string;
  client_id: string;
};

function toChatMessage(row: MessageRow, currentUserId?: string): ChatMessage {
  const sender = row.sender_name || 'Guest';
  const first = Array.from(sender.trim())[0] ?? '?';
  const tones: ChatMessage['tone'][] = ['lavender', 'plum', 'gold'];
  const toneIndex = Array.from(row.sender_id ?? sender).reduce((sum, char) => sum + char.charCodeAt(0), 0) % tones.length;
  return {
    id: row.id,
    role: row.sender_id && row.sender_id === currentUserId ? 'self' : 'friend',
    sender,
    senderId: row.sender_id,
    avatar: first.toLocaleUpperCase(),
    tone: tones[toneIndex],
    text: row.content,
    time: new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit' }).format(new Date(row.created_at)),
    createdAt: row.created_at,
    replyToId: row.reply_to_id ?? null,
  };
}

export function ChatCoreApp() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  if (!supabase) return <SetupScreen />;
  return <LiveGroupChat supabase={supabase} />;
}

function SetupScreen() {
  return <main className="chat-setup-screen">
    <section className="chat-setup-card">
      <p className="chat-eyebrow">ทีซี นิวเจน · REALTIME CHAT</p>
      <h1>ตั้งค่า Supabase ก่อนเริ่มแชต</h1>
      <p>เพิ่ม URL และ Publishable key ในไฟล์ <code>.env.local</code> แล้วรัน SQL migration เพื่อเชื่อมฐานข้อมูลและเปิด realtime</p>
      <pre>NEXT_PUBLIC_SUPABASE_URL=…<br />NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=…</pre>
      <p className="setup-help">เปิด Anonymous Sign-ins ใน Supabase Auth ด้วย ผู้ใช้จะใส่แค่ชื่อ ไม่ต้องกรอกอีเมลหรือรหัสผ่าน</p>
    </section>
  </main>;
}

function LiveGroupChat({ supabase }: { supabase: SupabaseClient }) {
  const [servers, setServers] = useState<ChatServer[]>([]);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeRoomSlug, setActiveRoomSlug] = useState(DEFAULT_ROOM_SLUG);
  const [activeBoardServerId, setActiveBoardServerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactionRows, setReactionRows] = useState<MessageReaction[]>([]);
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [memberProfiles, setMemberProfiles] = useState<Record<string, MemberProfile>>({});
  const [activeProfile, setActiveProfile] = useState<{ profile: MemberProfile; editable: boolean } | null>(null);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const activeRoom = rooms.find((room) => room.slug === activeRoomSlug);
  const activeBoardServer = activeBoardServerId ? servers.find((server) => server.id === activeBoardServerId) : undefined;
  const activeServer = activeBoardServer ?? (activeRoom ? servers.find((server) => server.id === activeRoom.server_id) : undefined);
  const roomId = activeRoom?.id ?? '';
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [roomError, setRoomError] = useState('');
  const [toastText, setToastText] = useState('');
  const [toastKey, setToastKey] = useState(0);
  const [activeSfx, setActiveSfx] = useState<{ item: RemoteSfxItem; sender: string; eventId: string } | null>(null);
  const [sfxCooldownRemaining, setSfxCooldownRemaining] = useState(0);
  const [projectOpen, setProjectOpen] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const typingClientsRef = useRef(new Map<string, { name: string; timeout: ReturnType<typeof setTimeout> }>());
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingActiveRef = useRef(false);
  const lastTypingBroadcastRef = useRef(0);
  const clientIdRef = useRef('');
  const sfxTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sfxAudioRef = useRef<HTMLAudioElement | null>(null);
  const seenSfxEventsRef = useRef(new Set<string>());
  const sfxCooldownUntilRef = useRef(0);
  const pendingReactionsRef = useRef(new Set<string>());

  useEffect(() => {
    let sharedClientId = '';
    try {
      sharedClientId = window.localStorage.getItem(SFX_CLIENT_ID_KEY) ?? '';
      if (!sharedClientId) {
        sharedClientId = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
        window.localStorage.setItem(SFX_CLIENT_ID_KEY, sharedClientId);
      }
    } catch {
      sharedClientId = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
    }
    clientIdRef.current = sharedClientId;
  }, []);

  useEffect(() => {
    if (!sfxCooldownRemaining) return;
    const interval = setInterval(() => setSfxCooldownRemaining((remaining) => Math.max(0, remaining - 100)), 100);
    return () => clearInterval(interval);
  }, [sfxCooldownRemaining > 0]);

  function playSfx(item: RemoteSfxItem, sender: string, eventId: string) {
    if (!eventId || seenSfxEventsRef.current.has(eventId)) return;
    seenSfxEventsRef.current.add(eventId);
    if (seenSfxEventsRef.current.size > 200) {
      const oldestEvent = seenSfxEventsRef.current.values().next().value;
      if (oldestEvent) seenSfxEventsRef.current.delete(oldestEvent);
    }
    if (sfxTimeoutRef.current) clearTimeout(sfxTimeoutRef.current);
    sfxTimeoutRef.current = null;
    setActiveSfx({ item, sender, eventId });
    const displayDuration = Math.min(Math.max(item.holdMs ?? 3600, 1000), 10_000);
    sfxTimeoutRef.current = setTimeout(() => {
      setActiveSfx((current) => current?.eventId === eventId ? null : current);
      sfxTimeoutRef.current = null;
    }, displayDuration);
    // Stop any previous clip so broadcasts from different members cannot stack
    // and sound like one SFX was played repeatedly.
    if (sfxAudioRef.current) {
      sfxAudioRef.current.pause();
      sfxAudioRef.current.currentTime = 0;
    }
    const audio = new Audio(item.url);
    audio.loop = false;
    audio.preload = 'auto';
    sfxAudioRef.current = audio;
    void audio.play().catch((error: unknown) => {
      if (sfxAudioRef.current === audio) sfxAudioRef.current = null;
      console.debug('[SFX] Playback was blocked; it will not be queued for a later replay.', error);
    });
  }

  function notify(message: string) {
    setToastText(message);
    setToastKey((value) => value + 1);
  }

  useEffect(() => {
    let alive = true;
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive) setUser(session?.user ?? null);
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (alive) setUser(data.session?.user ?? null);
    });
    return () => {
      alive = false;
      authListener.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    let alive = true;
    if (!user) {
      setDisplayName('');
      setProfileLoading(false);
      return () => { alive = false; };
    }
    setProfileLoading(true);
    void supabase.from('profiles').select('id,display_name,avatar_url').eq('id', user.id).maybeSingle().then(({ data, error }) => {
      if (!alive) return;
      if (error) notify('โหลดชื่อโปรไฟล์ไม่สำเร็จ');
      setDisplayName(data?.display_name && data.display_name !== 'Guest' ? data.display_name : '');
      if (data) setMemberProfiles((current) => ({ ...current, [data.id]: data as MemberProfile }));
      setProfileLoading(false);
    });
    return () => { alive = false; };
  }, [supabase, user?.id]);

  useEffect(() => {
    let alive = true;
    const applyProfile = (row: MemberProfile) => {
      setMemberProfiles((current) => ({ ...current, [row.id]: row }));
      if (row.id === user?.id) setDisplayName(row.display_name === 'Guest' ? '' : row.display_name);
    };
    void supabase.from('profiles').select('id,display_name,avatar_url').then(({ data, error }) => {
      if (!alive) return;
      if (error) { notify('โหลดโปรไฟล์สมาชิกไม่สำเร็จ'); return; }
      (data as MemberProfile[] | null)?.forEach(applyProfile);
    });
    const channel = supabase.channel('member-profile-updates').on('postgres_changes',
      { event: '*', schema: 'public', table: 'profiles' },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          const row = payload.old as Partial<MemberProfile>;
          if (row.id) setMemberProfiles((current) => { const next = { ...current }; delete next[row.id!]; return next; });
          return;
        }
        applyProfile(payload.new as MemberProfile);
      },
    ).subscribe();
    return () => { alive = false; void supabase.removeChannel(channel); };
  }, [supabase, user?.id]);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      supabase.from('servers').select('id,name').order('name'),
      supabase.from('chat_rooms').select('id,server_id,slug,name').order('created_at'),
    ]).then(([serverResult, roomResult]) => {
      if (!alive) return;
      if (serverResult.error || roomResult.error) {
        setRoomError('โหลดรายการเซิร์ฟเวอร์ไม่สำเร็จ ตรวจ migration และสิทธิ์อ่านข้อมูลใน Supabase');
        setLoading(false);
        return;
      }
      const nextServers = (serverResult.data ?? []) as ChatServer[];
      const nextRooms = (roomResult.data ?? []) as ChatRoom[];
      setServers(nextServers);
      setRooms(nextRooms);
      if (!nextRooms.length) {
        setRoomError('ยังไม่มีห้องแชทในฐานข้อมูล ตรวจ migration ใน Supabase');
        setLoading(false);
        return;
      }
      if (!nextRooms.some((room) => room.slug === activeRoomSlug)) {
        setActiveRoomSlug(nextRooms[0].slug);
      }
    });
    return () => { alive = false; };
  }, [supabase]);

  function selectRoom(slug: string) {
    setActiveBoardServerId(null);
    if (slug === activeRoomSlug) { setMobileSidebarOpen(false); return; }
    setLoading(true);
    setRoomError('');
    setMessages([]);
    setReactionRows([]);
    setReplyTarget(null);
    setTypingNames([]);
    setActiveRoomSlug(slug);
    setMobileSidebarOpen(false);
  }

  function selectBoard(serverId: string) {
    setActiveBoardServerId(serverId);
    setMobileSidebarOpen(false);
  }

  const messageIdsKey = messages.map((message) => message.id).join(',');
  useEffect(() => {
    if (!roomId || !messageIdsKey) { setReactionRows([]); return; }
    let alive = true;
    const ids = messageIdsKey.split(',');
    void supabase.from('message_reactions').select('message_id,user_id,emoji').eq('room_id', roomId).in('message_id', ids).then(({ data, error }) => {
      if (!alive) return;
      if (error) { notify('โหลด Reaction ไม่สำเร็จ ตรวจ migration ของ Reaction ใน Supabase'); return; }
      setReactionRows((current) => {
        const merged = new Map(current.map((reaction) => [`${reaction.message_id}:${reaction.user_id}:${reaction.emoji}`, reaction]));
        (data as MessageReaction[] | null)?.forEach((reaction) => merged.set(`${reaction.message_id}:${reaction.user_id}:${reaction.emoji}`, reaction));
        return [...merged.values()].filter((reaction) => ids.includes(reaction.message_id));
      });
    });
    return () => { alive = false; };
  }, [supabase, roomId, messageIdsKey]);

  useEffect(() => {
    if (!roomId || activeBoardServerId) { setOnlineCount(0); return; }
    let alive = true;
    setOnlineCount(0);
    const refreshOnlineCount = () => {
      const uniqueMembers = new Set<string>();
      Object.entries(channel.presenceState()).forEach(([presenceKey, entries]) => entries.forEach((entry) => {
        const member = entry as { user_id?: string; client_id?: string };
        uniqueMembers.add(member.user_id ?? member.client_id ?? presenceKey);
      }));
      setOnlineCount(uniqueMembers.size);
    };
    const channel = supabase.channel(`chat-room:${roomId}`, {
      config: { broadcast: { self: false }, presence: { key: clientIdRef.current || roomId } },
    }).on('presence', { event: 'sync' }, refreshOnlineCount)
      .on('presence', { event: 'join' }, refreshOnlineCount)
      .on('presence', { event: 'leave' }, refreshOnlineCount)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
      const typing = payload as TypingPayload;
      if (!typing?.client_id || typing.client_id === clientIdRef.current || !typing.display_name) return;

      const existing = typingClientsRef.current.get(typing.client_id);
      if (existing) clearTimeout(existing.timeout);
      if (typing.is_typing) {
        const timeout = setTimeout(() => {
          typingClientsRef.current.delete(typing.client_id);
          setTypingNames(Array.from(typingClientsRef.current.values(), (entry) => entry.name));
        }, 4000);
        typingClientsRef.current.set(typing.client_id, { name: typing.display_name, timeout });
      } else {
        typingClientsRef.current.delete(typing.client_id);
      }
      setTypingNames(Array.from(typingClientsRef.current.values(), (entry) => entry.name));
    }).on('broadcast', { event: 'sfx' }, ({ payload }) => {
      const sfx = payload as SfxPayload;
      if (sfx?.client_id && sfx.client_id === clientIdRef.current) return;
      const item = SFX_CATALOG.find((entry) => entry.id === sfx?.sfx_id);
      if (!item || !sfx.event_id || !sfx.sender_name) return;
      runSfxEventOnce(sfx.event_id, () => playSfx(item, sfx.sender_name, sfx.event_id));
    }).on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
      (payload) => {
        void hydrateMessageReplies(supabase, [payload.new as MessageRow], user?.id).then(([message]) => {
          setMessages((current) => current.some((item) => item.id === message.id)
            ? current
            : [...current, message].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
        });
      },
    ).on('postgres_changes',
      { event: '*', schema: 'public', table: 'message_reactions', filter: `room_id=eq.${roomId}` },
      (payload) => {
        const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as MessageReaction & { room_id?: string };
        if (!row?.message_id || !row.user_id || !row.emoji) return;
        const key = `${row.message_id}:${row.user_id}:${row.emoji}`;
        setReactionRows((current) => {
          const next = new Map(current.map((reaction) => [`${reaction.message_id}:${reaction.user_id}:${reaction.emoji}`, reaction]));
          if (payload.eventType === 'DELETE') next.delete(key);
          else next.set(key, row);
          return [...next.values()];
        });
      },
    ).subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void channel.track({ client_id: clientIdRef.current, user_id: user?.id ?? undefined, display_name: displayName || 'ผู้เยี่ยมชม' }).catch((error) => {
          console.error('[Chat] Presence track failed.', { roomId, error });
        });
      }
    });
    typingChannelRef.current = channel;

    void supabase.from('messages')
      .select('id,sender_id,sender_name,content,created_at,reply_to_id')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })
      .limit(100)
      .then(async ({ data, error }) => {
        if (!alive) return;
        if (error) notify('โหลดประวัติแชตไม่สำเร็จ');
        if (data) {
          const fetched = await hydrateMessageReplies(supabase, data as MessageRow[], user?.id);
          if (!alive) return;
          setMessages((current) => {
            const merged = new Map(fetched.map((item) => [item.id, item]));
            current.forEach((item) => merged.set(item.id, item));
            return [...merged.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          });
        }
        setLoading(false);
      });

    return () => {
      alive = false;
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingActiveRef.current = false;
      lastTypingBroadcastRef.current = 0;
      typingClientsRef.current.forEach(({ timeout }) => clearTimeout(timeout));
      typingClientsRef.current.clear();
      if (sfxTimeoutRef.current) clearTimeout(sfxTimeoutRef.current);
      sfxTimeoutRef.current = null;
      if (sfxAudioRef.current) {
        sfxAudioRef.current.pause();
        sfxAudioRef.current.currentTime = 0;
        sfxAudioRef.current = null;
      }
      setActiveSfx(null);
      setOnlineCount(0);
      typingChannelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [supabase, roomId, user?.id, displayName, activeBoardServerId]);

  function broadcastTyping(isTyping: boolean) {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = null;

    const channel = typingChannelRef.current;
    if (!isTyping || !user || !displayName || !channel) {
      if (!typingActiveRef.current) return;
      typingActiveRef.current = false;
      lastTypingBroadcastRef.current = 0;
      if (channel && user && displayName) {
        void channel.send({
          type: 'broadcast',
          event: 'typing',
          payload: { client_id: clientIdRef.current, user_id: user.id, display_name: displayName, is_typing: false } satisfies TypingPayload,
        });
      }
      return;
    }

    typingActiveRef.current = true;
    const sendTyping = () => channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { client_id: clientIdRef.current, user_id: user.id, display_name: displayName, is_typing: true } satisfies TypingPayload,
    });
    if (Date.now() - lastTypingBroadcastRef.current >= 1000) {
      lastTypingBroadcastRef.current = Date.now();
      void sendTyping();
    }
    typingTimeoutRef.current = setTimeout(() => {
      if (!typingActiveRef.current) return;
      typingActiveRef.current = false;
      lastTypingBroadcastRef.current = 0;
      void channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { client_id: clientIdRef.current, user_id: user.id, display_name: displayName, is_typing: false } satisfies TypingPayload,
      });
    }, 3000);
  }

  async function broadcastSfx(item: RemoteSfxItem) {
    if (!user || !displayName) { notify('เข้าร่วมแชทก่อนจึงจะส่งเสียงให้ทุกคนได้'); return; }
    const channel = typingChannelRef.current;
    if (!channel) { notify('กำลังเชื่อมต่อห้องแชท ลองอีกครั้ง'); return; }
    const now = Date.now();
    let cooldownUntil = sfxCooldownUntilRef.current;
    try { cooldownUntil = Math.max(cooldownUntil, Number(window.localStorage.getItem(SFX_COOLDOWN_KEY)) || 0); } catch { /* use the in-memory cooldown */ }
    if (cooldownUntil > now) {
      sfxCooldownUntilRef.current = cooldownUntil;
      setSfxCooldownRemaining(cooldownUntil - now);
      notify(`รออีก ${Math.ceil((cooldownUntil - now) / 1000)} วินาทีจึงจะเล่น SFX ได้`);
      return;
    }
    sfxCooldownUntilRef.current = now + SFX_COOLDOWN_MS;
    try { window.localStorage.setItem(SFX_COOLDOWN_KEY, String(sfxCooldownUntilRef.current)); } catch { /* keep cooldown in memory */ }
    setSfxCooldownRemaining(SFX_COOLDOWN_MS);
    const eventId = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
    runSfxEventOnce(eventId, () => playSfx(item, displayName, eventId));
    const result = await channel.send({
      type: 'broadcast',
      event: 'sfx',
      payload: { event_id: eventId, sfx_id: item.id, sender_name: displayName, client_id: clientIdRef.current } satisfies SfxPayload,
    });
    if (result !== 'ok') notify('เสียงเล่นในเครื่องแล้ว แต่ส่งไปยังสมาชิกคนอื่นไม่สำเร็จ ลองอีกครั้ง');
  }

  async function setName(name: string, avatarUrl: string | null): Promise<boolean> {
    const normalized = name.trim().replace(/\s+/g, ' ');
    if (normalized.length < 1 || normalized.length > 32) {
      notify('ชื่อต้องมีความยาว 1–32 ตัวอักษร');
      return false;
    }

    setActionLoading(true);
    try {
      let activeUser = user;
      if (!activeUser) {
        const { data, error } = await supabase.auth.signInAnonymously({ options: { data: { display_name: normalized } } });
        if (error || !data.user) {
          notify(error?.message ?? 'เริ่มแชตไม่สำเร็จ เปิด Anonymous Sign-ins ใน Supabase Auth');
          return false;
        }
        activeUser = data.user;
        setUser(data.user);
      }

      const { error } = await supabase.from('profiles').update({ display_name: normalized, avatar_url: avatarUrl }).eq('id', activeUser.id);
      if (error) {
        notify('บันทึกชื่อไม่สำเร็จ ตรวจ migration และ RLS policy');
        return false;
      }
      setDisplayName(normalized);
      setMemberProfiles((current) => ({ ...current, [activeUser!.id]: { id: activeUser!.id, display_name: normalized, avatar_url: avatarUrl } }));
      notify(`เข้าร่วมแชตในชื่อ ${normalized}`);
      return true;
    } finally {
      setActionLoading(false);
    }
  }

  async function saveProfile(name: string, avatarUrl: string | null) {
    if (!user) return;
    const normalized = name.trim().replace(/\s+/g, ' ');
    if (normalized.length < 1 || normalized.length > 32) { notify('ชื่อต้องมีความยาว 1–32 ตัวอักษร'); return; }
    setActionLoading(true);
    try {
      const { error } = await supabase.from('profiles').update({ display_name: normalized, avatar_url: avatarUrl }).eq('id', user.id);
      if (error) { notify('บันทึกโปรไฟล์ไม่สำเร็จ ตรวจ migration และ RLS policy'); return; }
      const profile = { id: user.id, display_name: normalized, avatar_url: avatarUrl };
      setDisplayName(normalized);
      setMemberProfiles((current) => ({ ...current, [user.id]: profile }));
      setActiveProfile(null);
      notify('อัปเดตโปรไฟล์แล้ว สมาชิกทุกคนจะเห็นการเปลี่ยนแปลงทันที');
    } finally {
      setActionLoading(false);
    }
  }

  async function signOut() {
    setActionLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) { notify('ออกจากระบบไม่สำเร็จ ลองอีกครั้ง'); return; }
      setActiveProfile(null);
      setDisplayName('');
      notify('ออกจากระบบแล้ว');
    } finally {
      setActionLoading(false);
    }
  }

  async function uploadFile(file: File, onProgress: (percentage: number) => void) {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session || !displayName) throw new Error('เข้าร่วมแชทก่อนจึงจะอัปโหลดไฟล์ได้');
    return uploadChatFile(file, data.session.access_token, onProgress);
  }

  async function sendMessage(text: string, files: ChatFileAttachment[] = [], replyToId?: string): Promise<boolean> {
    if (!user || !displayName || !roomId) return false;
    const content = serializeChatContent(text, files);
    if (new TextEncoder().encode(content).byteLength > 180000) {
      notify('ข้อความและข้อมูลไฟล์ต้องมีขนาดไม่เกิน 180 KB');
      return false;
    }
    setSendingMessage(true);
    try {
      const { data, error } = await supabase.from('messages').insert({
        room_id: roomId,
        sender_id: user.id,
        sender_name: displayName,
        content,
        reply_to_id: replyToId ?? null,
      }).select('id,sender_id,sender_name,content,created_at,reply_to_id').single();

      if (error || !data) {
        console.error('[Chat] Message insert failed.', { roomId, userId: user.id, error });
        notify(error?.message ? `ส่งข้อความไม่สำเร็จ: ${error.message}` : 'ส่งข้อความไม่สำเร็จ ลองอีกครั้ง');
        return false;
      }
      const [message] = await hydrateMessageReplies(supabase, [data as MessageRow], user.id);
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
      return true;
    } catch (error) {
      console.error('[Chat] Message insert threw an unexpected error.', { roomId, userId: user.id, error });
      notify(error instanceof Error ? `ส่งข้อความไม่สำเร็จ: ${error.message}` : 'ส่งข้อความไม่สำเร็จ ลองอีกครั้ง');
      return false;
    } finally {
      setSendingMessage(false);
    }
  }

  async function searchMessages(query: string): Promise<ChatMessage[]> {
    if (!roomId) return [];
    const pattern = query.replace(/[\\%_]/g, '\\$&');
    const columns = 'id,sender_id,sender_name,content,created_at,reply_to_id';
    const [contentResult, senderResult] = await Promise.all([
      supabase.from('messages').select(columns).eq('room_id', roomId).ilike('content', `%${pattern}%`).order('created_at', { ascending: false }).limit(100),
      supabase.from('messages').select(columns).eq('room_id', roomId).ilike('sender_name', `%${pattern}%`).order('created_at', { ascending: false }).limit(100),
    ]);
    if (contentResult.error || senderResult.error) throw contentResult.error ?? senderResult.error;
    const unique = new Map<string, MessageRow>();
    (contentResult.data as MessageRow[] | null)?.forEach((row) => unique.set(row.id, row));
    (senderResult.data as MessageRow[] | null)?.forEach((row) => unique.set(row.id, row));
    const rows = [...unique.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 100);
    return hydrateMessageReplies(supabase, rows, user?.id);
  }

  async function jumpToMessage(messageId: string): Promise<void> {
    if (messages.some((message) => message.id === messageId)) return;
    const { data, error } = await supabase.from('messages').select('id,sender_id,sender_name,content,created_at,reply_to_id').eq('room_id', roomId).eq('id', messageId).maybeSingle();
    if (error || !data) { notify('เปิดข้อความต้นฉบับไม่สำเร็จ'); return; }
    const [message] = await hydrateMessageReplies(supabase, [data as MessageRow], user?.id);
    setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  }

  async function toggleReaction(messageId: string, emoji: string): Promise<void> {
    if (!user || !displayName || !roomId) { notify('เข้าร่วมแชทก่อนจึงจะกด Reaction ได้'); return; }
    const key = `${messageId}:${user.id}:${emoji}`;
    if (pendingReactionsRef.current.has(key)) return;
    pendingReactionsRef.current.add(key);
    const existing = reactionRows.some((reaction) => reaction.message_id === messageId && reaction.user_id === user.id && reaction.emoji === emoji);
    setReactionRows((current) => existing
      ? current.filter((reaction) => !(reaction.message_id === messageId && reaction.user_id === user.id && reaction.emoji === emoji))
      : [...current, { message_id: messageId, user_id: user.id, emoji }]);
    try {
      const result = existing
        ? await supabase.from('message_reactions').delete().eq('room_id', roomId).eq('message_id', messageId).eq('user_id', user.id).eq('emoji', emoji)
        : await supabase.from('message_reactions').insert({ room_id: roomId, message_id: messageId, user_id: user.id, emoji });
      if (result.error) throw result.error;
    } catch (error) {
      setReactionRows((current) => existing
        ? [...current, { message_id: messageId, user_id: user.id, emoji }]
        : current.filter((reaction) => !(reaction.message_id === messageId && reaction.user_id === user.id && reaction.emoji === emoji)));
      console.error('[Chat] Reaction update failed.', { roomId, messageId, error });
      notify('บันทึก Reaction ไม่สำเร็จ ตรวจ migration และสิทธิ์ใน Supabase');
    } finally {
      pendingReactionsRef.current.delete(key);
    }
  }

  return <div className={`app-shell theme-light ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${mobileSidebarOpen ? 'mobile-sidebar-open' : ''}`}>
    <Sidebar servers={servers} rooms={rooms} activeRoomSlug={activeRoomSlug} activeBoardServerId={activeBoardServerId} onSelectRoom={selectRoom} onSelectBoard={selectBoard} collapsed={sidebarCollapsed} onToggleCollapsed={() => setSidebarCollapsed((value) => !value)} />
    {mobileSidebarOpen && <button className="sidebar-backdrop" aria-label="Close project sidebar" onClick={() => setMobileSidebarOpen(false)} />}
    <main className="main-area">
      <Topbar serverName={activeServer?.name ?? ''} roomName={activeBoardServer ? 'บอร์ด' : activeRoom?.name ?? ''} roomId={roomId} viewerId={user?.id ?? null} onlineCount={onlineCount} supabase={supabase} isBoard={Boolean(activeBoardServer)} onToggleSidebar={() => setMobileSidebarOpen((open) => !open)} profile={user && displayName ? memberProfiles[user.id] ?? { id: user.id, display_name: displayName, avatar_url: null } : null} memberProfiles={memberProfiles} onSearchMessages={searchMessages} onJumpToMessage={jumpToMessage} onOpenProfile={() => { if (user && displayName) setActiveProfile({ profile: memberProfiles[user.id] ?? { id: user.id, display_name: displayName, avatar_url: null }, editable: true }); }} />
      {activeBoardServer ? <BoardPanel serverId={activeBoardServer.id} serverName={activeBoardServer.name} supabase={supabase} canEdit={Boolean(user && displayName)} userId={user?.id ?? null} userName={displayName || 'ผู้เยี่ยมชม'} avatarUrl={user ? memberProfiles[user.id]?.avatar_url ?? null : null} onJoin={() => setJoinDialogOpen(true)} onNotify={notify} />
        : roomError ? <div className="chat-status-error">{roomError}</div> : loading ? <div aria-hidden="true" /> : <ChatPanel roomName={activeRoom?.name ?? ''} messages={messages} typingNames={typingNames} memberProfiles={memberProfiles} reactions={reactionRows} viewerId={user?.id ?? null} onOpenProfile={(profile) => setActiveProfile({ profile, editable: profile.id === user?.id })} onJumpToMessage={jumpToMessage} onReply={setReplyTarget} onToggleReaction={toggleReaction} />}
      {!activeBoardServer && <Composer canSend={Boolean(user && displayName && roomId && !roomError)} sending={sendingMessage} sfxCooldownRemaining={sfxCooldownRemaining} replyTarget={replyTarget} onCancelReply={() => setReplyTarget(null)} onOpenJoin={() => setJoinDialogOpen(true)} onSend={sendMessage} onUploadFile={uploadFile} onNotify={notify} onTyping={broadcastTyping} onPlaySfx={broadcastSfx} />}
    </main>
    {activeSfx && <aside key={activeSfx.eventId} className="mini-sfx-player" role="status" aria-live="polite" aria-label={`${activeSfx.item.name} เล่นโดย ${activeSfx.sender}`}>
      <span className="mini-sfx-vinyl" aria-hidden="true" title={`${activeSfx.item.name} · เล่นโดย ${activeSfx.sender}`}><i /></span>
      <span className="mini-sfx-sender">โดย {activeSfx.sender}</span>
    </aside>}
    {(loading || profileLoading) && <LoadingOverlay label={profileLoading ? 'กำลังโหลดโปรไฟล์…' : 'กำลังโหลดแชต…'} />}
    {activeProfile && <ProfileDialog profile={activeProfile.profile} editable={activeProfile.editable} onClose={() => setActiveProfile(null)} onSave={saveProfile} onSignOut={signOut} saving={actionLoading} />}
    {joinDialogOpen && <JoinChatDialog onClose={() => setJoinDialogOpen(false)} onJoin={setName} saving={actionLoading} />}
    <Toast message={toastText} toastKey={toastKey} />
  </div>;
}
