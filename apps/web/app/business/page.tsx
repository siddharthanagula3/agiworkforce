import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { LedgerSection, RouteMap } from '../../components/marketing/LandingSections';
import {
  CapabilityGrid,
  FinalCta,
  FlagshipHero,
} from '../../components/marketing/FlagshipSections';
import { LAUNCH, MARKETING } from '../../lib/marketing-constants';

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
            { href: '/download', label: 'Get notified' },
            { label: 'Team & Enterprise access', waitlist: true },
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
              v: `One product routes across ${MARKETING.providers.display} providers and ${MARKETING.models.display} models. Frontier cloud APIs through BYOK on Desktop and CLI, plus local models through Ollama and LM Studio.`,
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
              v: 'Workspace accounts today; SSO, SCIM, audit export, and retention controls are scoped on enterprise contracts.',
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
              body: 'Shared projects, connector policy, and usage visibility.',
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
              body: 'SSO, audit, retention, and security review on contract.',
              href: '/enterprise',
            },
          ]}
        />

        <FinalCta
          eyebrow={LAUNCH.publicLabel}
          title="Start the rollout where the risk is lowest."
          body="Begin with Local and BYOK at no platform cost, evaluate public-alpha AGI managed cloud today, and talk to sales about workspace policy and Team & Enterprise controls."
          ctas={[
            { href: '/contact-sales', label: 'Contact Sales' },
            { href: '/download', label: 'Get notified' },
            { label: 'Team & Enterprise access', waitlist: true },
          ]}
          stamp={`Public launch · ${LAUNCH.date}`}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
