import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { FeatureGrid, RouteMap } from '../../components/marketing/LandingSections';
import { FinalCta, FlagshipHero } from '../../components/marketing/FlagshipSections';
import { LAUNCH } from '../../lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'AGI Use Cases: Startups, consultants, sales, and IT providers',
  description:
    'Use AGI across startup building, consulting, IT service delivery, sales teams, research, coding, and business automation.',
  path: '/use-cases',
});

export default function UseCasesPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <FlagshipHero
          eyebrow="Use cases"
          titleLines={['Built for the way', 'you already work.']}
          em="you already work."
          lede="AGI is a routeable AI workspace for people with real constraints: private local work, provider choice through your own keys on Desktop and CLI, and managed cloud, open in public alpha, when you're ready to scale."
          ctas={[
            { href: '/download', label: 'Get notified' },
            { href: '/solutions', label: 'See the Solutions Map' },
            { label: 'Team & Enterprise access', waitlist: true },
          ]}
          modeRibbon={['Local · on-device', 'BYOK · your keys', 'Cloud · public alpha']}
        />

        <RouteMap
          eyebrow="Role pages"
          title="Pick the path that matches your work."
          routes={[
            {
              meta: 'Founders',
              title: 'Startups',
              body: 'Move fast on Local and BYOK without committing to managed spend.',
              href: '/use-cases/startups',
            },
            {
              meta: 'Advisory',
              title: 'Consulting firms',
              body: 'Research, analysis, decks, and client deliverables across providers.',
              href: '/use-cases/consulting',
            },
            {
              meta: 'Services',
              title: 'IT service providers',
              body: 'Support client environments with local privacy, explicit BYOK, and desktop workflows.',
              href: '/use-cases/it-providers',
            },
            {
              meta: 'Revenue',
              title: 'Sales teams',
              body: 'Research accounts, summarize calls, draft outreach, and connect work apps.',
              href: '/use-cases/sales-teams',
            },
          ]}
        />

        <FeatureGrid
          eyebrow="Shared workflow"
          title="Every role rides the same product spine."
          items={[
            {
              meta: 'Composer',
              title: 'One chat for files, tools, models, and artifacts',
              body: 'Files, artifacts, and tool calls live in the same thread. No second product to learn.',
            },
            {
              meta: 'Routing',
              title: 'Provider choice by task',
              body: 'Switch providers when the work changes: long context, coding, search, speed, privacy, or cost.',
              href: '/providers',
            },
            {
              meta: 'Context',
              title: 'Projects and memory',
              body: 'Recurring work lives in projects with inspectable memory instead of scattered chat history.',
              href: '/features/projects',
            },
            {
              meta: 'Output',
              title: 'Artifacts',
              body: 'Reports, dashboards, documents, and prototypes stay durable and editable.',
              href: '/features/artifacts',
            },
            {
              meta: 'Tools',
              title: 'Apps and connectors',
              body: 'Connect work systems through explicit permissions and visible trust boundaries.',
              href: '/apps',
            },
            {
              meta: 'Scale',
              title: 'Managed cloud',
              body: 'Managed compute is in public alpha — sign in and start, no waitlist. Local and BYOK stay available too.',
            },
          ]}
        />

        <FinalCta
          eyebrow={LAUNCH.publicLabel}
          title="Start with your job, not our feature list."
          body="Each use-case page gives you the shortest path from a real problem to the AGI surface you should try first."
          ctas={[
            { href: '/download', label: 'Get notified' },
            { href: '/business', label: 'See AGI for Business' },
            { label: 'Team & Enterprise access', waitlist: true },
          ]}
          stamp={`Public launch · ${LAUNCH.date}`}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
