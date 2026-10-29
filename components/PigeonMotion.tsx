'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import type { DotLottie } from '@lottiefiles/dotlottie-react';

const IDLE_DELAY_MS = 850;
const PIGEON_PHRASES = [
  'จิ๊บจิ๊บ', 'หวัดดี!', 'นกมาแล้ว', 'อยู่นี่น้า', 'ฮัลโหลๆ', 'แวะมาทัก', 'คุยกันเถอะ', 'มีใครอยู่ไหม',
  'ไปไหนอะ', 'บินวนแป๊บ', 'ฝากข้อความด้วย', 'รออ่านอยู่นะ', 'พิมพ์มาเลย', 'เย้!', 'โอเคเลย', 'สุดยอด',
  'ขอบคุณน้า', 'ส่งใจให้', 'ฮิฮิ', 'อุ๊บส์', 'วันนี้สดใส', 'แอบอ่านอยู่', 'แวะมาแป๊บ', 'มาแล้วจ้า',
  'ทีมเราสู้!', 'พร้อมลุย', 'ลุยกันเลย', 'ขอพักแป๊บ', 'พักกินน้ำก่อน', 'พักสายตาบ้าง', 'อย่าลืมยิ้ม', 'ใจเย็นๆ',
  'คิดถึงนะ', 'อยู่เป็นเพื่อน', 'เจอกันในแชท', 'ชวนคุยหน่อย', 'มีอะไรเล่าไหม', 'วันนี้เป็นไง', 'ข่าวดีไหม', 'บินมาส่งข่าว',
  'ส่งกำลังใจ', 'เอ้า ลุย!', 'จิ๊บเดียว', 'บินก่อนนะ', 'ปีกพร้อม!', 'ปีกกระพือแล้ว', 'ขอบินผ่าน', 'มาเช็กชื่อ',
  'ใครส่งข้อความ', 'คุยได้เลย', 'อย่าหายไปนะ', 'รออยู่นี่', 'เติมพลัง!', 'น่ารักอะ', 'ง่วงนิดหน่อย', 'หิวแล้ว',
  'ขอข้าวหน่อย', 'ฝนจะตกไหม', 'คิดออกยัง', 'เยี่ยมมาก', 'แป๊บเดียวนะ', 'มีเรื่องเมาท์ไหม', 'ทักทายทุกคน', 'วันนี้เก่งมาก',
  'ขอเกาะขอบจอ', 'มาเฝ้าแชท', 'ข้อความมาแล้ว', 'บินมาไวๆ', 'คิดถึงปีก', 'ยิ้มหน่อยสิ', 'พักก่อนก็ได้', 'ทุกคนโอเคไหม',
];

function nextPhrase(previous: string) {
  const choices = PIGEON_PHRASES.filter((phrase) => phrase !== previous);
  return choices[Math.floor(Math.random() * choices.length)];
}

export function PigeonMotion() {
  const [phrase, setPhrase] = useState('จิ๊บจิ๊บ');
  const playerRef = useRef<DotLottie | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const movingRef = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const rotatePhrase = () => {
      setPhrase((current) => nextPhrase(current));
      timer = setTimeout(rotatePhrase, 4200 + Math.random() * 4600);
    };
    timer = setTimeout(rotatePhrase, 2600);
    return () => clearTimeout(timer);
  }, []);

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
    <div className="sidebar-mascot">
      <span key={phrase} className="sidebar-mascot-speech" role="status" aria-live="polite">{phrase}</span>
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
