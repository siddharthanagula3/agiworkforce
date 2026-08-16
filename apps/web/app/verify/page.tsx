'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { VerifyDeviceClient } from '@/app/verify/verify-client';

function VerifyEmailBody({ email }: { email: string | null }) {
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
            open the sign-in recovery flow
          </Link>
          . You can also email contact@agiworkforce.com for account help.
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

function VerifyDeviceBody({ code }: { code: string }) {
  return (
    <section
      className="agi-section"
      style={{ borderBottom: 'none', maxWidth: 440, margin: '0 auto' }}
    >
      <p className="agi-section-eyebrow">Device sign-in</p>
      <h1 className="agi-page-h1" style={{ marginBottom: 16 }}>
        Approve this device?
      </h1>
      <p className="agi-page-lede" style={{ marginBottom: 24 }}>
        A device is requesting to sign in to your account. Approve it only if you started this
        sign-in. The request code is <strong>{code}</strong>.
      </p>

      <VerifyDeviceClient code={code} />

      <div className="agi-callout" style={{ marginTop: 24 }}>
        <h2 className="agi-callout-h">Security notice</h2>
        <p className="agi-callout-p">
          If you did not initiate this request, choose Deny and do not approve. Approving grants the
          requesting device access to your account.
        </p>
      </div>
      <p style={{ marginTop: 24, fontSize: 14, color: 'var(--agi-ink-2)', textAlign: 'center' }}>
        <Link href="/" style={{ color: 'var(--agi-ink)' }}>
          Cancel
        </Link>
      </p>
    </section>
  );
}

function VerifyBody() {
  const searchParams = useSearchParams();
  const code = searchParams.get('code');
  const email = searchParams.get('email');

  if (code) {
    return <VerifyDeviceBody code={code} />;
  }
  return <VerifyEmailBody email={email} />;
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
