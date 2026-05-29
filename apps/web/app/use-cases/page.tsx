import type { Metadata } from 'next';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import {
  CampaignHero,
  FeatureGrid,
  LaunchCta,
  RouteMap,
} from '../../components/marketing/LandingSections';
import { LAUNCH } from '../../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'AGI Use Cases - Startups, consultants, sales, and IT providers',
  description:
    'Use AGI across startup building, consulting, IT service delivery, sales teams, research, coding, and business automation.',
  alternates: { canonical: 'https://agiworkforce.com/use-cases' },
};

export default function UseCasesPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <CampaignHero
          eyebrow={`${LAUNCH.publicLabel} · Use cases`}
          title="Use cases for people who already know why AI matters."
          lede="AGI is not a generic chatbot pitch. It is a routeable AI work surface for people who need private local work, BYOK provider choice, and a cloud invite path when they are ready to scale."
          primaryCta={{ href: '/download', label: LAUNCH.ctaLabel }}
          secondaryCta={{ href: '/solutions', label: 'Solutions map' }}
          chips={['Startups', 'Consulting', 'IT providers', 'Sales teams']}
          panelTitle="Use-case routes"
          panelRows={[
            {
              k: 'Startups',
              v: 'Build, research, support, code, and operate with low managed spend',
            },
            {
              k: 'Consulting',
              v: 'Research, reports, client deliverables, and source-backed artifacts',
            },
            {
              k: 'IT providers',
              v: 'Local-first support, documentation, and customer environments',
            },
            { k: 'Sales', v: 'Research, account planning, follow-up, and connected work apps' },
          ]}
        />

        <RouteMap
          eyebrow="Role pages"
          title="Pick the landing page that matches the buyer."
          routes={[
            {
              meta: 'Founders',
              title: 'Startups',
              body: 'Use Local and BYOK to move fast without turning free users into cloud spend.',
              href: '/use-cases/startups',
            },
            {
              meta: 'Advisory',
              title: 'Consulting firms',
              body: 'Research, analysis, decks, deliverables, and client context across providers.',
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
          title="Every use case still needs the same product spine."
          items={[
            {
              meta: 'Composer',
              title: 'One chat for files, tools, models, and artifacts',
              body: 'The user should not switch into a separate chat just because they selected a file or created an artifact.',
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
              body: 'Recurring work should live in projects with inspectable memory instead of scattered chat history.',
              href: '/features/projects',
            },
            {
              meta: 'Output',
              title: 'Artifacts',
              body: 'Make reports, dashboards, documents, and prototypes durable and editable.',
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
              title: 'Cloud by invite',
              body: 'Capture high-intent demand without publicly opening managed compute before controls are ready.',
            },
          ]}
        />

        <LaunchCta
          title="Use-case pages keep ad traffic from bouncing."
          body="Each page gives a specific buyer the shortest path from their problem to the AGI surface they should try first."
          primary={{ href: '/download', label: LAUNCH.ctaLabel }}
          secondary={{ href: '/business', label: 'Business overview' }}
        />
        <MarketingFooter />
      </main>
    </div>
  );
}
