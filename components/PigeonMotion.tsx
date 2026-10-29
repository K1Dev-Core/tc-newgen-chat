'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import type { DotLottie } from '@lottiefiles/dotlottie-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MASCOT_ACTIVITY_EVENT, recordMascotActivity, restorePendingMascotMeters, takePendingMascotMeters } from '@/lib/mascot-activity';

const IDLE_DELAY_MS = 850;
const METERS_PER_POINTER_PIXEL = 1 / 250;
const ACTIVITY_CLIENT_ID_KEY = 'tc-newgen:mascot-activity-client-id';

function getActivityClientId() {
  const makeId = () => globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.random() * 16 | 0;
    return (char === 'x' ? random : (random & 0x3 | 0x8)).toString(16);
  });
  try {
    const saved = window.localStorage.getItem(ACTIVITY_CLIENT_ID_KEY);
    if (saved) return saved;
    const id = makeId();
    window.localStorage.setItem(ACTIVITY_CLIENT_ID_KEY, id);
    return id;
  } catch {
    return makeId();
  }
}

function formatDistance(meters: number) {
  if (meters < 1000) return `วิ่งมาแล้ว ${Math.floor(meters).toLocaleString('th-TH')} เมตร`;
  const kilometers = (meters / 1000).toFixed(1).replace(/\.0$/, '');
  return `วิ่งมาแล้ว ${kilometers} กิโลเมตร`;
}

function formatCompactDistance(meters: number) {
  if (meters < 1000) return `${Math.floor(meters).toLocaleString('th-TH')} ม.`;
  const kilometers = (meters / 1000).toFixed(1).replace(/\.0$/, '');
  return `${kilometers} กม.`;
}

export function PigeonMotion({ supabase }: { supabase: SupabaseClient }) {
  const [totalMeters, setTotalMeters] = useState(0);
  const playerRef = useRef<DotLottie | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const movingRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const walkedPixelsRef = useRef(0);
  const syncingRef = useRef(false);

  const setPlayer = useCallback((player: DotLottie | null) => {
    playerRef.current = player;
    if (!player) return;

    const initialize = () => {
      player.setFrame(0);
      if (movingRef.current) player.play();
    };

    if (player.isLoaded) initialize();
    else player.addEventListener('load', initialize);
  }, []);

  useEffect(() => {
    let alive = true;
    const clientId = getActivityClientId();
    const refreshTotal = (value: unknown) => {
      const meters = Number(value);
      if (alive && Number.isFinite(meters) && meters >= 0) setTotalMeters(meters);
    };

    const channel = supabase.channel('mascot-run-distance').on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'mascot_run_stats', filter: 'id=eq.1' },
      (payload) => refreshTotal((payload.new as { total_meters?: unknown }).total_meters),
    ).subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      void supabase.from('mascot_run_stats').select('total_meters').eq('id', 1).maybeSingle().then(({ data, error }) => {
        if (!error && data) refreshTotal(data.total_meters);
      });
    });

    const flush = async () => {
      if (syncingRef.current) return;
      const meters = takePendingMascotMeters();
      if (!meters) return;
      syncingRef.current = true;
      try {
        const { data, error } = await supabase.rpc('record_mascot_activity', {
          p_client_id: clientId,
          p_meters: meters,
        });
        if (error) throw error;
        if (Number(data) < 0) restorePendingMascotMeters(meters);
        else refreshTotal(data);
      } catch (error) {
        restorePendingMascotMeters(meters);
        console.debug('[Mascot] Distance sync failed; activity will be retried.', error);
      } finally {
        syncingRef.current = false;
      }
    };

    const interval = window.setInterval(() => { void flush(); }, 10_000);
    const flushOnExit = () => { void flush(); };
    document.addEventListener('visibilitychange', flushOnExit);
    window.addEventListener('pagehide', flushOnExit);

    const wakeMascot = () => {
      const player = playerRef.current;
      if (player?.isLoaded) {
        if (!movingRef.current) player.setFrame(0);
        if (!movingRef.current) player.play();
      }
      movingRef.current = true;

      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        const currentPlayer = playerRef.current;
        movingRef.current = false;
        lastPointerRef.current = null;
        if (currentPlayer?.isLoaded) {
          currentPlayer.stop();
          currentPlayer.setFrame(0);
        }
      }, IDLE_DELAY_MS);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || !event.isTrusted) return;
      const previous = lastPointerRef.current;
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      if (previous) {
        walkedPixelsRef.current += Math.hypot(event.clientX - previous.x, event.clientY - previous.y);
        const meters = Math.floor(walkedPixelsRef.current * METERS_PER_POINTER_PIXEL);
        if (meters > 0) {
          recordMascotActivity(meters);
          walkedPixelsRef.current -= meters / METERS_PER_POINTER_PIXEL;
        }
      }
      wakeMascot();
    };

    const handleClick = (event: MouseEvent) => {
      if (event.isTrusted) recordMascotActivity(2);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('click', handleClick, { passive: true });
    window.addEventListener(MASCOT_ACTIVITY_EVENT, wakeMascot);
    return () => {
      alive = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', flushOnExit);
      window.removeEventListener('pagehide', flushOnExit);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('click', handleClick);
      window.removeEventListener(MASCOT_ACTIVITY_EVENT, wakeMascot);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      playerRef.current?.stop();
      void supabase.removeChannel(channel);
    };
  }, [supabase]);

  return (
    <div className="sidebar-mascot">
      <div className="sidebar-mascot-animation">
        <DotLottieReact
          src="/running-pigeon.lottie"
          autoplay={false}
          loop
          useFrameInterpolation={false}
          dotLottieRefCallback={setPlayer}
          aria-hidden="true"
        />
      </div>
      <div className="mascot-distance" aria-label={formatDistance(totalMeters)}>
        <span className="mascot-distance-full">{formatDistance(totalMeters)}</span>
        <span className="mascot-distance-compact">{formatCompactDistance(totalMeters)}</span>
      </div>
    </div>
  );
}
