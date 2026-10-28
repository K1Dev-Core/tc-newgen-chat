import type { Metadata } from 'next';
import { preload } from 'react-dom';
import './globals.css';

export const metadata: Metadata = {
  title: 'ทีซี นิวเจน — Server Chat',
  description: 'แชตกลุ่มทีซี นิวเจน',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  preload('/pigeon-loader-poster.png', { as: 'image', fetchPriority: 'high' });
  preload('/pigeon-loader.webm', { as: 'video', type: 'video/webm', fetchPriority: 'low' });

  return <html lang="en"><body>{children}</body></html>;
}
