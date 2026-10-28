'use client';

import { Menu, UserRoundCog, Users } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MemberProfile } from './ProfileDialog';
import { DailyFlame } from './DailyFlame';

export function Topbar({ serverName, roomName, roomId, viewerId, onlineCount, supabase, isBoard = false, onToggleSidebar, profile, onOpenProfile }: { serverName: string; roomName: string; roomId: string; viewerId: string | null; onlineCount: number; supabase: SupabaseClient; isBoard?: boolean; onToggleSidebar: () => void; profile: MemberProfile | null; onOpenProfile: () => void }) {
  return <header className="topbar"><button className="mobile-menu-button" aria-label="Open server sidebar" onClick={onToggleSidebar}><Menu size={17} /></button><div className="breadcrumbs"><span>{serverName}</span><b>/</b><span>{isBoard ? `▧ ${roomName}` : `# ${roomName}`}</span></div><div className="topbar-right-controls">{!isBoard && <><DailyFlame roomId={roomId} viewerId={viewerId} supabase={supabase} /><span className="chat-online-count" title="จำนวนคนที่ออนไลน์ในห้องแชท" aria-label={`${onlineCount} คนออนไลน์`}><Users size={14} /><strong>{onlineCount}</strong><span>ออนไลน์</span></span></>}{profile && <button type="button" className="topbar-profile-button" onClick={onOpenProfile} aria-label="ตั้งค่าโปรไฟล์" title="ตั้งค่าโปรไฟล์">{profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : <UserRoundCog size={16} />}<span>{profile.display_name}</span></button>}</div></header>;
}
