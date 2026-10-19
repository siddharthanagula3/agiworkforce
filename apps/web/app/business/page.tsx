import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { LedgerSection, RouteMap } from '@/features/marketing/components/LandingSections';
import {
  CapabilityGrid,
  FinalCta,
  FlagshipHero,
} from '@/features/marketing/components/SurfaceSections';
import {
  BILLING_PLAN_PRICING,
  CONNECTORS_COMING_SOON_MESSAGE,
  connectorsReleased,
} from '@agiworkforce/types';
import { PAID_UPGRADE_ACCESS_NOTE } from '@/lib/billing/paid-upgrade-copy';
import { CATALOG_SCOPES } from '@/lib/catalog-scopes';
import { MANAGED_CLOUD_STATUS } from '@/lib/legal-constants';
import { SURFACE_IDS, joinSurfaceNames } from '@/lib/surface-status';
import {
  BYOK_SURFACES,
  CATALOG_AS_OF,
  CLI_AVAILABILITY_NOTE,
  CLI_LOCAL_RUNTIMES,
  SURFACE_NAMES,
  SURFACE_STATUS,
  surfaceAvailabilitySummary,
  surfaceCta,
} from '../../lib/marketing-constants';

const CONNECTORS_NOTE = connectorsReleased() ? '' : ` ${CONNECTORS_COMING_SOON_MESSAGE}`;
const ALL_SURFACE_NAMES = joinSurfaceNames(SURFACE_IDS.map((surface) => SURFACE_NAMES[surface]));
const AGI_CODE_SURFACES = `the CLI (${SURFACE_STATUS.cli.toLowerCase()}) and VS Code (${SURFACE_STATUS.vscode.toLowerCase()})`;

export const metadata = buildMetadata({
  title: 'AGI for Business: an AI workspace your team can govern',
  description: `A business AI workspace with chat, projects, artifacts, research, code, apps, and governance. AGI Web runs on managed cloud in ${MANAGED_CLOUD_STATUS}. Local and BYOK run in the CLI. ${CLI_AVAILABILITY_NOTE}`,
  path: '/business',
});

export default function BusinessPage() {
  return (
    <div data-design="agi">
      <Header />
      <main id="main-content" tabIndex={-1} className="agi-shell agi-surface">
        <FlagshipHero
          eyebrow="AGI for business"
          titleLines={['AI work your team can govern.']}
          ctas={[
            { href: '/contact-sales', label: 'Contact Sales' },
            surfaceCta('desktop'),
            { href: '/pricing', label: 'See Plans' },
          ]}
        />

        <CapabilityGrid
          eyebrow="Workspace"
          title="Everything a working team expects."
          items={[
            {
              meta: 'Projects',
              title: 'Projects, files, and memory',
              body: 'Keep long-running work inside named projects with shared files, standing instructions, and memory controls users can inspect.',
              href: '/features/projects',
            },
            {
              meta: 'Creation',
              title: 'Artifacts',
              body: 'Build documents, code, dashboards, and prototypes in a side-by-side artifact surface instead of burying work in chat.',
              href: '/features/artifacts',
            },
            {
              meta: 'Research',
              title: 'Cited research',
              body: 'Source-backed research flows for market maps, vendor diligence, policy briefs, and strategy work.',
              href: '/features/deep-research',
            },
            {
              meta: 'Engineering',
              title: 'AGI Code',
              body: `Agentic coding in ${AGI_CODE_SURFACES}: diffs, tests, sandboxed execution, and provider choice.`,
              href: '/agi-code',
            },
            {
              meta: 'Apps',
              title: 'Tools without lost governance',
              body: `Apps, MCP connectors, and local tool servers run by the CLI, behind explicit permission boundaries.${CONNECTORS_NOTE} ${CLI_AVAILABILITY_NOTE}`,
              href: '/apps',
            },
            {
              meta: 'Admin',
              title: 'Spend, data, and access controls',
              body: 'A workspace policy sets which of Local, BYOK, and Cloud are allowed, including whether managed cloud may be used at all.',
              href: '/enterprise',
            },
          ]}
        />

        <LedgerSection
          eyebrow="Positioning"
          title="What AGI changes for a business rollout."
          rows={[
            {
              k: 'Model choice',
              v: `One product routes across a dated, inspectable catalog: ${CATALOG_SCOPES.catalogueEntries.text} across ${CATALOG_SCOPES.providerRecords.text} as of ${CATALOG_AS_OF}. The CLI supports BYOK plus local ${CLI_LOCAL_RUNTIMES.label} models. ${BYOK_SURFACES.availability} AGI Web and Desktop use managed cloud. Model access is tiered by plan, so higher-capability models sit on higher tiers.`,
            },
            {
              k: 'Cost shape',
              v: `AGI managed cloud is ${MANAGED_CLOUD_STATUS}, open by default: a new account starts on the ${BILLING_PLAN_PRICING.free.label} plan in AGI Web. ${PAID_UPGRADE_ACCESS_NOTE} Local and BYOK carry no AGI charge and run in the CLI. ${CLI_AVAILABILITY_NOTE}`,
            },
            {
              k: 'Data boundary',
              v: `Local work never silently leaves the device. BYOK traffic goes to the provider you choose. Cloud work is labeled and open in ${MANAGED_CLOUD_STATUS}.`,
            },
            {
              k: 'Surfaces',
              v: `One product is built for ${ALL_SURFACE_NAMES} instead of forcing one workflow into one app. ${surfaceAvailabilitySummary()}`,
            },
            {
              k: 'Admin',
              v: `Workspace accounts today. Single sign-on, SCIM directory provisioning, the audit trail with its JSONL export, and per-workspace retention windows are built and configured by your own workspace owner, gated on the ${BILLING_PLAN_PRICING.enterprise.label} entitlement. The enterprise page states what is not built.`,
            },
          ]}
        />

        <RouteMap
          eyebrow="Where to go next"
          title="Pick the page that matches your question."
          routes={[
            {
              meta: 'Teams',
              title: 'Team workspaces',
              body: `Shared projects, connector policy, and separated Local, BYOK, and Cloud spend.${CONNECTORS_NOTE}`,
              href: '/teams',
            },
            {
              meta: 'Developers',
              title: 'AGI Code',
              body: `Agentic coding in ${AGI_CODE_SURFACES}, with sessions, diffs, reviews, and model choice.`,
              href: '/agi-code',
            },
            {
              meta: 'Local + BYOK',
              title: 'BYOK mode',
              body: `Bring provider keys in the CLI and pay providers directly. ${BYOK_SURFACES.availability}`,
              href: '/byok',
            },
            {
              meta: 'Governance',
              title: 'Enterprise',
              body: `Security review, single sign-on, the audit trail, and retention windows, gated on the ${BILLING_PLAN_PRICING.enterprise.label} entitlement.`,
              href: '/enterprise',
            },
          ]}
        />

        <FinalCta
          eyebrow="Start now"
          title="Start the rollout where the risk is lowest."
          body={`Start on the ${BILLING_PLAN_PRICING.free.label} plan in AGI Web today. ${PAID_UPGRADE_ACCESS_NOTE} Local and BYOK run in the CLI at no platform cost. ${CLI_AVAILABILITY_NOTE} ${BILLING_PLAN_PRICING.enterprise.label} controls are sales-assisted.`}
          ctas={[
            { href: '/contact-sales', label: 'Contact Sales' },
            surfaceCta('desktop'),
            { href: '/pricing', label: 'See Plans' },
          ]}
        />
      </main>
      <MarketingFooter />
    </div>
  );
}
