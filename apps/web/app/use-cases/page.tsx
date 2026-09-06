import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Prose,
  Section,
  Stack,
  Bento,
} from '@/features/marketing/components/system';
import type { ReactNode } from 'react';
import { WebWindow, TerminalWindow } from '@/features/marketing/components/DeviceMockups';
import {
  AgentRunWindow,
  ProjectWindow,
  ResearchWindow,
} from '@/features/marketing/components/FeatureScenes';
import { USE_CASE_CONTENT } from '@/features/marketing/components/pages/business/use-cases-content';

export const metadata = buildMetadata({
  title: 'Use cases: startups, consultants, sales, and IT providers',
  description:
    'Use AGI across startup building, consulting, IT service delivery, sales teams, research, coding, and business automation.',
  path: '/use-cases',
});

const INDEX_ORDER = ['startups', 'consulting', 'it-providers', 'sales-teams'] as const;

const USE_CASE_VISUALS: Record<(typeof INDEX_ORDER)[number], ReactNode> = {
  startups: <TerminalWindow />,
  consulting: <ProjectWindow />,
  'it-providers': <AgentRunWindow />,
  'sales-teams': <ResearchWindow />,
};

const IDS = {
  hero: 'agi-usecases-title',
  index: 'agi-usecases-index-title',
  cost: 'agi-usecases-cost-title',
} as const;

export default function UseCasesPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <section className="agi-lp-hero" aria-labelledby={IDS.hero}>
          <div className="agi-ds-container agi-lp-hero-grid">
            <div className="agi-lp-hero-copy">
              <p className="agi-lp-eyebrow">Use cases</p>
              <h1 className="agi-lp-h1" id={IDS.hero}>
                <span className="agi-lp-line">One page per job,</span>
                <em className="agi-lp-accent">each shows that job running.</em>
              </h1>
              <p className="agi-lp-lede">
                A founder automating CI, a partner drafting a deliverable, an engineer running a
                client runbook, and a rep prepping a deal each reach for a different surface first.
                The four pages below take one of those apiece.
              </p>
              <ButtonRow>
                <Button href="/download">See what&rsquo;s live</Button>
                <Button href="/solutions" variant="secondary">
                  See the solutions map
                </Button>
              </ButtonRow>
            </div>
            <div className="agi-lp-hero-stage">
              <WebWindow />
            </div>
          </div>
        </section>

        <Section id="usecases-index" labelledBy={IDS.index} rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>The pages</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.index}>
                Each page opens on the surface its team actually works in.
              </h2>
              <Prose>
                Underneath they are the same product, with the same projects, connectors and
                routing, so what changes between them is where the work starts.
              </Prose>
            </div>
            <Bento
              label="Use case pages"
              tiles={INDEX_ORDER.map((slug) => {
                const entry = USE_CASE_CONTENT[slug];
                if (!entry) throw new Error(`missing use case content for slug: ${slug}`);
                const label = entry.eyebrow.replace('Use case · ', '');
                return {
                  title: entry.title,
                  body: entry.lede,
                  href: `/use-cases/${entry.slug}`,
                  eyebrow: label,
                  visual: USE_CASE_VISUALS[slug],
                };
              })}
            />
          </Stack>
        </Section>

        <div className="agi-lp-factline">
          <div className="agi-ds-container">
            <ul className="agi-lp-factline-list">
              <li>Local runs on hardware you already own, free</li>
              <li>BYOK bills you at your provider&rsquo;s published rates</li>
              <li>managed cloud capacity is the part that carries a price</li>
            </ul>
          </div>
        </div>

        <section className="agi-lp-close" aria-labelledby={IDS.cost}>
          <div className="agi-ds-container">
            <div className="agi-lp-close-inner">
              <h2 className="agi-lp-h2" id={IDS.cost}>
                Every team can start <em className="agi-lp-accent">without paying us.</em>
              </h2>
              <p className="agi-lp-lede">
                Local and BYOK stay free on our side for as long as you use them. The pricing page
                is where managed-cloud plans are written down.
              </p>
              <ButtonRow>
                <Button href="/pricing">See plans</Button>
              </ButtonRow>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
