import type { Metadata } from 'next';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Chain Cards — Card Battle Betting',
  description: 'Create bets, pick your cards, win the match.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body
        className="antialiased bg-gray-950 text-gray-100 min-h-screen"
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
