'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderOpen, Hash, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { ChatRoom, ChatServer } from '@/lib/types';
import { PigeonLogo } from './PigeonLogo';

export function Sidebar({ servers, rooms, activeRoomSlug, onSelectRoom, collapsed, onToggleCollapsed }: { servers: ChatServer[]; rooms: ChatRoom[]; activeRoomSlug: string; onSelectRoom: (slug: string) => void; collapsed: boolean; onToggleCollapsed: () => void }) {
  const [expandedServers, setExpandedServers] = useState<Record<string, boolean>>({});
  return <aside className="sidebar">
    <div className="brand-row"><PigeonLogo className="brand-mascot" /><span className="brand-name">ทีซี นิวเจน</span><button className="icon-button collapse-button" aria-label={collapsed ? 'Expand project sidebar' : 'Collapse project sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={onToggleCollapsed}>{collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</button></div>
    <div className="project-heading"><span>Server</span></div>
    <nav className="project-list" aria-label="Project files">
      {[...servers].sort((a, b) => {
        if (a.name === 'TC') return -1;
        if (b.name === 'TC') return 1;
        return a.name.localeCompare(b.name, 'th');
      }).map((server) => {
        const serverRooms = rooms.filter((room) => room.server_id === server.id);
        const expanded = expandedServers[server.id] ?? true;
        const active = serverRooms.some((room) => room.slug === activeRoomSlug);
        return <div className="server-group" key={server.id}>
          <button className={`nav-item project-root ${active ? 'active' : ''}`} onClick={() => setExpandedServers((current) => ({ ...current, [server.id]: !expanded }))} aria-label={`${server.name} server`} aria-expanded={expanded} data-tooltip={server.name}>
            {expanded ? <FolderOpen size={15} /> : <Folder size={15} />}<span>{server.name}</span>{expanded ? <ChevronDown size={14} className="nav-trailing" /> : <ChevronRight size={14} className="nav-trailing" />}
          </button>
          {expanded && serverRooms.map((room) => <button className={`nav-item project-child ${activeRoomSlug === room.slug ? 'active' : ''}`} key={room.id} onClick={() => onSelectRoom(room.slug)} aria-label={`${room.name} channel`} data-tooltip={room.name}><Hash size={15} /><span>{room.name}</span></button>)}
        </div>;
      })}
    </nav>
  </aside>;
}
