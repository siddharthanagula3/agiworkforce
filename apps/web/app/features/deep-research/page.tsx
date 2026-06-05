import type { Metadata } from 'next';
import { Header } from '../../../components/layout/Header';
import { MarketingFooter } from '../../../components/marketing/MarketingFooter';
import {
  CampaignHero,
  FeatureGrid,
  LaunchCta,
  LedgerSection,
} from '../../../components/marketing/LandingSections';
import { LAUNCH } from '../../../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'AGI Deep Research - Cited reports across web, files, and connectors',
  description:
    'AGI Deep Research combines planning, source collection, citations, and structured reports across web, files, projects, and connected data sources.',
  alternates: { canonical: 'https://agiworkforce.com/features/deep-research' },
};

export default function DeepResearchPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <CampaignHero
          eyebrow={`${LAUNCH.publicLabel} · Deep research`}
          title="Research that shows its sources and keeps the output editable."
          lede="ChatGPT and Claude made research a core workflow. AGI brings the same workflow expectation to multi-step plans, web search, connector search, source panels, citations, and report artifacts across selected model routes."
          primaryCta={{ href: '/download', label: LAUNCH.ctaLabel }}
          secondaryCta={{ href: '/features/artifacts', label: 'Report artifacts' }}
          chips={['Planning', 'Web search', 'Connectors', 'Citations', 'Report artifacts']}
          panelTitle="Research run"
          panelRows={[
            { k: 'Plan', v: 'Break the question into subtopics and evidence needs' },
            { k: 'Gather', v: 'Search live web, project files, and connected apps where enabled' },
            { k: 'Verify', v: 'Track sources, snippets, dates, and confidence' },
            { k: 'Deliver', v: 'Cited answer plus editable report artifact' },
          ]}
        />

        <FeatureGrid
          eyebrow="Research workflow"
          title="One workspace for the whole research loop."
          items={[
            {
              meta: 'Current info',
              title: 'Live web search',
              body: 'Use search when knowledge can be outdated, cite claims inline, and expose the source list for verification.',
            },
            {
              meta: 'Private context',
              title: 'Project and connector search',
              body: 'Search uploaded files and enabled apps with the same permission model as other tools.',
              href: '/apps',
            },
            {
              meta: 'Long run',
              title: 'Visible progress states',
              body: 'Show planning, gathering, reading, synthesizing, and report-generation states so long research feels trustworthy.',
            },
            {
              meta: 'Output',
              title: 'Structured report artifacts',
              body: 'Deliver research as an editable artifact with sections, tables, source links, and export controls.',
              href: '/features/artifacts',
            },
            {
              meta: 'Models',
              title: 'Route by task shape',
              body: 'Use the best provider for long context, source synthesis, coding analysis, or fast drafting without restarting the research.',
            },
            {
              meta: 'Controls',
              title: 'Stop, resume, and notify',
              body: 'Long research runs include cancel, background completion, notifications, and preserved partial results.',
            },
          ]}
        />

        <LedgerSection
          eyebrow="Research promise"
          title="A practical research workflow for daily work."
          rows={[
            {
              k: 'Audience',
              v: 'Consultants, founders, analysts, students, lawyers, sales teams, and operators who need cited work products.',
            },
            {
              k: 'Offer',
              v: 'Research with sources, files, tools, and editable report artifacts across available Local, BYOK, and Cloud invite routes.',
            },
            {
              k: 'Differentiator',
              v: 'Model choice: use OpenAI, Claude, Gemini, Perplexity, local models, or other providers from one AGI workflow.',
            },
            {
              k: 'Boundary',
              v: 'Local-only models browse or access connectors only when those tools are explicitly enabled and routed.',
            },
          ]}
        />

        <LaunchCta
          title="Deep research is a high-frequency workflow."
          body="Strategy, diligence, reports, market maps, and internal knowledge synthesis all need source-backed answers that remain editable."
          primary={{ href: '/download', label: LAUNCH.ctaLabel }}
          secondary={{ href: '/use-cases/consulting', label: 'Consulting use case' }}
        />
        <MarketingFooter />
      </main>
    </div>
  );
}
