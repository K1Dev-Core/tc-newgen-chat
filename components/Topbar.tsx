'use client';

import { useState, type FormEvent } from 'react';
import { Menu, Search, UserRoundCog, Users, X } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatMessage } from '@/lib/types';
import { parseChatContent } from '@/lib/chat-files';
import type { MemberProfile } from './ProfileDialog';
import { DailyFlame } from './DailyFlame';

export function Topbar({ serverName, roomName, roomId, viewerId, onlineCount, supabase, isBoard = false, onToggleSidebar, profile, memberProfiles, onOpenProfile, onSearchMessages, onJumpToMessage }: {
  serverName: string;
  roomName: string;
  roomId: string;
  viewerId: string | null;
  onlineCount: number;
  supabase: SupabaseClient;
  isBoard?: boolean;
  onToggleSidebar: () => void;
  profile: MemberProfile | null;
  memberProfiles: Record<string, MemberProfile>;
  onOpenProfile: () => void;
  onSearchMessages: (query: string) => Promise<ChatMessage[]>;
  onJumpToMessage: (messageId: string) => Promise<void>;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ChatMessage[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  async function runSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query) { setSearchResults([]); setSearchError('พิมพ์คำค้นหรือชื่อคนส่งก่อน'); return; }
    setSearching(true);
    setSearchError('');
    try {
      setSearchResults(await onSearchMessages(query));
    } catch {
      setSearchError('ค้นหาข้อความไม่สำเร็จ ลองอีกครั้ง');
    } finally {
      setSearching(false);
    }
  }

  async function openResult(messageId: string) {
    setSearchOpen(false);
    setSearchResults([]);
    await onJumpToMessage(messageId);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.getElementById(`chat-message-${messageId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
  }

  return <header className={`topbar ${searchOpen ? 'topbar-search-open' : ''}`}>
    <div className="topbar-main-row">
      <button className="mobile-menu-button" aria-label="Open server sidebar" onClick={onToggleSidebar}><Menu size={17} /></button>
      <div className="breadcrumbs"><span>{serverName}</span><b>/</b><span>{isBoard ? `▧ ${roomName}` : `# ${roomName}`}</span></div>
      {!isBoard && <button type="button" className="topbar-search-trigger" aria-label="ค้นหาข้อความในห้อง" title="ค้นหาข้อความในห้อง" aria-expanded={searchOpen} onClick={() => { setSearchOpen((open) => !open); setSearchError(''); }}><Search size={16} /><span>ค้นหา</span></button>}
      <div className="topbar-right-controls">{!isBoard && <><DailyFlame roomId={roomId} viewerId={viewerId} supabase={supabase} /><span className="chat-online-count" title="จำนวนคนที่ออนไลน์ในห้องแชท" aria-label={`${onlineCount} คนออนไลน์`}><Users size={14} /><strong>{onlineCount}</strong><span>ออนไลน์</span></span></>}{profile && <button type="button" className="topbar-profile-button" onClick={onOpenProfile} aria-label="ตั้งค่าโปรไฟล์" title="ตั้งค่าโปรไฟล์">{profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : <UserRoundCog size={16} />}<span>{profile.display_name}</span></button>}</div>
    </div>
    {searchOpen && <div className="topbar-search-panel">
      <form className="topbar-search-form" onSubmit={runSearch}>
        <Search size={16} aria-hidden="true" />
        <input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setSearchOpen(false); }} placeholder="ค้นหาข้อความหรือชื่อคนส่ง" aria-label="ค้นหาข้อความหรือชื่อคนส่ง" />
        <button type="submit" disabled={searching}>{searching ? 'กำลังค้นหา…' : 'ค้นหา'}</button>
        <button type="button" className="topbar-search-close" aria-label="ปิดการค้นหา" title="ปิดการค้นหา" onClick={() => { setSearchOpen(false); setSearchResults([]); setSearchError(''); }}><X size={16} /></button>
      </form>
      {(searching || searchError || searchResults.length > 0 || searchQuery.trim()) && <div className="topbar-search-results" role="status">
        {searchError && <p className="chat-search-empty">{searchError}</p>}
        {searching && <p className="chat-search-empty">กำลังค้นหาประวัติแชท…</p>}
        {!searching && !searchError && searchResults.length === 0 && searchQuery.trim() && <p className="chat-search-empty">ไม่พบข้อความที่ตรงกัน</p>}
        {searchResults.map((result) => {
          const parsed = parseChatContent(result.text);
          return <button type="button" className="chat-search-result" key={result.id} onClick={() => { void openResult(result.id); }}>
            <span><strong>{memberProfiles[result.senderId ?? '']?.display_name ?? result.sender}</strong><time>{result.time}</time></span>
            <span className="chat-search-result-text">{parsed.text || parsed.files.map((file) => file.filename).join(', ') || 'ไฟล์แนบ'}</span>
          </button>;
        })}
        {searchResults.length > 0 && <small>แสดง {searchResults.length} รายการล่าสุดในห้องนี้</small>}
      </div>}
    </div>}
  </header>;
}
