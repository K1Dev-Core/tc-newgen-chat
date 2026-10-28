'use client';

import { Menu, UserRoundCog } from 'lucide-react';
import type { MemberProfile } from './ProfileDialog';

export function Topbar({ serverName, roomName, onToggleSidebar, profile, onOpenProfile }: { serverName: string; roomName: string; onToggleSidebar: () => void; profile: MemberProfile | null; onOpenProfile: () => void }) {
  return <header className="topbar"><button className="mobile-menu-button" aria-label="Open server sidebar" onClick={onToggleSidebar}><Menu size={17} /></button><div className="breadcrumbs"><span>{serverName}</span><b>/</b><span># {roomName}</span></div>{profile && <button type="button" className="topbar-profile-button" onClick={onOpenProfile} aria-label="ตั้งค่าโปรไฟล์" title="ตั้งค่าโปรไฟล์">{profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : <UserRoundCog size={16} />}<span>{profile.display_name}</span></button>}</header>;
}
