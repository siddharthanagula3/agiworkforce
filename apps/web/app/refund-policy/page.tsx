import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Ledger,
  Prose,
  Section,
  Stack,
  type LedgerRow,
} from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { CONTACT_EMAIL, POLICY_LAST_UPDATED, contactMailto } from '@/lib/legal-constants';

export const metadata = buildMetadata({
  title: 'Refund policy',
  description: 'When refunds are issued and how to request one.',
  path: '/refund-policy',
});

const WHEN: readonly LedgerRow[] = [
  {
    label: 'Paid subscriptions',
    value:
      'Cancellation stops the next renewal and access continues through the paid term. Current-period charges are not automatically refunded, except where required by law or when we confirm a duplicate, unauthorized, or billing-error charge.',
  },
  {
    label: 'Plan upgrades',
    value:
      'Immediate upgrades preserve the renewal date and charge the exact prorated price difference Stripe previews for the time remaining in the current period. This is an invoice adjustment, not a reset or refund of already-consumed usage.',
  },
  {
    label: 'Purchased usage add-ons',
    value:
      'Used add-ons are not refundable. Contact support about an unused, duplicate, or mistaken purchase; statutory rights still apply.',
  },
  {
    label: 'App Store and Play purchases',
    value:
      'Subscriptions bought inside the mobile apps are charged by Apple or Google, not by us. We cannot refund them. Request those through the store that took the payment; its own refund rules and windows apply.',
  },
  {
    label: 'Enterprise contracts',
    value: 'Refund terms are part of the MSA negotiated with each customer.',
  },
  {
    label: 'BYOK usage',
    value:
      'Provider charges (Anthropic, OpenAI, Google, etc.) are billed directly by the provider. Refunds for those go through the provider, not us.',
  },
];

export default function RefundPolicyPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-refund-title"
          eyebrow="Legal"
          title="Refunds."
          lede={
            <>
              We review billing problems promptly. Eligibility depends on the type of charge,
              account usage, applicable law, and any contract-specific terms. Last updated:{' '}
              {POLICY_LAST_UPDATED.refunds}.
            </>
          }
          ctas={[]}
        />

        <Section id="when" labelledBy="agi-refund-when-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-refund-when-title">
              When we refund.
            </h2>
            <Ledger caption="Refund eligibility" rows={WHEN} />
          </Stack>
        </Section>

        <Section id="statutory" labelledBy="agi-refund-statutory-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-refund-statutory-title">
              Statutory withdrawal rights.
            </h2>
            <Prose>
              <strong>EU, UK and other consumers with a statutory cooling-off right:</strong> where
              the law gives you a right to withdraw from a distance contract within 14 days, that
              right applies and this policy does not reduce it. Note that when you ask us to start
              the service immediately, that right can be lost or reduced in proportion to what you
              have already used, which is what the law provides for. Tell us within the window and
              we will apply the statutory outcome, not the commercial one above.
            </Prose>
          </Stack>
        </Section>

        <Section id="how" labelledBy="agi-refund-how-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-refund-how-title">
              How to request.
            </h2>
            <Prose>
              Email{' '}
              <a href={contactMailto('Refund request')} className="agi-ds-link">
                {CONTACT_EMAIL}
              </a>{' '}
              with the email on your account, the charge date, and a brief reason. We aim to respond
              within the support response target for your plan, published at{' '}
              <Link href="/sla" className="agi-ds-link">
                /sla
              </Link>
              . This page used to promise one business day for everyone, which did not match those
              targets. Approved refunds are returned through the original payment method on the
              payment processor&rsquo;s timeline.
            </Prose>
            <ButtonRow>
              <Button href={contactMailto('Refund request')}>Request a refund</Button>
              <Button href="/terms" variant="secondary">
                Terms of service
              </Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
