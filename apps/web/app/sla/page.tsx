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
import { CONTACT_EMAIL, contactMailto } from '@/lib/legal-constants';

export const metadata = buildMetadata({
  title: 'SLA',
  description:
    'Support response commitments by plan, current today, plus the uptime and credit targets AGI Managed Cloud is building toward in public alpha. This page says which is which.',
  path: '/sla',
});

const LAST_REVIEWED = '4 September 2026';

const UPTIME: readonly LedgerRow[] = [
  { label: 'Web (agiworkforce.com)', value: '99.9% target · monthly window' },
  { label: 'API gateway', value: '99.9% target · monthly window' },
  { label: 'Authentication', value: '99.9% target · monthly window' },
  {
    label: 'Provider passthrough',
    value: "Inherits the provider's own SLA · not measured by us",
    quiet: true,
  },
  {
    label: 'Local and BYOK modes',
    value: 'Not applicable: no AGI service in the path · not measured',
    quiet: true,
  },
];

const RESPONSE: readonly LedgerRow[] = [
  {
    label: 'Free, Basic, Pro, and Max (5x and 15x)',
    value: 'Help centre and email · no response-time commitment',
  },
  {
    label: 'Team',
    value: 'Email · first response within 1 business day, Central Time',
  },
  {
    label: 'Enterprise',
    value:
      'Named contact · first response within 4 business hours (Central Time) for a service-down report, 1 business day otherwise · escalation path · status page',
  },
  {
    label: 'Premium support add-on',
    value: 'Faster response and on-call, negotiated as an Enterprise order-form line only',
    quiet: true,
  },
];

const NOT_YET: readonly LedgerRow[] = [
  {
    label: 'Uptime targets are not contractual',
    value:
      'The uptime numbers above take effect only if and when a plan agreement says so. Until then they describe what we are building toward, and nothing on this page creates an uptime obligation. The support response commitments in the table above are current policy, not a future target.',
  },
  {
    label: 'No measured history',
    value:
      'We do not publish historical uptime, and we have no incident archive. The live check on /status is a point-in-time signal covering three dependencies, not an availability record.',
  },
  {
    label: 'Support routing is manual',
    value:
      'Support requests arrive in a single email queue and are triaged by hand against the commitment above. There is no automated, plan-derived routing system.',
  },
  {
    label: 'No 24/7 coverage',
    value:
      'There is no on-call rotation and no round-the-clock coverage. We do not claim 24/7 support because a small team could not staff it honestly; response follows the business-hours and business-day targets above.',
  },
  {
    label: 'No recovery objectives',
    value:
      'No recovery point objective, recovery time objective, or restore test evidence has been published.',
  },
  {
    label: 'No credit process yet',
    value:
      'The credit formula below describes intended policy. No automated credit issuance exists, and final terms would be confirmed in a plan agreement.',
  },
];

export default function SlaPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-sla-title"
          eyebrow="Service levels"
          title="Support commitments that hold today; uptime targets we are building toward."
          lede={
            <>
              AGI Managed Cloud is in public alpha.{' '}
              <strong>
                The support response commitments below are current policy. The uptime and credit
                numbers are planned targets, not a binding commitment, and they take effect only
                when a plan agreement says so.
              </strong>{' '}
              Local and BYOK modes have no AGI service in the request path, so there is nothing for
              us to commit to there. Reviewed {LAST_REVIEWED}.
            </>
          }
          ctas={[
            { href: '/status', label: 'See the live signal' },
            { href: '#limits', label: 'What this page is not', variant: 'secondary' },
          ]}
        />

        <Section id="uptime" labelledBy="agi-sla-uptime-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-sla-uptime-title">
              What we intend to commit to at general availability.
            </h2>
            <Ledger caption="Planned uptime targets" rows={UPTIME} />
          </Stack>
        </Section>

        <Section id="response" labelledBy="agi-sla-response-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-sla-response-title">
                First response, by plan.
              </h2>
              <Prose>
                These are current support commitments, not planned targets. Plan names match the
                billing catalogue. Plan pricing is on{' '}
                <Link href="/pricing" className="agi-ds-link">
                  /pricing
                </Link>
                ; it is not restated here so there is only one source of truth for it. Full detail,
                including how to reach us, is on{' '}
                <Link href="/support" className="agi-ds-link">
                  /support
                </Link>
                .
              </Prose>
            </div>
            <Ledger caption="Support response commitments" rows={RESPONSE} />
          </Stack>
        </Section>

        <Section id="credits" labelledBy="agi-sla-credits-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-sla-credits-title">
              What we intend to owe you when we miss.
            </h2>
            <Prose>
              Once paid plans reach general availability, the intended policy is a service credit
              equal to 10% of the monthly fee for each 0.1% below the uptime target in that month,
              capped at 50% of the monthly fee. To claim, email{' '}
              <a href={contactMailto()} className="agi-ds-link">
                {CONTACT_EMAIL}
              </a>{' '}
              within 30 days of the incident. Final credit terms would be confirmed in your plan
              agreement; today no automated credit process exists.
            </Prose>
          </Stack>
        </Section>

        <Section id="limits" labelledBy="agi-sla-limits-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-sla-limits-title">
                What this page is not.
              </h2>
              <Prose>
                A reviewer should be able to tell the difference between a commitment and an
                intention without reading the fine print, so here is the difference. As of{' '}
                {LAST_REVIEWED}:
              </Prose>
            </div>
            <Ledger caption="Limits" rows={NOT_YET} />
          </Stack>
        </Section>

        <Section id="related" labelledBy="agi-sla-more-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-sla-more-title">
              The rest of the trust surface.
            </h2>
            <ButtonRow>
              <Button href="/status">Live status</Button>
              <Button href="/security" variant="secondary">
                Security mechanisms
              </Button>
              <Button href="/trust" variant="secondary">
                Dated posture ledger
              </Button>
              <Button href="/support" variant="secondary">
                Get support
              </Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
