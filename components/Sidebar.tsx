'use client';

import { ChevronDown, ChevronRight, Folder, FolderOpen, Hash, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { ViewId } from '@/lib/types';
import { PigeonLogo } from './PigeonLogo';

export function Sidebar({ activeView, onNavigate, collapsed, onToggleCollapsed, projectOpen, onToggleProject }: { activeView: ViewId; onNavigate: (view: ViewId) => void; collapsed: boolean; onToggleCollapsed: () => void; projectOpen: boolean; onToggleProject: () => void }) {
  return <aside className="sidebar">
    <div className="brand-row"><PigeonLogo className="brand-mascot" /><span className="brand-name">ทีซี นิวเจน</span><button className="icon-button collapse-button" aria-label={collapsed ? 'Expand project sidebar' : 'Collapse project sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={onToggleCollapsed}>{collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</button></div>
    <div className="project-heading"><span>Server</span></div>
    <nav className="project-list" aria-label="Project files">
      <button className={`nav-item project-root ${activeView === 'Server' ? 'active' : ''}`} onClick={() => { onToggleProject(); onNavigate('Server'); }} aria-label="TC server" data-tooltip="TC">{projectOpen ? <FolderOpen size={15} /> : <Folder size={15} />}<span>TC</span>{projectOpen ? <ChevronDown size={14} className="nav-trailing" /> : <ChevronRight size={14} className="nav-trailing" />}</button>
      {projectOpen && <button className={`nav-item project-child ${activeView === 'Chat' ? 'active' : ''}`} onClick={() => onNavigate('Chat')} aria-label="นกพิราบสื่อสาร channel" data-tooltip="นกพิราบสื่อสาร"><Hash size={15} /><span>นกพิราบสื่อสาร</span></button>}
    </nav>
  </aside>;
}
