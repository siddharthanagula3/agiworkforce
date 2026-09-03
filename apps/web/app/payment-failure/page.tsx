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
              Your card was declined or the charge was canceled.{' '}
              <strong>No subscription was created and you weren&rsquo;t charged.</strong>
            </Prose>
            <Prose size="sm">
              The usual causes: the card was declined by the issuer, the 3D Secure verification
              window closed before you confirmed, or Stripe could not reach your bank over the
              network. The last two typically resolve on retry.
            </Prose>
            <ButtonRow>
              <Button href="/pricing">Try again</Button>
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
