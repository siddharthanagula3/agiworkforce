import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Eyebrow,
  Ledger,
  Prose,
  Section,
  Stack,
  WEB_ENTRY_HREF,
} from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { LinkGrid } from '@/features/marketing/components/pages/features/shared';
import { PublicWaitlistForm } from '@/features/marketing/components/PublicWaitlistForm';
import {
  BYOK_SURFACES,
  COMING_SOON_LABEL,
  SURFACE_NAMES,
  SURFACE_STATUS,
} from '@/lib/marketing-constants';
import { joinSurfaceNames } from '@/lib/surface-status';
import { BILLING_PLAN_PRICING } from '@agiworkforce/types';
import '@/features/marketing/components/pages/company/company.css';

const BYOK_RELEASE_SURFACES = [
  { id: 'cli', label: SURFACE_NAMES.cli },
  { id: 'vscode', label: SURFACE_NAMES.vscode },
] as const;

const BYOK_RELEASED_LABELS = BYOK_RELEASE_SURFACES.filter(
  (surface) => SURFACE_STATUS[surface.id] !== COMING_SOON_LABEL,
).map((surface) => surface.label);

const BYOK_RELEASE_LABEL = new Intl.ListFormat('en', {
  style: 'long',
  type: 'conjunction',
}).format(BYOK_RELEASED_LABELS);

const BYOK_CARD_BODY =
  BYOK_RELEASED_LABELS.length > 0
    ? `Use your provider accounts on supported ${BYOK_RELEASE_LABEL} releases with visible labels.`
    : `Bring your own provider keys on ${BYOK_SURFACES.label}. ${BYOK_SURFACES.availability}`;

const HERO_STATUS_SURFACES = [
  { id: 'web', label: SURFACE_NAMES.web },
  { id: 'desktop', label: SURFACE_NAMES.desktop },
  ...BYOK_RELEASE_SURFACES,
] as const;

const HERO_STATUS_CAPTION = `Where ${joinSurfaceNames(
  HERO_STATUS_SURFACES.map((surface) => surface.label),
)} stand today`;

const HERO_STATUS_ROWS = HERO_STATUS_SURFACES.map((surface) => ({
  label: surface.label,
  value: SURFACE_STATUS[surface.id],
  quiet: SURFACE_STATUS[surface.id] === COMING_SOON_LABEL,
}));

const FREE_PLAN = BILLING_PLAN_PRICING.free.label;
const TEAM_PLAN = BILLING_PLAN_PRICING.team.label;
const ENTERPRISE_PLAN = BILLING_PLAN_PRICING.enterprise.label;

export const metadata = buildMetadata({
  title: `${ENTERPRISE_PLAN} access list: leave an email to discuss a contract`,
  description: `The ${FREE_PLAN} plan on AGI managed cloud is open by default: sign in and start, no waitlist. Paid plans start from the pricing page. Request a conversation about contract-scoped ${ENTERPRISE_PLAN} access and additional governance requirements.`,
  path: '/waitlist',
});

const WHILE_YOU_WAIT = [
  {
    meta: 'Try it now',
    title: 'Try AGI Chat',
    body: 'Hosted chat with projects and artifacts, in the browser today.',
    href: WEB_ENTRY_HREF,
  },
  {
    meta: `Free · ${SURFACE_NAMES.cli} ${SURFACE_STATUS.cli.toLowerCase()}`,
    title: 'Run AGI locally',
    body: 'Free forever, offline-capable, and never silently routed to the cloud.',
    href: '/local',
  },
  {
    meta: 'BYOK',
    title: 'Bring your own keys',
    body: BYOK_CARD_BODY,
    href: '/byok',
  },
  {
    meta: TEAM_PLAN,
    title: `${TEAM_PLAN} pricing`,
    body: `${TEAM_PLAN} is a self-serve per-seat plan with no enterprise contract. Checkout starts from the pricing page; if paid upgrades are not open to your account yet, it offers the upgrade waitlist or takes an access code.`,
    href: '/pricing',
  },
];

export default function WaitlistPage() {
  return (
    <div data-design="agi" className="agi-ds-page agi-co">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-waitlist-title"
          eyebrow="AGI Cloud"
          title={`${ENTERPRISE_PLAN} access, by contract.`}
          lede={
            <>
              This list is for <strong>contract-scoped {ENTERPRISE_PLAN} access</strong>. SSO, SCIM,
              audit export, and retention controls are live for entitled workspaces; leave your
              email to discuss contracts, custom governance, and additional capabilities beyond
              self-serve {TEAM_PLAN}. You do not need this list to use AGI. The {FREE_PLAN} plan on
              AGI managed cloud is open by default:{' '}
              <Link href="/get-started" className="agi-ds-link">
                sign in and start
              </Link>
              , no waitlist. Paid upgrades start from{' '}
              <Link href="/pricing" className="agi-ds-link">
                pricing
              </Link>
              ; if they are not open to your account yet, you can join the upgrade waitlist there or
              enter an access code. If you want builds before they ship instead,{' '}
              <Link href="/beta" className="agi-ds-link">
                apply to the beta programme
              </Link>
              .
            </>
          }
          ctas={[]}
          visual={
            <Stack gap="base">
              <Eyebrow>{HERO_STATUS_CAPTION}</Eyebrow>
              <Ledger rows={HERO_STATUS_ROWS} caption={HERO_STATUS_CAPTION} />
            </Stack>
          }
        />

        <Section id="join" size="sm">
          <Stack gap="tight">
            <PublicWaitlistForm source="website" ctaLabel={`Discuss ${ENTERPRISE_PLAN} access`} />
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
