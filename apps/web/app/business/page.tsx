import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { LedgerSection, RouteMap } from '@/features/marketing/components/LandingSections';
import {
  CapabilityGrid,
  FinalCta,
  FlagshipHero,
} from '@/features/marketing/components/FlagshipSections';
import { CATALOG_AS_OF, MARKETING } from '../../lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'AGI for Business: Local, BYOK, and managed-cloud workspaces',
  description:
    'A business AI workspace with chat, projects, artifacts, research, code, apps, and governance. Local, BYOK, and public-alpha managed cloud modes.',
  path: '/business',
});

export default function BusinessPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <FlagshipHero
          eyebrow="AGI for business"
          lede="AGI gives teams the working surface they expect: projects, files, artifacts, cited research, and coding agents. With routing policy on top. Local work stays on the device, BYOK routes to the provider you choose on Desktop and CLI, and AGI managed cloud is in public alpha — open by default."
          ctas={[
            { href: '/contact-sales', label: 'Contact Sales' },
            { href: '/download', label: 'Get AGI Desktop' },
            { href: '/pricing', label: 'See Plans' },
          ]}
          modeRibbon={['Local · on-device', 'BYOK · your keys', 'Cloud · public alpha']}
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
              body: 'Agentic coding across CLI, Desktop, and VS Code: diffs, tests, sandboxed execution, and provider choice.',
              href: '/agi-code',
            },
            {
              meta: 'Apps',
              title: 'Tools without lost governance',
              body: 'Apps, MCP connectors, and local desktop extensions behind explicit permission boundaries.',
              href: '/apps',
            },
            {
              meta: 'Admin',
              title: 'Spend, data, and access controls',
              body: 'Separate Local, BYOK, and Cloud policy so adoption can start before managed compute spend exists at all.',
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
              // The count is derived from models.json and dated by its own
              // lastUpdated stamp. A number a buyer can open and count beats a
              // padded floor they have to trust.
              v: `One product routes across a dated, inspectable catalog — ${MARKETING.models.count} models across ${MARKETING.providers.count} provider integrations as of ${CATALOG_AS_OF}. Frontier cloud APIs through BYOK on Desktop and CLI, plus local models through Ollama, LM Studio, llama.cpp, and vLLM. Model access is tiered by plan, so higher-capability models sit on higher tiers.`,
            },
            {
              k: 'Cost shape',
              v: 'Adoption starts with free Local and BYOK modes. AGI managed cloud is public alpha, open by default; ledgering, abuse, and refund controls keep pace with usage.',
            },
            {
              k: 'Data boundary',
              v: 'Local work never silently leaves the device. BYOK traffic goes to the provider you choose. Cloud work is labeled and open in public alpha.',
            },
            {
              k: 'Surfaces',
              v: 'The same product spans web, mobile, desktop, terminal, browser, and IDE instead of forcing one workflow into one app.',
            },
            {
              k: 'Admin',
              // Mirrors the corrected /enterprise wording. These are contract
              // commitments in progress, not switches available today, and the
              // implementations are owned by a separate workstream.
              v: 'Workspace accounts today. Identity, audit, and retention controls are contract-scoped commitments rather than self-serve settings — the enterprise page states which are built and which are not.',
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
              // Previously "usage visibility". Usage is reported per user
              // (apps/web/app/api/usage/route.ts is user-scoped and has no
              // organization dimension); there is no org/project budget,
              // showback, or admin usage roll-up anywhere in the product, so a
              // team-control list must not imply one.
              body: 'Shared projects, connector policy, and separated Local, BYOK, and Cloud spend.',
              href: '/teams',
            },
            {
              meta: 'Developers',
              title: 'AGI Code',
              body: 'Agentic coding with sessions, diffs, reviews, and model choice.',
              href: '/agi-code',
            },
            {
              meta: 'Local + BYOK',
              title: 'BYOK mode',
              body: 'Bring provider keys on Desktop and CLI and pay providers directly.',
              href: '/byok',
            },
            {
              meta: 'Governance',
              title: 'Enterprise',
              body: 'Security review, BYOK enforcement, and contract-scoped controls.',
              href: '/enterprise',
            },
          ]}
        />

        <FinalCta
          eyebrow="Start now"
          title="Start the rollout where the risk is lowest."
          body="Begin with Local and BYOK at no platform cost, evaluate public-alpha AGI managed cloud today, and buy Team seats when you need shared workspaces. Enterprise controls are sales-assisted."
          ctas={[
            { href: '/contact-sales', label: 'Contact Sales' },
            { href: '/download', label: 'Get AGI Desktop' },
            { href: '/pricing', label: 'See Plans' },
          ]}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
