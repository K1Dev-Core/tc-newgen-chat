'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Clapperboard, ExternalLink, LoaderCircle, Menu, RotateCw } from 'lucide-react';

const FEED_URL = 'https://api.sansekai.my.id/api/freereels/foryou?lang=th';
const RATE_LIMIT_KEY = 'tc-newgen:freereels-last-request';
type FeedItem = { id: string; title: string; description: string; poster: string; video: string; href: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function extractItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = asRecord(payload);
  if (!record) return [];
  for (const key of ['data', 'result', 'results', 'items', 'list', 'videos', 'dramas', 'recommendations']) {
    const value = record[key];
    if (Array.isArray(value)) return value;
    if (asRecord(value)) {
      const nested = extractItems(value);
      if (nested.length) return nested;
    }
  }
  return [];
}

function stringAt(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) if (typeof record[key] === 'string' && record[key]) return record[key] as string;
  return '';
}

function normalizeItem(value: unknown, index: number): FeedItem | null {
  const record = asRecord(value);
  if (!record) return null;
  const title = stringAt(record, ['title', 'name', 'dramaName', 'bookName', 'desc']) || `คลิปสั้น ${index + 1}`;
  const rawVideo = stringAt(record, ['videoUrl', 'video_url', 'playUrl', 'play_url', 'video', 'url']);
  const video = /^https?:\/\//i.test(rawVideo) && /\.(mp4|webm)(\?|$)/i.test(rawVideo) ? rawVideo : '';
  const poster = stringAt(record, ['cover', 'coverUrl', 'cover_url', 'poster', 'thumbnail', 'thumb', 'image', 'img']);
  const href = stringAt(record, ['detailUrl', 'detail_url', 'shareUrl', 'share_url', 'link']);
  return {
    id: stringAt(record, ['id', 'dramaId', 'drama_id', 'bookId', 'book_id']) || `${index}-${title}`,
    title,
    description: stringAt(record, ['description', 'intro', 'summary', 'subtitle']),
    poster: /^https?:\/\//i.test(poster) ? poster : '',
    video,
    href: /^https?:\/\//i.test(href) ? href : '',
  };
}

export function ShortClipsPanel({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryIn, setRetryIn] = useState(0);

  const loadFeed = useCallback(async () => {
    if (retryIn > 0) return;
    try {
      const lastRequestAt = Number(window.localStorage.getItem(RATE_LIMIT_KEY) ?? 0);
      const wait = lastRequestAt + 6_500 - Date.now();
      if (wait > 0) {
        setRetryIn(wait);
        setError('เพิ่งส่งคำขอไป รอสักครู่ก่อนลองใหม่เพื่อไม่ให้เกิน rate limit ของ FreeReels');
        setLoading(false);
        return;
      }
      window.localStorage.setItem(RATE_LIMIT_KEY, String(Date.now()));
    } catch { /* Continue when browser storage is unavailable. */ }
    setLoading(true);
    setError('');
    setItems([]);
    try {
      const response = await fetch(FEED_URL, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      const text = await response.text();
      let payload: unknown = null;
      try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
      if (!response.ok) {
        const body = asRecord(payload);
        const detail = typeof body?.message === 'string' ? body.message : typeof body?.error === 'string' ? body.error : '';
        throw new Error(`FreeReels ปฏิเสธคำขอ (HTTP ${response.status})${detail ? ` · ${detail}` : ''}`);
      }
      const normalized = extractItems(payload).map(normalizeItem).filter((item): item is FeedItem => Boolean(item));
      if (!normalized.length) throw new Error('API ตอบกลับแล้ว แต่ยังไม่พบรายการคลิปในรูปแบบที่รองรับ');
      setItems(normalized);
      // Sansekai documents a 10-request/minute limit; keep manual retries spaced.
      setRetryIn(6_500);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'เชื่อมต่อ FreeReels ไม่สำเร็จ');
      setRetryIn(6_500);
    } finally {
      setLoading(false);
    }
  }, [retryIn]);

  useEffect(() => { void loadFeed(); }, []); // Load once when this menu is opened.
  useEffect(() => {
    if (!retryIn) return;
    const timer = window.setInterval(() => setRetryIn((current) => Math.max(0, current - 500)), 500);
    return () => window.clearInterval(timer);
  }, [retryIn > 0]);

  return <section className="shorts-page" aria-label="คลิปสั้น">
    <header className="shorts-header">
      <button type="button" className="shorts-menu-button" aria-label="เปิดเมนู" onClick={onOpenSidebar}><Menu size={17} /></button>
      <div className="shorts-header-icon"><Clapperboard size={18} /></div>
      <div className="shorts-heading-copy"><strong>คลิปสั้น</strong><span>ทดลองฟีดแนวตั้ง · FreeReels</span></div>
      <button type="button" className="shorts-refresh" onClick={() => void loadFeed()} disabled={loading || retryIn > 0} title={retryIn ? 'รอสักครู่ก่อนโหลดใหม่' : 'โหลดใหม่'}>
        {loading ? <LoaderCircle className="shorts-spin" size={15} /> : <RotateCw size={15} />}<span>{retryIn > 0 && !loading ? 'รออีกสักครู่' : 'โหลดใหม่'}</span>
      </button>
    </header>
    <div className="shorts-content">
      {loading && <div className="shorts-state"><LoaderCircle className="shorts-spin" size={23} /><strong>กำลังดึงฟีดจาก FreeReels</strong><span>กำลังทดสอบแพลตฟอร์มแรก</span></div>}
      {!loading && error && <div className="shorts-state shorts-error-state"><div className="shorts-error-icon"><AlertTriangle size={20} /></div><strong>ดึงคลิปจาก FreeReels ไม่สำเร็จ</strong><span>{error}</span><small>ทดสอบ endpoint For You ภาษาไทยจาก API ที่ให้มาแล้ว ขณะนี้ผู้ให้บริการยังไม่ส่งรายการกลับมา</small>{retryIn > 0 && <small>เพื่อเคารพ rate limit ของ API ปุ่มโหลดใหม่จะใช้ได้อีกครั้งในอีกไม่กี่วินาที</small>}</div>}
      {!loading && !error && <div className="shorts-feed" aria-label="ฟีดคลิปสั้น">
        {items.map((item) => <article className="shorts-card" key={item.id}>
          {item.video ? <video src={item.video} poster={item.poster || undefined} controls playsInline preload="metadata" /> : item.poster ? <img className="shorts-poster" src={item.poster} alt="" loading="lazy" /> : <div className="shorts-no-media"><Clapperboard size={30} /></div>}
          <div className="shorts-card-caption"><strong>{item.title}</strong>{item.description && <span>{item.description}</span>}{!item.video && <small>รายการนี้ยังไม่มีลิงก์วิดีโอโดยตรงจาก API</small>}{item.href && <a href={item.href} target="_blank" rel="noreferrer">เปิดรายการ <ExternalLink size={12} /></a>}</div>
        </article>)}
      </div>}
    </div>
  </section>;
}
