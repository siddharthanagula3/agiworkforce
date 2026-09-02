'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Ledger,
  Prose,
  Stack,
} from '@/features/marketing/components/system';

function AuthErrorBody() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error') || 'unknown';
  const description = searchParams.get('error_description');

  return (
    <section
      style={{
        maxWidth: '30rem',
        width: '100%',
        marginInline: 'auto',
        padding: 'var(--agi-section-y-md) var(--agi-gutter)',
      }}
    >
      <Stack gap="loose">
        <div>
          <Eyebrow>Authentication error</Eyebrow>
          <h1 className="agi-ds-h1">Sign-in didn&rsquo;t complete.</h1>
        </div>
        <Prose>
          Something went wrong while authenticating you.{' '}
          <strong>
            Try again. Most issues clear up on retry. If it persists, email contact@agiworkforce.com
            with the error code below.
          </strong>
        </Prose>
        <Ledger
          caption="Error detail"
          rows={[{ label: error, value: description || 'No additional details available.' }]}
        />
        <ButtonRow>
          <Button href="/login">Try sign-in again</Button>
          <Button href="mailto:contact@agiworkforce.com" variant="secondary">
            Email support
          </Button>
        </ButtonRow>
      </Stack>
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
