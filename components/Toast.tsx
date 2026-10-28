'use client';

import { useEffect, useState } from 'react';
export function Toast({ message, toastKey }: { message: string; toastKey: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { if (!message) return; setVisible(true); const timer = window.setTimeout(() => setVisible(false), 1900); return () => window.clearTimeout(timer); }, [message, toastKey]);
  return <div role="status" className={`toast ${visible ? 'toast-visible' : ''}`}>{message}</div>;
}
