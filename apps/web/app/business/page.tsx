import type { Metadata } from 'next';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import {
  CampaignHero,
  FeatureGrid,
  LaunchCta,
  LedgerSection,
  RouteMap,
} from '../../components/marketing/LandingSections';
import { LAUNCH, POSITIONING } from '../../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'AGI for Business - Local, BYOK, and Cloud invite workspaces',
  description:
    'A business AI workspace across chat, projects, artifacts, research, code, apps, and governance with Local, BYOK, and invite-only managed cloud modes.',
  alternates: { canonical: 'https://agiworkforce.com/business' },
};

export default function BusinessPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <CampaignHero
          eyebrow={`${LAUNCH.publicLabel} · Business workspace`}
          title="The AI workspace that does not lock your company to one model."
          lede={`AGI gives teams the ChatGPT and Claude-style work surface they expect: projects, files, artifacts, research, apps, coding agents, and governance. The difference is routing. ${POSITIONING.trustBoundary}`}
          primaryCta={{ href: '/contact-sales', label: 'Plan a workspace' }}
          secondaryCta={{ href: '/teams', label: 'See team controls' }}
          chips={['Company knowledge', 'Apps + MCP', 'Artifacts', 'Research', 'AGI Code']}
          panelTitle="Business stack"
          panelRows={[
            { k: 'Users', v: 'Individuals, teams, and enterprise workspaces' },
            { k: 'Modes', v: 'Local for private work, BYOK for provider choice, Cloud by invite' },
            { k: 'Admin', v: 'SSO, audit logs, usage, retention, billing, and connector policy' },
            { k: 'Launch', v: LAUNCH.allProductsLabel },
          ]}
        />

        <FeatureGrid
          eyebrow="What buyers compare"
          title="The parity checklist for OpenAI and Claude workspaces."
          items={[
            {
              meta: 'Workspace',
              title: 'Projects, files, instructions, and memory',
              body: 'Keep long-running work inside named projects with shared files, standing instructions, and memory controls that users can inspect.',
              href: '/features/projects',
            },
            {
              meta: 'Creation',
              title: 'Artifacts and canvas-style iteration',
              body: 'Build documents, code, dashboards, reports, and prototypes in a side-by-side artifact surface instead of burying work in chat.',
              href: '/features/artifacts',
            },
            {
              meta: 'Research',
              title: 'Cited research from web and connected data',
              body: 'Use source-backed research flows for market maps, vendor diligence, policy briefs, and strategy work.',
              href: '/features/deep-research',
            },
            {
              meta: 'Engineering',
              title: 'AGI Code across CLI, desktop, and VS Code',
              body: 'Give developers agentic coding with diffs, tests, worktrees, permissions, and provider choice.',
              href: '/agi-code',
            },
            {
              meta: 'Apps',
              title: 'Connect tools without losing governance',
              body: 'Use apps, MCP connectors, and local desktop extensions with explicit permission boundaries.',
              href: '/apps',
            },
            {
              meta: 'Admin',
              title: 'Control spend, data, access, and retention',
              body: 'Separate Local, BYOK, and Cloud policy so adoption can start before managed compute spend scales.',
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
              v: 'Teams can use OpenAI, Anthropic, Google, OpenRouter, Groq, Mistral, xAI, DeepSeek, Perplexity, local models, and compatible endpoints from one product.',
            },
            {
              k: 'Cost shape',
              v: 'Local and BYOK adoption can start before AGI takes on managed compute exposure. Cloud remains invite-based until controls are proven.',
            },
            {
              k: 'Data boundary',
              v: 'Local work stays local. BYOK work goes to the provider the user chooses. Cloud work is clearly labeled and gated by invite.',
            },
            {
              k: 'Surfaces',
              v: 'The same product line spans web, mobile, desktop, CLI, Chrome, and VS Code instead of forcing one workflow into one app.',
            },
          ]}
        />

        <RouteMap
          eyebrow="Best next pages"
          title="Send ad traffic to the page that matches intent."
          routes={[
            {
              meta: 'Teams',
              title: 'Team workspaces',
              body: 'Admin, billing, connector policy, and shared projects.',
              href: '/teams',
            },
            {
              meta: 'Developers',
              title: 'AGI Code',
              body: 'Codex and Claude Code-style workflows with model choice.',
              href: '/agi-code',
            },
            {
              meta: 'Local + BYOK',
              title: 'BYOK mode',
              body: 'Bring provider keys and pay providers directly.',
              href: '/byok',
            },
            {
              meta: 'Governance',
              title: 'Enterprise',
              body: 'SSO, audit logs, retention, and security review.',
              href: '/enterprise',
            },
          ]}
        />

        <LaunchCta
          title="A business AI suite that can start with zero managed compute spend."
          body="Launch with Local and BYOK, capture cloud demand with invite codes, and route high-intent teams into managed cloud when the controls are ready."
          primary={{ href: '/contact-sales', label: 'Contact sales' }}
          secondary={{ href: '/download', label: 'Get launch access' }}
        />
        <MarketingFooter />
      </main>
    </div>
  );
}
