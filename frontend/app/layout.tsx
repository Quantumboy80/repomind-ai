import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RepoMind AI — Understand the code beneath the repo',
  description: 'Repository intelligence grounded in indexed source code.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className="dark"><body>{children}</body></html>;
}
