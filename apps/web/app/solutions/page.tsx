import type { Metadata } from 'next';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import {
  CampaignHero,
  FeatureGrid,
  LaunchCta,
  RouteMap,
} from '../../components/marketing/LandingSections';
import { LAUNCH, POSITIONING } from '../../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'AGI Solutions - AI workflows for teams, developers, and operators',
  description:
    'Explore AGI solution pages for business teams, developers, startups, consultants, sales, IT service providers, and enterprise buyers.',
  alternates: { canonical: 'https://agiworkforce.com/solutions' },
};

export default function SolutionsPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <CampaignHero
          eyebrow={`${LAUNCH.publicLabel} · Solutions`}
          title="One AGI suite, different reasons to switch."
          lede={`Ads should not send every user to the same homepage. Developers need AGI Code. Teams need governance. Operators need Cowork. Everyone needs the same trust boundary: ${POSITIONING.trustBoundary}`}
          primaryCta={{ href: '/download', label: LAUNCH.ctaLabel }}
          secondaryCta={{ href: '/business', label: 'Business overview' }}
          chips={['Developers', 'Teams', 'Startups', 'Consultants', 'Operators']}
          panelTitle="Campaign map"
          panelRows={[
            { k: 'Developer', v: '/agi-code, /cli, /vscode-extension, /compare/codex' },
            { k: 'Business', v: '/business, /teams, /enterprise, /apps' },
            { k: 'Local/BYOK', v: '/local, /byok, /providers, /download' },
            { k: 'Use cases', v: '/use-cases and role-specific pages' },
          ]}
        />

        <RouteMap
          eyebrow="Solution hubs"
          title="Primary ad destinations."
          routes={[
            {
              meta: 'Business',
              title: 'AGI for Business',
              body: 'Workspace, governance, projects, research, apps, and code across providers.',
              href: '/business',
            },
            {
              meta: 'Teams',
              title: 'AGI for Teams',
              body: 'Shared projects, connector policy, usage visibility, and admin rollout.',
              href: '/teams',
            },
            {
              meta: 'Developers',
              title: 'AGI Code',
              body: 'CLI, VS Code, desktop code, diffs, tests, worktrees, and permissions.',
              href: '/agi-code',
            },
            {
              meta: 'Operators',
              title: 'AGI Cowork',
              body: 'Desktop browser, files, apps, scheduled tasks, and mobile dispatch.',
              href: '/cowork',
            },
            {
              meta: 'Privacy',
              title: 'Local mode',
              body: 'Run supported local models on your own device where available.',
              href: '/local',
            },
            {
              meta: 'Provider choice',
              title: 'BYOK mode',
              body: 'Bring provider keys and route work explicitly to the selected provider.',
              href: '/byok',
            },
          ]}
        />

        <FeatureGrid
          eyebrow="Ad group ideas"
          title="Build campaigns around intent, not features alone."
          items={[
            {
              meta: 'High intent',
              title: 'Alternatives',
              body: 'Target users comparing ChatGPT, Claude, Codex, Claude Code, Gemini, Perplexity, local LLM apps, and OpenRouter frontends.',
              href: '/compare',
            },
            {
              meta: 'Problem intent',
              title: 'Private AI chat',
              body: 'Route to Local or BYOK pages with explicit boundary language instead of blanket privacy claims.',
              href: '/local',
            },
            {
              meta: 'Developer intent',
              title: 'AI coding agent',
              body: 'Route to AGI Code, CLI, VS Code, Codex comparison, and Claude Code comparison pages.',
              href: '/agi-code',
            },
            {
              meta: 'Workflow intent',
              title: 'Research and reports',
              body: 'Route to deep research, artifacts, consulting, and business pages.',
              href: '/features/deep-research',
            },
            {
              meta: 'Procurement intent',
              title: 'Enterprise AI workspace',
              body: 'Route to Business, Teams, Enterprise, Trust, Security, and contact-sales pages.',
              href: '/enterprise',
            },
            {
              meta: 'Role intent',
              title: 'Use case pages',
              body: 'Use role-specific pages for startups, IT providers, sales teams, and consulting firms.',
              href: '/use-cases',
            },
          ]}
        />

        <LaunchCta
          title="This is the map for scaling beyond one ad group."
          body="Use 50+ ad groups only if each group has a matching landing page, a matching promise, and a matching next action."
          primary={{ href: '/download', label: LAUNCH.ctaLabel }}
          secondary={{ href: '/use-cases', label: 'Use cases' }}
        />
        <MarketingFooter />
      </main>
    </div>
  );
}
