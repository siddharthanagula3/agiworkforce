import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Ledger,
  Prose,
  Section,
  Stack,
} from '@/features/marketing/components/system';
import { FactLine, PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import {
  BILLING_PLAN_PRICING,
  CONNECTORS_COMING_SOON_DETAIL,
  PRODUCT_NAMES,
  connectorsReleased,
} from '@agiworkforce/types';
import { PAID_UPGRADE_ACCESS_NOTE } from '@/lib/billing/paid-upgrade-copy';
import { CATALOG_SCOPES } from '@/lib/catalog-scopes';
import {
  AVAILABLE_NOW_LABEL,
  BYOK_SURFACES,
  CATALOG_AS_OF,
  COMING_SOON_LABEL,
  RELEASED_SURFACES,
  SURFACE_NAMES,
  SURFACE_STATUS,
  UNRELEASED_SURFACES,
  surfaceAvailabilitySummary,
} from '../../lib/marketing-constants';
import { SURFACE_IDS, joinSurfaceNames, type SurfaceId } from '../../lib/surface-status';
import {
  FOUNDER_NAME,
  FOUNDER_ROLE,
  CONTACT_EMAIL,
  GOVERNING_LAW,
  LEGAL_ENTITY,
  LEGAL_ENTITY_DESCRIPTOR,
  MANAGED_CLOUD_STATUS,
  PUBLIC_WEB_LAUNCH_DATE,
  REGISTERED_AGENT_ADDRESS,
  contactMailto,
} from '../../lib/legal-constants';
import '@/features/marketing/components/pages/company/company.css';

export const metadata = buildMetadata({
  title: 'Press: the fact sheet',
  description: `Press fact sheet for AGI: what it is, who builds it, which surfaces have shipped, and what we do not claim. Product facts as of ${CATALOG_AS_OF}.`,
  path: '/press',
});

const NESTED_SEPARATOR = ' · ';

const CONNECTORS_RELEASED = connectorsReleased();
const TOOLS_FACT = CONNECTORS_RELEASED ? 'tools and connectors' : 'tools';
const CONNECTORS_NOTE = CONNECTORS_RELEASED ? '' : ` ${CONNECTORS_COMING_SOON_DETAIL}`;

const SURFACE_PRODUCTS = {
  web: `${PRODUCT_NAMES.chat}, in any browser`,
  desktop: `${PRODUCT_NAMES.desktop} for macOS`,
  cli: `${PRODUCT_NAMES.cli} for macOS, Linux and Windows`,
  mobile: `${PRODUCT_NAMES.mobile} (iOS, Android)`,
  vscode: `${PRODUCT_NAMES.code} for VS Code`,
  chrome: `${PRODUCT_NAMES.extension} for Chrome`,
} as const satisfies Record<SurfaceId, string>;

const ALL_SURFACE_NAMES = joinSurfaceNames(SURFACE_IDS.map((surface) => SURFACE_NAMES[surface]));

function productList(surfaces: readonly SurfaceId[]): string {
  return surfaces.map((surface) => SURFACE_PRODUCTS[surface]).join(NESTED_SEPARATOR);
}

const RELEASED_FACT = { label: AVAILABLE_NOW_LABEL, value: productList(RELEASED_SURFACES) };
const UNRELEASED_FACT = {
  label: COMING_SOON_LABEL,
  value: `${productList(UNRELEASED_SURFACES)}. Each exists in the repository with a release workflow. The download page shows what is published.`,
};

const SURFACE_FACTS: { label: string; value: string }[] = [
  ...(RELEASED_SURFACES.length > 0 ? [RELEASED_FACT] : []),
  ...(UNRELEASED_SURFACES.length > 0 ? [UNRELEASED_FACT] : []),
];

const PRODUCT_FACTS: { label: string; value: string }[] = [
  {
    label: 'What it is',
    value: `An AI assistant and agent platform: chat, code, research, files, projects, artifacts, ${TOOLS_FACT}, memory, and scheduled work.${CONNECTORS_NOTE}`,
  },
  ...SURFACE_FACTS,
  {
    label: 'Where inference runs',
    value: `Three separate routes: Local (models on the user’s own hardware, works offline), BYOK (the user’s own provider key, traffic goes directly to that provider), and AGI managed cloud (hosted and metered by AGI). Work does not move between routes without an explicit, labeled action. AGI Chat runs on managed cloud. Local runs in the CLI. BYOK runs on ${BYOK_SURFACES.label}. ${BYOK_SURFACES.availability}`,
  },
  {
    label: 'Managed cloud status',
    value: `In ${MANAGED_CLOUD_STATUS}, not general availability. AGI Chat launched publicly on ${PUBLIC_WEB_LAUNCH_DATE}. The ${BILLING_PLAN_PRICING.free.label} plan is open by default: sign in and start, with no waitlist and no invite. ${PAID_UPGRADE_ACCESS_NOTE}`,
  },
  {
    label: 'Model catalog',
    value: `${CATALOG_SCOPES.catalogueEntries.text} across ${CATALOG_SCOPES.providerRecords.text}, as of ${CATALOG_AS_OF}. The catalog is a versioned, dated file in the repository rather than a marketing figure.`,
  },
  {
    label: 'Model access by plan',
    value: `Tiered and enforced in shared code, not uniform: free models on ${BILLING_PLAN_PRICING.free.label}, an economy roster from ${BILLING_PLAN_PRICING.basic.label}, further models added on ${BILLING_PLAN_PRICING.pro.label}, and frontier models on ${BILLING_PLAN_PRICING.max.label} and above. A plan cannot reach a model above its tier, so lower plans do not get frontier access.`,
  },
  {
    label: 'Pricing posture',
    value: `AGI charges nothing for Local or BYOK: users pay their provider directly, or nothing at all when running locally. Managed cloud is metered. ${BILLING_PLAN_PRICING.team.label} is priced per seat, with current checkout availability shown on Pricing; ${BILLING_PLAN_PRICING.enterprise.label} is sales-assisted.`,
  },
];

const COMPANY_FACTS: { label: string; value: string }[] = [
  { label: 'Legal entity', value: `${LEGAL_ENTITY}, ${LEGAL_ENTITY_DESCRIPTOR}` },
  { label: 'Registered agent', value: REGISTERED_AGENT_ADDRESS },
  { label: 'Governing law', value: GOVERNING_LAW.replace(/^the /, '') },
  { label: 'Founder', value: `${FOUNDER_NAME}, ${FOUNDER_ROLE}` },
  { label: 'Ownership', value: 'Independent and privately held. No outside funding is announced.' },
  { label: 'Press contact', value: CONTACT_EMAIL },
];

const NOT_CLAIMED: string[] = [
  'No security certifications. SOC 2 and ISO 27001 are not held: no report or certificate exists, no auditor or certification body is engaged, and no audit is in progress. HIPAA workflows are not offered. The trust page carries the dated ledger.',
  'No named customers, logos, or testimonials, and no case studies. We publish those only with written permission, and we have none cleared to publish.',
  'No usage, revenue, headcount, or funding figures.',
  'No published uptime history or incident archive. The status page shows service levels measured over a rolling window, and the SLA page states targets, not guarantees.',
  'No general availability claim for managed cloud.',
];

const HERO_FACTS = [
  CATALOG_SCOPES.catalogueEntries.text,
  CATALOG_SCOPES.providerRecords.text,
  `Web ${SURFACE_STATUS.web.toLowerCase()}`,
  `CLI ${SURFACE_STATUS.cli.toLowerCase()}`,
  `Desktop ${SURFACE_STATUS.desktop.toLowerCase()}`,
  `As of ${CATALOG_AS_OF}`,
];

export default function PressPage() {
  return (
    <div data-design="agi" className="agi-ds-page agi-co">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-press-title"
          eyebrow="Press"
          title="Company facts and press resources."
          lede={`Product facts as of ${CATALOG_AS_OF}, checked against the product source. Where we have nothing to show (customers, certifications, usage numbers), this page says so.`}
          ctas={[
            { href: contactMailto('Press enquiry'), label: 'Email the press contact' },
            { href: '/trust', label: 'See the trust posture', variant: 'secondary' },
          ]}
        />

        <FactLine facts={HERO_FACTS} />

        <Section id="boilerplate" labelledBy="agi-press-boiler-title" rule>
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-press-boiler-title">
                Two lengths, ready to paste.
              </h2>
              <Prose>
                Both are written to be accurate on their own, out of context. Please use them as-is
                rather than paraphrasing the status of a surface.
              </Prose>
            </div>
            <Stack gap="loose">
              <Stack gap="tight">
                <h3 className="agi-ds-h3">Short</h3>
                <Prose size="sm">
                  AGI is an AI assistant designed to work across the web, desktop, and terminal, and
                  to let you choose whether each request runs on your own hardware, on your own
                  provider key, or on AGI&rsquo;s hosted service. AGI Chat runs on the hosted
                  service. The CLI runs models on your own hardware, and your own provider key works
                  on {BYOK_SURFACES.label}. {surfaceAvailabilitySummary()}
                </Prose>
              </Stack>
              <Stack gap="tight">
                <h3 className="agi-ds-h3">Long</h3>
                <Prose size="sm">
                  AGI is an AI assistant and agent platform built by {LEGAL_ENTITY},{' '}
                  {LEGAL_ENTITY_DESCRIPTOR}. It spans {SURFACE_IDS.length} surfaces (
                  {ALL_SURFACE_NAMES}). {surfaceAvailabilitySummary()} Its distinguishing design
                  choice is that the user selects where inference happens: locally on their own
                  hardware, through their own provider API key, or on AGI&rsquo;s managed cloud.
                  Those three routes are separate trust boundaries, and work does not move between
                  them without an explicit, labeled action. AGI Chat runs on managed cloud. The
                  local route runs in the CLI, and the provider-key route runs on{' '}
                  {BYOK_SURFACES.label}.
                </Prose>
              </Stack>
            </Stack>
          </Stack>
        </Section>

        <Section id="product" labelledBy="agi-press-product-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-press-product-title">
                The product, stated precisely.
              </h2>
              <Prose>
                {`“${AVAILABLE_NOW_LABEL}” means the surface is released. “${COMING_SOON_LABEL}” means the code exists and the surface is not released. Please do not describe those as products readers can get.`}
              </Prose>
            </div>
            <Ledger caption="Product facts" rows={PRODUCT_FACTS} />
            <Prose size="sm">
              Pricing figures change and are deliberately not restated here. See{' '}
              <Link href="/pricing" className="agi-ds-link">
                the pricing page
              </Link>{' '}
              for current numbers.
            </Prose>
          </Stack>
        </Section>

        <Section id="company" labelledBy="agi-press-company-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-press-company-title">
              Who builds it.
            </h2>
            <div className="agi-ds-grid-2">
              {COMPANY_FACTS.map((fact) => (
                <div key={fact.label}>
                  <Eyebrow>{fact.label}</Eyebrow>
                  <Prose size="sm">{fact.value}</Prose>
                </div>
              ))}
            </div>
          </Stack>
        </Section>

        <Section id="not-claimed" labelledBy="agi-press-notclaimed-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-press-notclaimed-title">
                The things we cannot back up.
              </h2>
              <Prose>
                If you are checking a claim made about AGI somewhere else, and it appears on this
                list, it did not come from us.
              </Prose>
            </div>
            <ul aria-label="Not claimed" className="list-disc ps-5">
              {NOT_CLAIMED.map((item) => (
                <li className="agi-ds-prose" data-size="sm" key={item}>
                  {item}
                </li>
              ))}
            </ul>
          </Stack>
        </Section>

        <Section id="assets" labelledBy="agi-press-assets-title" rule>
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-press-assets-title">
                Logo files.
              </h2>
              <Prose>
                The AGI mark, served directly from this site. Please use it unmodified: do not
                recolor, rotate, add effects, or place it on a busy background. The name is written
                &ldquo;AGI&rdquo;, and the company is {LEGAL_ENTITY}.
              </Prose>
            </div>
            <ButtonRow>
              <a href="/logo-512.png" download className="agi-ds-btn" data-variant="primary">
                AGI mark: PNG, 512&times;512
              </a>
              <a href="/logo-192.png" download className="agi-ds-btn" data-variant="secondary">
                AGI mark: PNG, 192&times;192
              </a>
              <a href="/og-image.svg" download className="agi-ds-btn" data-variant="secondary">
                Social card: SVG
              </a>
            </ButtonRow>
          </Stack>
        </Section>

        <Section id="contact" labelledBy="agi-press-contact-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-press-contact-title">
                Interviews, demos, and fact-checks.
              </h2>
              <Prose>
                Email {CONTACT_EMAIL} with your outlet, deadline, and angle. If you are checking a
                specific number before you publish, say so in the subject line and we will confirm
                or correct it.
              </Prose>
            </div>
            <ButtonRow>
              <Button href={contactMailto('Press enquiry')}>Email the press contact</Button>
              <Button href="/about" variant="secondary">
                Read about AGI
              </Button>
              <Button href="/trust" variant="secondary">
                See the trust posture
              </Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
