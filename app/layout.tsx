import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ทีซี นิวเจน — Server Chat',
  description: 'แชตกลุ่มทีซี นิวเจน',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
