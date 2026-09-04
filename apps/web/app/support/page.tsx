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
} from '@/features/marketing/components/system';
import { FactLine, PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { CONTACT_EMAIL, contactMailto } from '@/lib/legal-constants';

export const metadata = buildMetadata({
  title: 'Support: how to reach us',
  description:
    'How to reach us today, where to report bugs, and the support commitment for every plan, from a help centre with no response-time promise through a named Enterprise contact.',
  path: '/support',
});

const HERO_FACTS = [
  `Channel: help centre and email ${CONTACT_EMAIL}`,
  'Time zone: Central Time (America/Chicago)',
  'Team and Enterprise carry a stated first-response target',
];

const SUPPORT_ROWS: { label: string; value: string }[] = [
  {
    label: 'Local / BYOK',
    value: `Help centre and email ${CONTACT_EMAIL}. No response-time commitment.`,
  },
  {
    label: 'Free, Basic, Pro, and Max (5x and 15x)',
    value: `Help centre and email ${CONTACT_EMAIL}. No response-time commitment.`,
  },
  {
    label: 'Team',
    value: 'Email support. First response within 1 business day, Central Time.',
  },
  {
    label: 'Enterprise',
    value:
      'A named contact. First response within 4 business hours (Central Time) for a service-down report, and within 1 business day otherwise. An escalation path and the status page are included.',
  },
  {
    label: 'Premium support (add-on)',
    value:
      'Faster response and on-call availability, available only as a negotiated line on an Enterprise order form. It is not a public promise; ask your Enterprise contact.',
  },
];

export default function SupportPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-support-title"
          eyebrow="Support"
          title="We read every email, and Team and Enterprise get a stated first response."
          lede="Email is the canonical channel for everyone. Free through Max carry no response-time commitment; Team and Enterprise do, stated below in Central Time, the time zone AGI Automation LLC operates in. We do not claim 24/7 coverage, because a small team could not staff it honestly."
          ctas={[
            { href: contactMailto(), label: `Email ${CONTACT_EMAIL}` },
            { href: '/help', label: 'Browse the help index', variant: 'secondary' },
          ]}
        />

        <FactLine facts={HERO_FACTS} />

        <Section id="tiers" labelledBy="agi-support-tiers-title" rule>
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-support-tiers-title">
                What you can count on, by tier.
              </h2>
              <Prose>
                One honest table. Every tier reaches a human by email; Team and Enterprise carry a
                stated first-response target on top of that. These are current commitments, not
                targets we are building toward; the uptime and credit targets on{' '}
                <Link href="/sla" className="agi-ds-link">
                  /sla
                </Link>{' '}
                are the ones still labeled as planned.
              </Prose>
            </div>
            <Ledger caption="Support by tier" rows={SUPPORT_ROWS} />
          </Stack>
        </Section>

        <Section id="bugs" labelledBy="agi-support-bugs-title" rule ground="2">
          <Stack>
            <div>
              <h2 className="agi-ds-h2" id="agi-support-bugs-title">
                Found something broken?
              </h2>
              <Prose>
                Tell us what you did, what you expected, and what happened instead. Screenshots and
                exact error text make fixes faster. For service-wide issues, check the status page
                first.
              </Prose>
            </div>
            <ButtonRow>
              <Button href={contactMailto()}>Email a bug report</Button>
              <Button href="/status" variant="secondary">
                Check service status
              </Button>
              <Button href="/contact" variant="secondary">
                Open the contact page
              </Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
