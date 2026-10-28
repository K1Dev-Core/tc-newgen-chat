'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ChatPanel } from './ChatPanel';
import { Composer } from './Composer';
import { Toast } from './Toast';
import { LoadingOverlay } from './LoadingOverlay';
import { ProfileDialog } from './ProfileDialog';
import { JoinChatDialog } from './JoinChatDialog';
import type { MemberProfile } from './ProfileDialog';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { ChatMessage, ViewId } from '@/lib/types';
import { serializeChatContent, type ChatFileAttachment } from '@/lib/chat-files';
import { uploadChatFile } from '@/lib/file-upload-client';
import { SFX_CATALOG, type RemoteSfxItem } from '@/lib/sfx-catalog';

const ROOM_SLUG = 'nok-phirab-sue-sarn';
const SFX_COOLDOWN_MS = 3000;

type MessageRow = {
  id: string;
  sender_id: string | null;
  sender_name: string;
  content: string;
  created_at: string;
};

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
  const [activeView, setActiveView] = useState<ViewId>('Chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [memberProfiles, setMemberProfiles] = useState<Record<string, MemberProfile>>({});
  const [activeProfile, setActiveProfile] = useState<{ profile: MemberProfile; editable: boolean } | null>(null);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [roomId, setRoomId] = useState('');
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
  const pendingSfxRef = useRef<string[]>([]);
  const sfxCooldownUntilRef = useRef(0);

  useEffect(() => {
    clientIdRef.current = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
    SFX_CATALOG.filter((item) => item.gif).forEach((item) => {
      const image = new Image();
      image.src = item.gif!;
    });
  }, []);

  useEffect(() => {
    const playPendingSfx = () => {
      const pending = pendingSfxRef.current.splice(0);
      pending.forEach((url) => {
        const audio = new Audio(url);
        void audio.play().catch(() => { pendingSfxRef.current.unshift(url); });
      });
    };
    window.addEventListener('pointerdown', playPendingSfx);
    window.addEventListener('keydown', playPendingSfx);
    return () => {
      window.removeEventListener('pointerdown', playPendingSfx);
      window.removeEventListener('keydown', playPendingSfx);
    };
  }, []);

  useEffect(() => {
    if (!sfxCooldownRemaining) return;
    const interval = setInterval(() => setSfxCooldownRemaining((remaining) => Math.max(0, remaining - 100)), 100);
    return () => clearInterval(interval);
  }, [sfxCooldownRemaining > 0]);

  function playSfx(item: RemoteSfxItem, sender: string, eventId: string) {
    if (sfxTimeoutRef.current) clearTimeout(sfxTimeoutRef.current);
    setActiveSfx({ item, sender, eventId });
    sfxTimeoutRef.current = setTimeout(() => setActiveSfx(null), item.holdMs ?? 3600);
    const audio = new Audio(item.url);
    audio.preload = 'auto';
    void audio.play().catch(() => {
      pendingSfxRef.current = [...pendingSfxRef.current.slice(-2), item.url];
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
    void supabase.from('chat_rooms').select('id').eq('slug', ROOM_SLUG).single().then(({ data, error }) => {
      if (!alive) return;
      if (error || !data) {
        setRoomError('ยังหา channel ไม่เจอ ตรวจว่าได้รัน migration ใน Supabase แล้ว');
        setLoading(false);
        return;
      }
      setRoomId(data.id);
    });
    return () => { alive = false; };
  }, [supabase]);

  useEffect(() => {
    if (!roomId) return;
    let alive = true;
    const channel = supabase.channel(`chat-room:${roomId}`).on('broadcast', { event: 'typing' }, ({ payload }) => {
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
      const item = SFX_CATALOG.find((entry) => entry.id === sfx?.sfx_id);
      if (!item || !sfx.event_id || !sfx.sender_name) return;
      playSfx(item, sfx.sender_name, sfx.event_id);
    }).on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
      (payload) => {
        const message = toChatMessage(payload.new as MessageRow, user?.id);
        setMessages((current) => current.some((item) => item.id === message.id)
          ? current
          : [...current, message].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
      },
    ).subscribe();
    typingChannelRef.current = channel;

    void supabase.from('messages')
      .select('id,sender_id,sender_name,content,created_at')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })
      .limit(100)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) notify('โหลดประวัติแชตไม่สำเร็จ');
        if (data) {
          const fetched = (data as MessageRow[]).map((row) => toChatMessage(row, user?.id));
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
      setActiveSfx(null);
      typingChannelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [supabase, roomId, user?.id]);

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
    if (sfxCooldownUntilRef.current > now) {
      notify(`รออีก ${Math.ceil((sfxCooldownUntilRef.current - now) / 1000)} วินาทีจึงจะเล่น SFX ได้`);
      return;
    }
    sfxCooldownUntilRef.current = now + SFX_COOLDOWN_MS;
    setSfxCooldownRemaining(SFX_COOLDOWN_MS);
    const eventId = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
    playSfx(item, displayName, eventId);
    const result = await channel.send({
      type: 'broadcast',
      event: 'sfx',
      payload: { event_id: eventId, sfx_id: item.id, sender_name: displayName } satisfies SfxPayload,
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

  async function sendMessage(text: string, files: ChatFileAttachment[] = []): Promise<boolean> {
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
      }).select('id,sender_id,sender_name,content,created_at').single();

      if (error || !data) {
        notify('ส่งข้อความไม่สำเร็จ ลองอีกครั้ง');
        return false;
      }
      const message = toChatMessage(data as MessageRow, user.id);
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
      return true;
    } catch {
      notify('ส่งข้อความไม่สำเร็จ ลองอีกครั้ง');
      return false;
    } finally {
      setSendingMessage(false);
    }
  }

  return <div className={`app-shell theme-light ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${mobileSidebarOpen ? 'mobile-sidebar-open' : ''}`}>
    <Sidebar activeView={activeView} onNavigate={(view) => { setActiveView(view); setMobileSidebarOpen(false); }} collapsed={sidebarCollapsed} onToggleCollapsed={() => setSidebarCollapsed((value) => !value)} projectOpen={projectOpen} onToggleProject={() => setProjectOpen((open) => !open)} />
    {mobileSidebarOpen && <button className="sidebar-backdrop" aria-label="Close project sidebar" onClick={() => setMobileSidebarOpen(false)} />}
    <main className="main-area">
      <Topbar onToggleSidebar={() => setMobileSidebarOpen((open) => !open)} profile={user && displayName ? memberProfiles[user.id] ?? { id: user.id, display_name: displayName, avatar_url: null } : null} onOpenProfile={() => { if (user && displayName) setActiveProfile({ profile: memberProfiles[user.id] ?? { id: user.id, display_name: displayName, avatar_url: null }, editable: true }); }} />
      {roomError ? <div className="chat-status-error">{roomError}</div> : loading ? <div aria-hidden="true" /> : <ChatPanel activeView={activeView} messages={messages} typingNames={typingNames} memberProfiles={memberProfiles} onOpenProfile={(profile) => setActiveProfile({ profile, editable: profile.id === user?.id })} />}
      <Composer canSend={Boolean(user && displayName && roomId && !roomError)} sending={sendingMessage} sfxCooldownRemaining={sfxCooldownRemaining} onOpenJoin={() => setJoinDialogOpen(true)} onSend={sendMessage} onUploadFile={uploadFile} onNotify={notify} onTyping={broadcastTyping} onPlaySfx={broadcastSfx} />
    </main>
    {activeSfx?.item.gif && <div key={activeSfx.eventId} className="sfx-stage" aria-hidden="true">
      <img src={activeSfx.item.gif} alt="" className="sfx-stage-gif" />
    </div>}
    {activeSfx && <aside key={activeSfx.eventId} className="mini-sfx-player" role="status" aria-live="polite" aria-label={`${activeSfx.item.name} เล่นโดย ${activeSfx.sender}`}>
      <span className="mini-sfx-vinyl" aria-hidden="true"><i /></span>
      <span className="mini-sfx-copy"><strong>{activeSfx.item.name}</strong><small>เล่นโดย {activeSfx.sender}</small></span>
      <span className="mini-sfx-bars" aria-hidden="true"><i /><i /><i /><i /></span>
    </aside>}
    {(loading || profileLoading) && <LoadingOverlay label={profileLoading ? 'กำลังโหลดโปรไฟล์…' : 'กำลังโหลดแชต…'} />}
    {activeProfile && <ProfileDialog profile={activeProfile.profile} editable={activeProfile.editable} onClose={() => setActiveProfile(null)} onSave={saveProfile} onSignOut={signOut} saving={actionLoading} />}
    {joinDialogOpen && <JoinChatDialog onClose={() => setJoinDialogOpen(false)} onJoin={setName} saving={actionLoading} />}
    <Toast message={toastText} toastKey={toastKey} />
  </div>;
}
