'use client';

import { useEffect, useRef, useState } from 'react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';

const MIN_VISIBLE_MS = 2_400;

export function LoadingOverlay({ active, label }: { active: boolean; label: string }) {
  const [visible, setVisible] = useState(active);
  const shownAt = useRef<number | null>(active ? Date.now() : null);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    if (active) {
      shownAt.current = Date.now();
      setVisible(true);
    } else if (shownAt.current !== null) {
      const remaining = Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAt.current));
      timeout = setTimeout(() => {
        setVisible(false);
        shownAt.current = null;
      }, remaining);
    }
    return () => { if (timeout) clearTimeout(timeout); };
  }, [active]);

  if (!visible) return null;

  return <div className="loading-overlay" role="status" aria-live="polite" aria-label={label}>
    <div className="loading-overlay-content">
      <div className="loading-mascot-frame">
        <span className="loading-orbit" aria-hidden="true" />
        <div className="loading-mascot-media">
          <DotLottieReact src="/pigeon-loader.lottie" autoplay loop aria-hidden="true" />
        </div>
      </div>
      <span className="loading-label">{label}</span>
    </div>
  </div>;
}
