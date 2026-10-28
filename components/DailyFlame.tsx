'use client';

import { useEffect, useRef, useState } from 'react';
import { Flame } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';

type FlameRow = {
  room_id: string;
  flame_count: number;
  last_fueled_date: string | null;
  today_fueled_name: string | null;
  last_message_at: string | null;
  updated_at: string;
};

function bangkokDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function DailyFlame({ roomId, viewerId, supabase }: { roomId: string; viewerId: string | null; supabase: SupabaseClient }) {
  const [flame, setFlame] = useState<FlameRow | null>(null);
  const [celebration, setCelebration] = useState<{ name: string; key: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const latestRef = useRef<FlameRow | null>(null);
  const seenRef = useRef(new Set<string>());
  const pendingCelebrationRef = useRef<FlameRow | null>(null);
  const celebrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!roomId) {
      setFlame(null);
      setCelebration(null);
      return;
    }

    let alive = true;
    let initialLoaded = false;
    let pendingRealtimeRow: FlameRow | null = null;
    latestRef.current = null;
    pendingCelebrationRef.current = null;
    setFlame(null);
    setCelebration(null);

    const celebrationSeenKey = (date: string) => `tc-newgen:daily-flame-seen:${roomId}:${viewerId ?? 'guest'}:${date}`;
    const showCelebrationIfUnseen = (row: FlameRow) => {
      const date = row.last_fueled_date;
      if (!date || date !== bangkokDate()) return;
      const seenKey = celebrationSeenKey(date);
      let alreadySeen = seenRef.current.has(seenKey);
      try { alreadySeen ||= window.localStorage.getItem(seenKey) === 'seen'; } catch { /* Keep this tab's in-memory receipt. */ }
      if (alreadySeen) return;
      if (document.visibilityState !== 'visible') {
        pendingCelebrationRef.current = row;
        return;
      }
      seenRef.current.add(seenKey);
      try { window.localStorage.setItem(seenKey, 'seen'); } catch { /* In-memory receipt still prevents repeat overlays in this tab. */ }
      setCelebration({ name: row.today_fueled_name ?? 'เพื่อนในห้อง', key: Date.now() });
      if (celebrationTimerRef.current) clearTimeout(celebrationTimerRef.current);
      celebrationTimerRef.current = setTimeout(() => setCelebration(null), 10_000);
    };

    const acceptRow = (row: FlameRow, fromRealtime: boolean) => {
      if (!alive) return;
      latestRef.current = row;
      setFlame(row);
      // Existing members get the realtime event, while people entering later
      // that day get the same overlay from the persisted room flame record.
      if (fromRealtime || row.last_fueled_date === bangkokDate()) showCelebrationIfUnseen(row);
    };

    const onVisibilityChange = () => {
      const pending = pendingCelebrationRef.current;
      if (document.visibilityState !== 'visible' || !pending) return;
      pendingCelebrationRef.current = null;
      showCelebrationIfUnseen(pending);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const channel = supabase.channel(`daily-flame:${roomId}`).on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'chat_flames', filter: `room_id=eq.${roomId}` },
      (payload) => {
        const row = payload.new as FlameRow;
        if (!row?.room_id) return;
        if (!initialLoaded) pendingRealtimeRow = row;
        else acceptRow(row, true);
      },
    ).subscribe();

    void supabase.from('chat_flames').select('room_id,flame_count,last_fueled_date,today_fueled_name,last_message_at,updated_at')
      .eq('room_id', roomId).maybeSingle().then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          console.error('[Flame] Status load failed.', { roomId, error });
        } else if (data) {
          acceptRow(data as FlameRow, false);
        }
        initialLoaded = true;
        if (pendingRealtimeRow) {
          const currentUpdate = latestRef.current?.updated_at ?? '';
          if (pendingRealtimeRow.updated_at >= currentUpdate) acceptRow(pendingRealtimeRow, true);
        }
      });

    const clock = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearInterval(clock);
      if (celebrationTimerRef.current) clearTimeout(celebrationTimerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [roomId, viewerId, supabase]);

  if (!roomId) return null;
  const isExpired = flame?.last_message_at ? now - new Date(flame.last_message_at).getTime() > 72 * 60 * 60 * 1000 : false;
  const count = isExpired ? 0 : flame?.flame_count ?? 0;
  const wasFueledToday = flame?.last_fueled_date === bangkokDate();
  const title = wasFueledToday ? `เติมไฟวันนี้โดย ${flame?.today_fueled_name ?? 'เพื่อนในห้อง'}` : 'ยังไม่มีคนเติมไฟวันนี้';

  return <>
    <div className="daily-flame-indicator" title={title} aria-label={`ไฟ ${count} วัน${wasFueledToday ? ` เติมไฟวันนี้โดย ${flame?.today_fueled_name ?? 'เพื่อนในห้อง'}` : ''}`}>
      <Flame size={15} fill="currentColor" strokeWidth={1.8} /><strong>{count}</strong>
      {wasFueledToday && <span className="daily-flame-fueled-by">· {flame?.today_fueled_name}</span>}
    </div>
    {celebration && <div className="daily-flame-celebration" role="status" aria-live="assertive" key={celebration.key}>
      <div className="daily-flame-celebration-content">
        <video src="/fire.webm" autoPlay loop muted playsInline aria-hidden="true" />
        <strong>ขอบคุณที่จุดไฟ</strong>
        <span>คนเติมไฟวันนี้</span>
        <b>{celebration.name}</b>
      </div>
    </div>}
  </>;
}
