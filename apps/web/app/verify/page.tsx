'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import type { CSSProperties } from 'react';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Button, ButtonRow, Eyebrow, Prose, Section } from '@/features/marketing/components/system';
import { VerifyDeviceClient } from '@/app/verify/verify-client';
import { CONTACT_EMAIL } from '@/lib/legal-constants';

const STATEMENT_MAX_WIDTH = '30rem';

const statementStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  gap: 'var(--agi-space-5)',
  maxWidth: STATEMENT_MAX_WIDTH,
  marginInline: 'auto',
};

function VerifyEmailBody({ email }: { email: string | null }) {
  return (
    <Section size="sm">
      <div style={statementStyle}>
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
        <Prose size="sm">
          Not there? Check spam, then use the sign-in recovery flow, or email {CONTACT_EMAIL} for
          account help.
        </Prose>
        <ButtonRow>
          <Button href="/login" variant="secondary">
            Back to sign in
          </Button>
        </ButtonRow>
      </div>
    </Section>
  );
}

function VerifyDeviceBody({ code }: { code: string }) {
  return (
    <Section size="sm">
      <div style={statementStyle}>
        <div>
          <Eyebrow>Device sign-in</Eyebrow>
          <h1 className="agi-ds-h1">Approve this device?</h1>
        </div>
        <Prose>
          A device is requesting to sign in to your account. Approve it only if you started this
          sign-in. The request code is <strong>{code}</strong>.
        </Prose>

        <VerifyDeviceClient code={code} />

        <div>
          <h2 className="agi-ds-h3">Security notice.</h2>
          <Prose size="sm">
            If you did not initiate this request, choose Deny and do not approve. Approving grants
            the requesting device access to your account.
          </Prose>
        </div>
        <ButtonRow>
          <Button href="/" variant="secondary">
            Cancel
          </Button>
        </ButtonRow>
      </div>
    </Section>
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
