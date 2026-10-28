'use client';

import { Menu } from 'lucide-react';

export function Topbar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  return <header className="topbar"><button className="mobile-menu-button" aria-label="Open server sidebar" onClick={onToggleSidebar}><Menu size={17} /></button><div className="breadcrumbs"><span>TC</span><b>/</b><span># นกพิราบสื่อสาร</span></div></header>;
}
