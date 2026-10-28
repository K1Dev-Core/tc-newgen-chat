'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Dices, LoaderCircle, X } from 'lucide-react';
import type { MemberProfile } from './ProfileDialog';

const PROFILE_CDN = 'https://profile-image-cdn.vercel.app';
const PIGEON_NAMES = [
  'สายลม', 'ปีกเงิน', 'ปีกทอง', 'ปีกฟ้า', 'ปีกม่วง', 'ข้าวเหนียว', 'ข้าวจี่', 'ข้าวปั้น', 'ข้าวหอม', 'ข้าวเหนียวมะม่วง',
  'แสงดาว', 'แสงจันทร์', 'แสงตะวัน', 'ดาวเหนือ', 'ดาวลูกไก่', 'ดาวประกาย', 'เดือนเพ็ญ', 'จันทร์เจ้า', 'ฟ้าคราม', 'ฟ้าหลังฝน',
  'สายฟ้า', 'เมฆขาว', 'เมฆฝน', 'หมอกเช้า', 'ฝนพรำ', 'ลมหนาว', 'ลมทะเล', 'ลมว่าว', 'รุ้งกินน้ำ', 'อรุณรุ่ง',
  'นักส่งสาร', 'บุรุษไปรษณีย์', 'จดหมายรัก', 'สารลับ', 'ข่าวด่วน', 'ผู้พิทักษ์กล่องข้อความ', 'นักบินเวหา', 'ยอดนักบิน', 'ปีกพิชิตฟ้า', 'บินไวใจดี',
  'แก้มป่อง', 'ขนฟู', 'ขนปุย', 'ตากลม', 'จ้ำม่ำ', 'ขี้เซา', 'ขี้เล่น', 'จอมซน', 'แสนซน', 'ใจดี',
  'ยิ้มหวาน', 'เสียงใส', 'เสียงเจื้อยแจ้ว', 'คุยเก่ง', 'พูดน้อยต่อยหนัก', 'สายฮา', 'สายเปย์', 'สายมู', 'สายกิน', 'สายชิล',
  'มะลิหอม', 'ดอกบัว', 'ดอกแก้ว', 'บัวลอย', 'ขนมชั้น', 'ทองหยิบ', 'ทองหยอด', 'ฝอยทอง', 'น้ำอบไทย', 'ผ้าไหม',
  'ศรีอีสาน', 'ลูกทุ่ง', 'หมอลำ', 'แคนแก้ว', 'โหวดหวาน', 'ขามเรียง', 'ทุ่งนา', 'ทุ่งรวงทอง', 'ริมโขง', 'ภูพาน',
  'นักเล่าเรื่อง', 'นักวาดฝัน', 'นักเดินทาง', 'นักผจญภัย', 'นักประดิษฐ์', 'นักร้องเสียงทอง', 'เจ้าถิ่น', 'ขาประจำ', 'เพื่อนซี้', 'มิตรแท้',
  'มือไว', 'ใจกล้า', 'ใจเย็น', 'สมองใส', 'ตื่นเช้า', 'นอนดึก', 'บินเดี่ยว', 'บินเป็นฝูง', 'ปีกพเนจร', 'น้อยกลอยใจ',
  'ผู้กล้า', 'แชมป์ประจำซอย', 'ราชาแห่งลาน', 'ขวัญใจมหาชน', 'ตำนานหน้าต่าง', 'ดาวเด่น', 'พลังบวก', 'ยิ้มเก่ง', 'ปากหวาน', 'อารมณ์ดี',
  'หางพัด', 'คอเหลือบ', 'ขนเทา', 'จุดขาว', 'ปีกลาย', 'ยอดขุนพล', 'เจ้าสำราญ', 'จอมยุทธ์', 'ขุนแผนเวหา', 'ท่านขุนปีกทอง',
];

type ProfileChoice = { id: string; name: string; description: string; imageUrl: string; alt: string };
const randomItem = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

export function JoinChatDialog({ onClose, onJoin, saving = false }: {
  onClose: () => void;
  onJoin: (name: string, avatarUrl: string | null) => Promise<boolean>;
  saving?: boolean;
}) {
  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
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
      .catch(() => { if (alive) setLoadError('โหลดรายการรูปไม่สำเร็จ สามารถเข้าร่วมโดยใช้ตัวอักษรแทนรูปได้'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) { if (event.key === 'Escape' && !saving) onClose(); }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, saving]);

  function randomize() {
    if (!choices.length) return;
    setName(`พิราบ${randomItem(PIGEON_NAMES)}`);
    setAvatarUrl(randomItem(choices).imageUrl);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = name.trim().replace(/\s+/g, ' ');
    if (!normalized) return;
    if (await onJoin(normalized, avatarUrl)) onClose();
  }

  const initial = Array.from(name.trim())[0]?.toLocaleUpperCase() ?? '?';
  return <div className="profile-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section className="profile-dialog join-chat-dialog" role="dialog" aria-modal="true" aria-labelledby="join-chat-title">
      <header className="profile-dialog-header">
        <div><span className="profile-dialog-eyebrow">TC NEWGEN · # นกพิราบสื่อสาร</span><h2 id="join-chat-title">เข้าร่วมแชท</h2></div>
        <button type="button" className="profile-dialog-close" aria-label="ปิด" onClick={onClose} disabled={saving}><X size={17} /></button>
      </header>
      <form onSubmit={submit}>
        <div className="profile-preview">
          {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{initial}</span>}
          <div><strong>{name || 'ตั้งชื่อให้เพื่อนจำได้'}</strong><small>ชื่อและรูปนี้จะปรากฏข้างข้อความของคุณ</small></div>
        </div>
        <div className="join-name-heading"><label className="profile-name-label" htmlFor="join-display-name">ชื่อที่แสดง</label><button type="button" className="randomize-profile" onClick={randomize} disabled={loading || !choices.length}><Dices size={15} /> สุ่มชื่อ + โปรไฟล์</button></div>
        <input className="profile-name-input" id="join-display-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={32} placeholder="เช่น พิราบสายลม" autoComplete="nickname" autoFocus />
        <div className="profile-choice-heading"><strong>เลือกรูปโปรไฟล์</strong><span>{choices.length} รูป</span></div>
        {loading ? <div className="profile-choice-loading"><LoaderCircle size={16} /> กำลังโหลดรูป…</div> : loadError ? <p className="profile-choice-error">{loadError}</p> : <div className="profile-choice-grid" aria-label="เลือกรูปโปรไฟล์">
          {choices.map((choice) => <button type="button" key={choice.id} className={`profile-choice ${avatarUrl === choice.imageUrl ? 'selected' : ''}`} onClick={() => setAvatarUrl(choice.imageUrl)} aria-label={`${choice.name}: ${choice.description}`} aria-pressed={avatarUrl === choice.imageUrl} title={`${choice.name} — ${choice.description}`}>
            <img src={choice.imageUrl} alt="" loading="lazy" /><span className="profile-choice-name"><strong>{choice.name}</strong><small>{choice.description}</small></span>
          </button>)}
        </div>}
        <div className="profile-dialog-actions">
          <button type="button" className="profile-cancel" onClick={onClose} disabled={saving}>ยกเลิก</button>
          <button type="submit" className="profile-save" disabled={!name.trim() || saving}>{saving ? <><LoaderCircle className="send-spinner" size={14} /> กำลังเข้าร่วม…</> : 'เข้าร่วมแชท'}</button>
        </div>
      </form>
    </section>
  </div>;
}
