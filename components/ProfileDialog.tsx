'use client';

import { useEffect, useState } from 'react';
import { Check, LoaderCircle, X } from 'lucide-react';

const PROFILE_CDN = 'https://profile-image-cdn.vercel.app';

type ProfileChoice = { id: string; name: string; imageUrl: string; alt: string };
export type MemberProfile = { id: string; display_name: string; avatar_url: string | null };

export function ProfileDialog({ profile, editable, onClose, onSave, saving = false }: {
  profile: MemberProfile;
  editable: boolean;
  onClose: () => void;
  onSave?: (name: string, avatarUrl: string | null) => void;
  saving?: boolean;
}) {
  const [name, setName] = useState(profile.display_name);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [choices, setChoices] = useState<ProfileChoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let alive = true;
    void fetch(`${PROFILE_CDN}/api/profiles?limit=100`)
      .then(async (response) => {
        if (!response.ok) throw new Error('โหลดรูปโปรไฟล์ไม่สำเร็จ');
        return response.json() as Promise<{ data: ProfileChoice[] }>;
      })
      .then((result) => { if (alive) setChoices(result.data); })
      .catch(() => { if (alive) setLoadError('โหลดรายการรูปไม่สำเร็จ ลองเปิดหน้าต่างนี้อีกครั้ง'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) { if (event.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const activeName = editable ? name : profile.display_name;
  const activeAvatar = editable ? avatarUrl : profile.avatar_url;

  return <div className="profile-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-dialog-title">
      <header className="profile-dialog-header">
        <div><span className="profile-dialog-eyebrow">TC NEWGEN · MEMBER</span><h2 id="profile-dialog-title">{editable ? 'ตั้งค่าโปรไฟล์' : 'โปรไฟล์สมาชิก'}</h2></div>
        <button type="button" className="profile-dialog-close" aria-label="ปิด" onClick={onClose}><X size={17} /></button>
      </header>
      <div className="profile-preview">
        {activeAvatar ? <img src={activeAvatar} alt="" /> : <span>{Array.from(activeName.trim())[0]?.toLocaleUpperCase() ?? '?'}</span>}
        <div><strong>{activeName || 'ยังไม่ได้ตั้งชื่อ'}</strong><small>{editable ? 'รูปและชื่อจะแสดงให้สมาชิกทุกคนเห็น' : 'สมาชิกในห้อง # นกพิราบสื่อสาร'}</small></div>
      </div>
      {editable ? <>
        <label className="profile-name-label" htmlFor="profile-display-name">ชื่อที่แสดง</label>
        <input className="profile-name-input" id="profile-display-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={32} autoComplete="nickname" />
        <div className="profile-choice-heading"><strong>เลือกรูปโปรไฟล์</strong><span>{choices.length} รูป</span></div>
        {loading ? <div className="profile-choice-loading"><LoaderCircle size={16} /> กำลังโหลดรูป…</div> : loadError ? <p className="profile-choice-error">{loadError}</p> : <div className="profile-choice-grid" aria-label="เลือกรูปโปรไฟล์">
          {choices.map((choice) => <button type="button" key={choice.id} className={`profile-choice ${avatarUrl === choice.imageUrl ? 'selected' : ''}`} onClick={() => setAvatarUrl(choice.imageUrl)} aria-label={choice.name} aria-pressed={avatarUrl === choice.imageUrl} title={choice.name}>
            <img src={choice.imageUrl} alt="" loading="lazy" /><span className="profile-choice-name">{choice.name}</span>{avatarUrl === choice.imageUrl && <span className="profile-choice-check"><Check size={12} /></span>}
          </button>)}
        </div>}
        <div className="profile-dialog-actions">
          <button type="button" className="profile-cancel" onClick={onClose}>ยกเลิก</button>
          <button type="button" className="profile-save" disabled={!name.trim() || saving} onClick={() => onSave?.(name, avatarUrl)}>{saving ? 'กำลังบันทึก…' : 'บันทึกโปรไฟล์'}</button>
        </div>
      </> : <div className="profile-view-details"><span>ชื่อที่แสดง</span><strong>{profile.display_name}</strong><span>เซิร์ฟเวอร์</span><strong>TC · # นกพิราบสื่อสาร</strong></div>}
    </section>
  </div>;
}
