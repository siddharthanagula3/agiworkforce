import type { Metadata } from 'next';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { RouteMap } from '../../components/marketing/LandingSections';
import {
  CapabilityGrid,
  FinalCta,
  FlagshipHero,
} from '../../components/marketing/FlagshipSections';
import { LAUNCH } from '../../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'AGI Solutions: AI workflows for teams, developers, and operators',
  description:
    'Explore AGI solution pages for business teams, developers, startups, consultants, sales teams, IT service providers, and enterprise buyers.',
  alternates: { canonical: 'https://agiworkforce.com/solutions' },
};

export default function SolutionsPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <FlagshipHero
          eyebrow="Solutions"
          titleLines={['One suite.', 'Many ways in.']}
          em="Many ways in."
          lede="Developers come for the terminal. Teams come for governance. Operators come for scheduled desktop work. Everyone gets the same rule: Local, BYOK, and AGI Cloud are separate, visible routes. Nothing moves between them silently."
          ctas={[
            { href: '/download', label: 'Get notified' },
            { href: '/business', label: 'See AGI for Business' },
            { label: 'Team & Enterprise access', waitlist: true },
          ]}
          modeRibbon={['Local · on-device', 'BYOK · your keys', 'Cloud · public alpha']}
        />

        <RouteMap
          eyebrow="Solution hubs"
          title="Start with the page that matches your work."
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
              body: 'CLI, VS Code, and desktop coding with diffs, tests, and permissions.',
              href: '/agi-code',
            },
            {
              meta: 'Operators',
              title: 'AGI Work',
              body: 'Scheduled desktop work, file workflows, and mobile-to-desktop dispatch.',
              href: '/agi-work',
            },
            {
              meta: 'Privacy',
              title: 'Local mode',
              body: 'Run local models on your own hardware. Free and offline-capable.',
              href: '/local',
            },
            {
              meta: 'Provider choice',
              title: 'BYOK mode',
              body: 'Bring provider keys on Desktop and CLI and route work explicitly.',
              href: '/byok',
            },
          ]}
        />

        <CapabilityGrid
          eyebrow="By intent"
          title="Find your path by what you need."
          items={[
            {
              meta: 'Privacy',
              title: 'Private AI chat',
              body: 'Keep sensitive work on the device with Local Mode across Desktop, Mobile, and CLI.',
              href: '/local',
            },
            {
              meta: 'Developers',
              title: 'AI coding agent',
              body: 'Sessions, code review, sandboxed execution, hooks, and MCP in the terminal and IDE.',
              href: '/agi-code',
            },
            {
              meta: 'Research',
              title: 'Reports with sources',
              body: 'Deep research flows that cite what they read.',
              href: '/features/deep-research',
            },
            {
              meta: 'Procurement',
              title: 'Enterprise rollout',
              body: 'SSO, audit, retention, and BYOK enforcement scoped by contract.',
              href: '/enterprise',
            },
            {
              meta: 'Roles',
              title: 'Use cases',
              body: 'Pages for startups, consultants, sales teams, and IT providers.',
              href: '/use-cases',
            },
          ]}
        />

        <FinalCta
          eyebrow={LAUNCH.publicLabel}
          title="Pick a door. The workspace is the same inside."
          body="Whichever page brings you in, you land in one product with visible routes, your choice of providers, and a managed cloud in public alpha, open by default."
          ctas={[
            { href: '/download', label: 'Get notified' },
            { href: '/use-cases', label: 'Browse Use Cases' },
            { label: 'Team & Enterprise access', waitlist: true },
          ]}
          stamp={`Public launch · ${LAUNCH.date}`}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
