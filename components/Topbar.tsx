'use client';

import { Menu, UserRoundCog } from 'lucide-react';
import type { MemberProfile } from './ProfileDialog';

export function Topbar({ onToggleSidebar, profile, onOpenProfile }: { onToggleSidebar: () => void; profile: MemberProfile | null; onOpenProfile: () => void }) {
  return <header className="topbar"><button className="mobile-menu-button" aria-label="Open server sidebar" onClick={onToggleSidebar}><Menu size={17} /></button><div className="breadcrumbs"><span>TC</span><b>/</b><span># นกพิราบสื่อสาร</span></div>{profile && <button type="button" className="topbar-profile-button" onClick={onOpenProfile} aria-label="ตั้งค่าโปรไฟล์" title="ตั้งค่าโปรไฟล์">{profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : <UserRoundCog size={16} />}<span>{profile.display_name}</span></button>}</header>;
}
