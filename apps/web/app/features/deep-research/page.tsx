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
    'AGI Deep Research plans, searches, reads, cites, and produces structured reports using web, files, projects, and connected data sources.',
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
          lede="ChatGPT and Claude both make research a core workflow. AGI needs the same expectation: multi-step plans, web search, connector search, source panels, citations, and report artifacts across whichever model the user chooses."
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
          title="The page should sell the whole research loop."
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
              body: 'Long research needs cancel, background completion, notifications, and preserved partial results.',
            },
          ]}
        />

        <LedgerSection
          eyebrow="Ad promise"
          title="How to frame research in campaigns."
          rows={[
            {
              k: 'Audience',
              v: 'Consultants, founders, analysts, students, lawyers, sales teams, and operators who need cited work products.',
            },
            {
              k: 'Offer',
              v: 'Research with sources, files, tools, and editable report artifacts across Local, BYOK, and Cloud invite modes.',
            },
            {
              k: 'Differentiator',
              v: 'Model choice: use OpenAI, Claude, Gemini, Perplexity, local models, or other providers from one AGI workflow.',
            },
            {
              k: 'Caution',
              v: 'Do not imply local-only models can browse the web or access connectors unless those tools are explicitly enabled and routed.',
            },
          ]}
        />

        <LaunchCta
          title="Deep research is a buying trigger."
          body="Use this page for ads aimed at strategy, diligence, reports, market maps, and internal knowledge synthesis."
          primary={{ href: '/download', label: LAUNCH.ctaLabel }}
          secondary={{ href: '/use-cases/consulting', label: 'Consulting use case' }}
        />
        <MarketingFooter />
      </main>
    </div>
  );
}
