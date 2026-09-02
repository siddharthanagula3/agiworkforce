import type { Metadata } from 'next';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Button, ButtonRow, Section, Stack } from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { NoteList } from '@/features/marketing/components/pages/company/shared';

export const metadata: Metadata = {
  title: 'Payment issue',
  description: 'Something went wrong with your payment. Here is how to resolve it.',
};

const REASONS = [
  {
    title: 'Card declined',
    body: 'Insufficient funds, expired card, or the issuer flagged the charge. Try a different card or contact your bank.',
  },
  {
    title: '3D Secure timed out',
    body: 'The verification window closed before you confirmed. Start the checkout again.',
  },
  {
    title: 'Network error',
    body: "Stripe couldn't reach your bank. Usually resolves on retry.",
  },
];

export default function PaymentFailurePage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-payment-failure-title"
          eyebrow="Billing"
          title="Payment didn’t go through."
          lede={
            <>
              Your card was declined or the charge was canceled.{' '}
              <strong>
                No subscription was created and you weren&rsquo;t charged. Try a different payment
                method or email us if it keeps happening.
              </strong>
            </>
          }
          ctas={[]}
        />

        <Section id="reasons" labelledBy="agi-payment-failure-reasons-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-payment-failure-reasons-title">
              Common reasons.
            </h2>
            <NoteList items={REASONS} />
          </Stack>
        </Section>

        <Section id="next" labelledBy="agi-payment-failure-next-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-payment-failure-next-title">
              Next step.
            </h2>
            <ButtonRow>
              <Button href="/pricing">Try again</Button>
              <Button href="mailto:contact@agiworkforce.com" variant="secondary">
                Email us
              </Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
