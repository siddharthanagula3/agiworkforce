'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import type { CSSProperties } from 'react';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Button, ButtonRow, Eyebrow, Ledger, Prose } from '@/features/marketing/components/system';

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

const ledgerWrapStyle: CSSProperties = {
  width: '100%',
  textAlign: 'left',
};

function AuthErrorBody() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error') || 'unknown';
  const description = searchParams.get('error_description');

  return (
    <section
      aria-labelledby="auth-error-title"
      style={{ padding: 'var(--agi-section-y-md) var(--agi-gutter)' }}
    >
      <div style={statementStyle}>
        <div>
          <Eyebrow>Authentication error</Eyebrow>
          <h1 className="agi-ds-h1" id="auth-error-title">
            Sign-in didn&rsquo;t complete.
          </h1>
        </div>
        <Prose>Something went wrong while authenticating you. Most issues clear up on retry.</Prose>
        <div style={ledgerWrapStyle}>
          <Ledger
            caption="Error detail"
            rows={[{ label: error, value: description || 'No additional details available.' }]}
          />
        </div>
        <ButtonRow>
          <Button href="/login">Try sign-in again</Button>
        </ButtonRow>
        <Prose size="sm">
          Still stuck? Email{' '}
          <a className="agi-ds-link" href="mailto:contact@agiworkforce.com">
            contact@agiworkforce.com
          </a>{' '}
          with the error code above.
        </Prose>
      </div>
    </section>
  );
}

export default function AuthErrorPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <Suspense fallback={null}>
          <AuthErrorBody />
        </Suspense>
      </main>
      <MarketingFooter />
    </div>
  );
}
