import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Button, ButtonRow, Eyebrow, Prose, Section } from '@/features/marketing/components/system';

export const metadata: Metadata = {
  title: 'Payment issue',
  description: 'Something went wrong with your payment. Here is how to resolve it.',
};

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

export default function PaymentFailurePage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <Section size="sm">
          <div style={statementStyle}>
            <div>
              <Eyebrow>Billing</Eyebrow>
              <h1 className="agi-ds-h1">Payment didn&rsquo;t go through.</h1>
            </div>
            <Prose>
              If a renewal failed, your plan&rsquo;s paid features are paused until it is paid. Pay
              the open invoice or update your payment method in Billing, and they come back as soon
              as the payment succeeds.
            </Prose>
            <Prose size="sm">
              If you were starting a new plan, no subscription was created and you weren&rsquo;t
              charged. The usual causes are a decline by the card issuer, a 3D Secure check that
              closed before you confirmed, or a network error reaching your bank; the last two
              usually clear on a second try.
            </Prose>
            <ButtonRow>
              <Button href="/settings/billing">Open billing</Button>
              <Button href="/pricing" variant="secondary">
                See plans
              </Button>
            </ButtonRow>
            <Prose size="sm">
              Still stuck? Email{' '}
              <a className="agi-ds-link" href="mailto:contact@agiworkforce.com">
                contact@agiworkforce.com
              </a>
              .
            </Prose>
          </div>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
