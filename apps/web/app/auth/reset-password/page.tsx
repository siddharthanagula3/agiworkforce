'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Section } from '@/features/marketing/components/system';

export default function ResetPasswordPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/login');
  }, [router]);

  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <Section size="sm">
          <p className="agi-ds-prose" style={{ textAlign: 'center' }}>
            Redirecting to sign in…
          </p>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
