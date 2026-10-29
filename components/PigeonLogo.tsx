'use client';

import { DotLottieReact } from '@lottiefiles/dotlottie-react';

export function PigeonLogo({ className = '' }: { className?: string }) {
  return <DotLottieReact
    className={`pigeon-logo ${className}`}
    src="/pigeon-mascot.lottie"
    autoplay
    loop
    aria-label="ทีซี นิวเจน pigeon mascot"
  />;
}
