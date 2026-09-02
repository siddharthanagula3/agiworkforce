'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Button, ButtonRow, Eyebrow, Prose, Stack } from '@/features/marketing/components/system';
import { VerifyDeviceClient } from '@/app/verify/verify-client';

const CARD_STYLE = {
  maxWidth: '30rem',
  width: '100%',
  marginInline: 'auto',
  padding: 'var(--agi-section-y-md) var(--agi-gutter)',
} as const;

function VerifyEmailBody({ email }: { email: string | null }) {
  return (
    <section style={CARD_STYLE}>
      <Stack gap="loose">
        <div>
          <Eyebrow>Verify your email</Eyebrow>
          <h1 className="agi-ds-h1">Check your inbox.</h1>
        </div>
        <Prose>
          We sent a verification link{' '}
          {email ? (
            <>
              to <strong>{email}</strong>
            </>
          ) : (
            'to your email'
          )}
          . Click it to finish creating your account.
        </Prose>
        <Stack gap="tight">
          <h2 className="agi-ds-h3">Didn&rsquo;t arrive?</h2>
          <Prose size="sm">
            Check spam, then{' '}
            <Link href="/forgot-password" className="agi-ds-link">
              open the sign-in recovery flow
            </Link>
            . You can also email contact@agiworkforce.com for account help.
          </Prose>
        </Stack>
        <ButtonRow>
          <Button href="/login" variant="secondary">
            Back to sign in
          </Button>
        </ButtonRow>
      </Stack>
    </section>
  );
}

function VerifyDeviceBody({ code }: { code: string }) {
  return (
    <section style={CARD_STYLE}>
      <Stack gap="loose">
        <div>
          <Eyebrow>Device sign-in</Eyebrow>
          <h1 className="agi-ds-h1">Approve this device?</h1>
        </div>
        <Prose>
          A device is requesting to sign in to your account. Approve it only if you started this
          sign-in. The request code is <strong>{code}</strong>.
        </Prose>

        <VerifyDeviceClient code={code} />

        <Stack gap="tight">
          <h2 className="agi-ds-h3">Security notice.</h2>
          <Prose size="sm">
            If you did not initiate this request, choose Deny and do not approve. Approving grants
            the requesting device access to your account.
          </Prose>
        </Stack>
        <ButtonRow>
          <Button href="/" variant="secondary">
            Cancel
          </Button>
        </ButtonRow>
      </Stack>
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
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <Suspense fallback={null}>
          <VerifyBody />
        </Suspense>
      </main>
      <MarketingFooter />
    </div>
  );
}
