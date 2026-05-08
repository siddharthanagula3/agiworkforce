'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Header } from '../../../components/layout/Header';
import { MarketingFooter } from '../../../components/marketing/MarketingFooter';

function AuthErrorBody() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error') || 'unknown';
  const description = searchParams.get('error_description');

  return (
    <section
      className="agi-section"
      style={{ borderBottom: 'none', maxWidth: 480, margin: '0 auto' }}
    >
      <p className="agi-section-eyebrow">Authentication error</p>
      <h1 className="agi-page-h1" style={{ marginBottom: 16 }}>
        Sign-in didn&rsquo;t complete.
      </h1>
      <p className="agi-page-lede" style={{ marginBottom: 20 }}>
        Something went wrong while authenticating you.{' '}
        <strong>
          Try again — most issues clear up on retry. If it persists, email contact@agiworkforce.com
          with the error code below.
        </strong>
      </p>
      <div className="agi-callout">
        <h2 className="agi-callout-h">Error: {error}</h2>
        <p className="agi-callout-p">{description || 'No additional details available.'}</p>
      </div>
      <div className="agi-cta-row" style={{ marginTop: 24 }}>
        <Link href="/login" className="agi-cta-primary">
          Try sign-in again
        </Link>
        <a href="mailto:contact@agiworkforce.com" className="agi-cta-ghost">
          Email support →
        </a>
      </div>
    </section>
  );
}

export default function AuthErrorPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <Suspense fallback={null}>
          <AuthErrorBody />
        </Suspense>
        <MarketingFooter />
      </main>
    </div>
  );
}
