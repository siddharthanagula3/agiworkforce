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
import {
  WITHDRAWAL_CONSENT_STATEMENT,
  WITHDRAWAL_CONSENT_VERSION,
} from '@/lib/billing/withdrawal-consent';
import { RefundRequestForm } from './RefundRequestForm';
import { PolicyVersionsLink } from '@shared/components/legal/PolicyVersionsLink';

export const metadata = buildMetadata({
  title: 'Refund policy',
  description: 'When refunds are issued and how to request one.',
  path: '/refund-policy',
});

const WHEN: readonly LedgerRow[] = [
  {
    label: 'Paid subscriptions',
    value:
      'Cancellation stops the next renewal and access continues through the paid term. A plan payment you have not used is refunded if you ask within 7 days of the charge, once per account, and the plan ends when it is refunded. Otherwise a current-period charge is not refunded, except where the law requires it or when we confirm a duplicate, unauthorized, or billing-error charge.',
  },
  {
    label: 'Plan upgrades',
    value:
      "An upgrade starts a new billing period today: you pay the new plan's price, minus a credit for the unused time on your current plan. Your renewal date moves to the day you upgrade, and the credits you already used this period count against the new plan's allowance. Adding seats to a Team plan keeps the renewal date and charges only for the rest of the current period. Neither is a refund.",
  },
  {
    label: 'Credit top-ups',
    value:
      'Credits you have not spent are refunded if you ask within 7 days of the purchase, once per account. Spent credits are not refundable except where the law requires it or when we confirm a duplicate, mistaken, or unauthorized purchase. A refunded top-up leaves your balance.',
  },
  {
    label: 'Payment disputes',
    value:
      'While a dispute you opened with your bank is open, the plan and the credit balance are on hold. If the dispute closes in our favor they are restored as they were; if it closes in yours, the hold is final.',
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
              {POLICY_LAST_UPDATED.refunds}. <PolicyVersionsLink policy="refunds" />
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
              <strong>EU, EEA and UK:</strong> if you live there, you may withdraw from a plan
              payment or a credit purchase within 14 days of paying, without giving a reason, by
              requesting a refund below. Before you pay, checkout asks you to confirm: &ldquo;
              {WITHDRAWAL_CONSENT_STATEMENT}&rdquo; (wording of {WITHDRAWAL_CONSENT_VERSION}).
            </Prose>
            <Prose>
              When you confirmed it, the refund is prorated by the credits you have used: for a plan
              payment you get back the share of the period&rsquo;s plan credits you have not used,
              and for a credit purchase the share of those credits you have not spent. When we hold
              no record that you confirmed it, for example for a purchase made before checkout
              asked, you get the whole payment back. The refund goes to the card you paid with as
              soon as you confirm, and in any case within 14 days of your request. A withdrawn plan
              ends that day, and the unused credits from a withdrawn payment leave your balance. We
              go by the country of the payment&rsquo;s billing address, or of your billing details
              when the payment has none. A statutory right that applies where you live applies
              alongside this page, and nothing here reduces it.
            </Prose>
          </Stack>
        </Section>

        <Section id="how" labelledBy="agi-refund-how-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-refund-how-title">
              How to request.
            </h2>
            <Prose>
              Signed in, choose the payment and the reason below. A 14-day withdrawal, and an unused
              payment inside the 7-day window on an account&rsquo;s first such refund, are refunded
              as soon as you confirm. Anything else waits for a person, who answers within the
              support response target for your plan, published at{' '}
              <Link href="/sla" className="agi-ds-link">
                /sla
              </Link>
              , and you get a notification with the decision. If you cannot sign in, email{' '}
              <a href={contactMailto('Refund request')} className="agi-ds-link">
                {CONTACT_EMAIL}
              </a>{' '}
              with the email on your account, the charge date, and a brief reason. Refunds go back
              to the card you paid with, and your bank usually shows them within 5 to 10 business
              days.
            </Prose>
            <div id="request">
              <RefundRequestForm />
            </div>
            <ButtonRow>
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
