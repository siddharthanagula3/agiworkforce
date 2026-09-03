import { buildMetadata } from '@/lib/seo/metadata';
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
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { CONTACT_EMAIL, contactMailto } from '@/lib/legal-constants';

export const metadata = buildMetadata({
  title: 'Support: how to reach us',
  description:
    'How to reach us today, where to report bugs, and what support looks like across every tier.',
  path: '/support',
});

const SUPPORT_ROWS: { label: string; value: string }[] = [
  {
    label: 'Local / BYOK',
    value: `Available now. Email ${CONTACT_EMAIL} for a best-effort reply from a human.`,
  },
  {
    label: 'Free',
    value: `Available now. Email ${CONTACT_EMAIL} for a best-effort reply from a human; no published response-time SLA yet.`,
  },
  {
    label: 'Basic and Pro',
    value: `Available now. Email ${CONTACT_EMAIL} for a best-effort reply from a human; no published response-time SLA yet.`,
  },
  {
    label: 'Max 5x, Max 15x, and Team',
    value: `Available now. Email ${CONTACT_EMAIL} for a best-effort reply from a human; no published response-time SLA yet.`,
  },
  {
    label: 'Enterprise',
    value: 'In scoping. A named contact and an SLA are defined per contract during scoping.',
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
          title="We read every email."
          lede="Email is the canonical channel today, for everyone. Paid Team and Enterprise SLAs are still firming up, so we do not publish response-time promises yet. What is planned is labeled as planned."
          ctas={[
            { href: contactMailto(), label: `Email ${CONTACT_EMAIL}` },
            { href: '/help', label: 'Browse the help index', variant: 'secondary' },
          ]}
        />

        <Section id="tiers" labelledBy="agi-support-tiers-title" rule>
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-support-tiers-title">
                What you can count on, by tier.
              </h2>
              <Prose>
                One honest table. The free paths get a human on email today; commitments for paid
                tiers arrive with the tiers themselves.
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
