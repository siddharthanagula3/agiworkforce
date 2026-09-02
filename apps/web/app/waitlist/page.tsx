import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Prose, Section, Stack } from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { LinkGrid } from '@/features/marketing/components/pages/features/shared';
import { PublicWaitlistForm } from '@/features/marketing/components/PublicWaitlistForm';
import { COMING_SOON_LABEL, SURFACE_STATUS } from '@/lib/marketing-constants';

const BYOK_RELEASE_SURFACES = [
  { id: 'desktop', label: 'Desktop' },
  { id: 'cli', label: 'CLI' },
  { id: 'vscode', label: 'VS Code' },
] as const;

const BYOK_RELEASE_LABEL = new Intl.ListFormat('en', {
  style: 'long',
  type: 'conjunction',
}).format(
  BYOK_RELEASE_SURFACES.filter((surface) => SURFACE_STATUS[surface.id] !== COMING_SOON_LABEL).map(
    (surface) => surface.label,
  ),
);

export const metadata = buildMetadata({
  title: 'AGI Cloud is open: enterprise governance early access',
  description:
    'AGI managed cloud is open by default: sign in and start, no waitlist. Pricing shows current Team checkout availability. Join the list for contract-scoped Enterprise SSO, custom retention, and governance requirements.',
  path: '/waitlist',
});

const WHILE_YOU_WAIT = [
  {
    meta: 'Try it now',
    title: 'Try AGI Web',
    body: 'Hosted chat with projects and artifacts, in the browser today.',
    href: '/login?redirectTo=%2F',
  },
  {
    meta: 'Free',
    title: 'Run AGI locally',
    body: 'Free forever, offline-capable, and never silently routed to the cloud.',
    href: '/local',
  },
  {
    meta: 'BYOK',
    title: 'Bring your own keys',
    body: `Use your provider accounts on supported ${BYOK_RELEASE_LABEL} releases with visible labels.`,
    href: '/byok',
  },
  {
    meta: 'Team',
    title: 'Team pricing',
    body: 'Self-serve checkout for the Team tier, open today without an enterprise contract.',
    href: '/pricing',
  },
];

export default function WaitlistPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-waitlist-title"
          eyebrow="AGI Cloud"
          title="Managed compute, open today."
          lede={
            <>
              AGI managed cloud is open by default:{' '}
              <Link href="/get-started" className="agi-ds-link">
                sign in and start
              </Link>
              , no waitlist.{' '}
              <Link href="/pricing" className="agi-ds-link">
                See team pricing and checkout availability
              </Link>
              . This list is for <strong>enterprise early access</strong>: advanced org controls,
              SSO, custom retention, and centralized governance beyond the self-serve team scope.
              Leave your email and we will reach out as those land.
            </>
          }
          ctas={[]}
        />

        <Section id="join" size="sm">
          <Stack gap="tight">
            <PublicWaitlistForm source="website" ctaLabel="Request org/SSO early access" />
            <Prose size="sm">
              To come off the list, record a withdrawal at{' '}
              <Link href="/privacy/requests" className="agi-ds-link">
                /privacy/requests
              </Link>
              . It needs no account.
            </Prose>
          </Stack>
        </Section>

        <Section id="meanwhile" labelledBy="agi-waitlist-meanwhile-title" rule>
          <Stack gap="loose">
            <div>
              <p className="agi-ds-eyebrow">While you wait</p>
              <h2 className="agi-ds-h2" id="agi-waitlist-meanwhile-title">
                Available routes and release status.
              </h2>
            </div>
            <LinkGrid items={WHILE_YOU_WAIT} />
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
