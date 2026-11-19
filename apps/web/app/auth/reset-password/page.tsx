'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@shared/components/layout/Header';
import { useEmbeddedPage } from '@shared/components/layout/EmbeddedPage';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Section } from '@/features/marketing/components/system';
import { embeddedRecoverySignInPath } from '@/lib/embedded-page';

export default function ResetPasswordPage() {
  const router = useRouter();
  const embedded = useEmbeddedPage();

  useEffect(() => {
    router.replace(embedded ? embeddedRecoverySignInPath() : '/login');
  }, [embedded, router]);

  const notice = (
    <p className="agi-ds-prose" style={{ textAlign: 'center' }}>
      Redirecting to sign in…
    </p>
  );

  if (embedded) {
    return (
      <div data-design="agi" className="agi-ds-page">
        <main id="main-content">
          <Section size="sm">{notice}</Section>
        </main>
      </div>
    );
  }

  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <Section size="sm">{notice}</Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
