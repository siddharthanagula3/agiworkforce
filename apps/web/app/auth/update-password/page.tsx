'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';

export default function UpdatePasswordPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/login');
  }, [router]);

  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section
          className="agi-section"
          style={{ borderBottom: 'none', maxWidth: 440, margin: '0 auto' }}
        >
          <p className="agi-page-lede" style={{ textAlign: 'center' }}>
            Redirecting to sign in...
          </p>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
