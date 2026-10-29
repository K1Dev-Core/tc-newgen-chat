import type { Metadata, Viewport } from 'next';
import { preload } from 'react-dom';
import '@excalidraw/excalidraw/index.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'ทีซี นิวเจน — Server Chat',
  description: 'แชตกลุ่มทีซี นิวเจน',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  preload('/pigeon-loader-poster.png', { as: 'image', fetchPriority: 'high' });
  preload('/pigeon-loader.webm', { as: 'video', type: 'video/webm', fetchPriority: 'low' });

  return <html lang="en"><body>{children}</body></html>;
}
