import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Full-Stack SaaS Reference',
  description: 'Production-ready Next.js, Supabase, Redis, and AWS reference application',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="topbar">
            <Link className="brand" href="/">
              <Image src="/mark.svg" alt="" width={32} height={32} priority />
              <span>Forgeboard</span>
            </Link>
            <nav>
              <Link className="button secondary" href="/dashboard">
                Dashboard
              </Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
