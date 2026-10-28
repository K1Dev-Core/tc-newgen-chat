'use client';

import { useEffect, useRef, useState } from 'react';

export function LoadingOverlay({ label }: { label: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    if (videoRef.current && videoRef.current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      setVideoReady(true);
    }
  }, []);

  return <div className="loading-overlay" role="status" aria-live="polite" aria-label={label}>
    <div className="loading-overlay-content">
      <div className="loading-mascot-frame">
        <span className="loading-orbit" aria-hidden="true" />
        <div className="loading-mascot-media">
          <img className={`loading-mascot-poster${videoReady ? ' loading-mascot-poster-ready' : ''}`} src="/pigeon-loader-poster.png" fetchPriority="high" alt="" />
          <video ref={videoRef} className={`loading-mascot${videoReady ? ' loading-mascot-ready' : ''}`} autoPlay loop muted playsInline preload="auto" aria-hidden="true" poster="/pigeon-loader-poster.png" onLoadedData={() => setVideoReady(true)}>
          <source src="/pigeon-loader.webm" type="video/webm" />
          </video>
        </div>
      </div>
      <span className="loading-label">{label}</span>
    </div>
  </div>;
}
