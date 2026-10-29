'use client';

import { useCallback, useEffect, useRef } from 'react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import type { DotLottie } from '@lottiefiles/dotlottie-react';

const IDLE_DELAY_MS = 850;

export function PigeonMotion() {
  const playerRef = useRef<DotLottie | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const movingRef = useRef(false);

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
    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;

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
        if (currentPlayer?.isLoaded) {
          currentPlayer.stop();
          currentPlayer.setFrame(0);
        }
      }, IDLE_DELAY_MS);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      playerRef.current?.stop();
    };
  }, []);

  return (
    <div className="sidebar-mascot" aria-label="นกพิราบกำลังพักอยู่" role="img">
      <DotLottieReact
        src="/running-pigeon.lottie"
        autoplay={false}
        loop
        useFrameInterpolation={false}
        dotLottieRefCallback={setPlayer}
        aria-hidden="true"
      />
    </div>
  );
}
