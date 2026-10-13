import { BILLING_PLAN_PRICING } from '@agiworkforce/types';
import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { SUPPORT_ROWS } from '@/features/marketing/components/pages/company/support-content';
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

const TEAM_AND_ENTERPRISE = `${BILLING_PLAN_PRICING.team.label} and ${BILLING_PLAN_PRICING.enterprise.label}`;
const HERO_LEDE = `The help centre and email are the published channels. ${BILLING_PLAN_PRICING.free.label} through ${BILLING_PLAN_PRICING.max_15x.label} carry no response-time commitment; ${TEAM_AND_ENTERPRISE} commitments are stated below in Central Time. We do not claim 24/7 coverage.`;

const HERO_FACTS = [
  `Channel: help centre and email ${CONTACT_EMAIL}`,
  'Time zone: Central Time (America/Chicago)',
  `${TEAM_AND_ENTERPRISE} carry a stated first-response target`,
];

export default function SupportPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-support-title"
          eyebrow="Support"
          title="Support channels and plan commitments."
          lede={HERO_LEDE}
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
                One table names the available channel for each tier. {TEAM_AND_ENTERPRISE} carry a
                stated first-response target; other tiers do not. The uptime and credit targets on{' '}
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
                first. With an account, a ticket raised from Settings, Help attaches your build,
                platform and the last errors your browser recorded, and the replies stay on the
                ticket.
              </Prose>
            </div>
            <ButtonRow>
              <Button href={contactMailto()}>Email a bug report</Button>
              <Button href="/settings/help" variant="secondary">
                Raise a ticket
              </Button>
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
