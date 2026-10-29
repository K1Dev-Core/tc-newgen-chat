import type { Metadata, Viewport } from 'next';
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
  return <html lang="en"><body>{children}</body></html>;
}
