'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

function VerifyBody() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email');

  return (
    <section
      className="agi-section"
      style={{ borderBottom: 'none', maxWidth: 440, margin: '0 auto' }}
    >
      <p className="agi-section-eyebrow">Verify your email</p>
      <h1 className="agi-page-h1" style={{ marginBottom: 16 }}>
        Check your inbox.
      </h1>
      <p className="agi-page-lede" style={{ marginBottom: 24 }}>
        We sent a verification link{' '}
        {email ? (
          <>
            to <strong>{email}</strong>
          </>
        ) : (
          'to your email'
        )}
        . Click it to finish creating your account.
      </p>
      <div className="agi-callout">
        <h2 className="agi-callout-h">Didn&rsquo;t arrive?</h2>
        <p className="agi-callout-p">
          Check spam, then{' '}
          <Link href="/forgot-password" style={{ color: 'var(--agi-amber)' }}>
            request a fresh link
          </Link>
          . Or email contact@agiworkforce.com — we can verify manually.
        </p>
      </div>
      <p style={{ marginTop: 24, fontSize: 14, color: 'var(--agi-ink-2)', textAlign: 'center' }}>
        <Link href="/login" style={{ color: 'var(--agi-ink)' }}>
          Back to sign in
        </Link>
      </p>
    </section>
  );
}

export default function VerifyPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <Suspense fallback={null}>
          <VerifyBody />
        </Suspense>
        <MarketingFooter />
      </main>
    </div>
  );
}
