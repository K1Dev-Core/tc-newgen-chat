'use client';

import { useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ChatPanel } from './ChatPanel';
import { Composer } from './Composer';
import { Toast } from './Toast';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { ChatMessage, ViewId } from '@/lib/types';

const ROOM_SLUG = 'nok-phirab-sue-sarn';

type MessageRow = {
  id: string;
  sender_id: string | null;
  sender_name: string;
  content: string;
  created_at: string;
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
  const [user, setUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [loading, setLoading] = useState(true);
  const [roomError, setRoomError] = useState('');
  const [toastText, setToastText] = useState('');
  const [toastKey, setToastKey] = useState(0);
  const [projectOpen, setProjectOpen] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

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
      return () => { alive = false; };
    }
    void supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle().then(({ data, error }) => {
      if (!alive) return;
      if (error) notify('โหลดชื่อโปรไฟล์ไม่สำเร็จ');
      setDisplayName(data?.display_name && data.display_name !== 'Guest' ? data.display_name : '');
    });
    return () => { alive = false; };
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
    const channel = supabase.channel(`chat-room:${roomId}`).on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
      (payload) => {
        const message = toChatMessage(payload.new as MessageRow, user?.id);
        setMessages((current) => current.some((item) => item.id === message.id)
          ? current
          : [...current, message].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
      },
    ).subscribe();

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
      void supabase.removeChannel(channel);
    };
  }, [supabase, roomId, user?.id]);

  async function setName(name: string) {
    const normalized = name.trim().replace(/\s+/g, ' ');
    if (normalized.length < 1 || normalized.length > 32) {
      notify('ชื่อต้องมีความยาว 1–32 ตัวอักษร');
      return;
    }

    let activeUser = user;
    if (!activeUser) {
      const { data, error } = await supabase.auth.signInAnonymously({ options: { data: { display_name: normalized } } });
      if (error || !data.user) {
        notify(error?.message ?? 'เริ่มแชตไม่สำเร็จ เปิด Anonymous Sign-ins ใน Supabase Auth');
        return;
      }
      activeUser = data.user;
      setUser(data.user);
    }

    const { error } = await supabase.from('profiles').update({ display_name: normalized }).eq('id', activeUser.id);
    if (error) {
      notify('บันทึกชื่อไม่สำเร็จ ตรวจ migration และ RLS policy');
      return;
    }
    setDisplayName(normalized);
    notify(`เข้าร่วมแชตในชื่อ ${normalized}`);
  }

  async function sendMessage(text: string) {
    if (!user || !displayName || !roomId) return;
    const { data, error } = await supabase.from('messages').insert({
      room_id: roomId,
      sender_id: user.id,
      sender_name: displayName,
      content: text,
    }).select('id,sender_id,sender_name,content,created_at').single();

    if (error || !data) {
      notify('ส่งข้อความไม่สำเร็จ ลองอีกครั้ง');
      return;
    }
    const message = toChatMessage(data as MessageRow, user.id);
    setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
  }

  return <div className={`app-shell theme-light ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${mobileSidebarOpen ? 'mobile-sidebar-open' : ''}`}>
    <Sidebar activeView={activeView} onNavigate={(view) => { setActiveView(view); setMobileSidebarOpen(false); }} collapsed={sidebarCollapsed} onToggleCollapsed={() => setSidebarCollapsed((value) => !value)} projectOpen={projectOpen} onToggleProject={() => setProjectOpen((open) => !open)} />
    {mobileSidebarOpen && <button className="sidebar-backdrop" aria-label="Close project sidebar" onClick={() => setMobileSidebarOpen(false)} />}
    <main className="main-area">
      <Topbar onToggleSidebar={() => setMobileSidebarOpen((open) => !open)} />
      {roomError ? <div className="chat-status-error">{roomError}</div> : loading ? <div className="chat-loading">กำลังโหลดแชต…</div> : <ChatPanel activeView={activeView} messages={messages} />}
      <Composer displayName={displayName} canSend={Boolean(user && displayName && roomId && !roomError)} onSetName={setName} onSend={sendMessage} onNotify={notify} />
    </main>
    <Toast message={toastText} toastKey={toastKey} />
  </div>;
}
