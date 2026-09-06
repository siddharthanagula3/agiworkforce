import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Section,
  Stack,
  Bento,
} from '@/features/marketing/components/system';
import type { ReactNode } from 'react';
import { WebWindow, EditorWindow } from '@/features/marketing/components/DeviceMockups';
import {
  AgentRunWindow,
  ConsoleWindow,
  ProjectWindow,
} from '@/features/marketing/components/FeatureScenes';

export const metadata = buildMetadata({
  title: 'Solutions: AI workflows for teams, developers, and operators',
  description:
    'Explore AGI solution pages for business teams, developers, startups, consultants, sales teams, IT service providers, and enterprise buyers.',
  path: '/solutions',
});

const IDS = {
  hero: 'agi-solutions-title',
  map: 'agi-solutions-map-title',
  close: 'agi-solutions-close-title',
} as const;

const ROUTES = [
  {
    meta: 'You write code',
    title: 'AGI Code',
    body: 'The agi binary and the VS Code extension that spawns it over stdio: ranked review findings, a session diff landed as a git patch, and commands run under the OS sandbox.',
    href: '/agi-code',
  },
  {
    meta: 'You want a deliverable',
    title: 'AGI Work',
    body: 'A mode of the web composer that returns a plan before its first tool call, holds the run whenever a call needs your approval, and keeps every run in your task list.',
    href: '/agi-work',
  },
  {
    meta: 'You sign the invoice',
    title: 'AGI for Business',
    body: 'The cost side of a rollout: which route we bill for, what hosted capacity buys, and how a single run is capped in dollars before it starts.',
    href: '/business',
  },
  {
    meta: 'You know your role',
    title: 'Use cases',
    body: 'Role pages for startups, consulting firms, IT service providers, and sales teams, each starting from the job rather than the surface.',
    href: '/use-cases',
  },
] as const;

const SOLUTION_VISUALS: Record<string, ReactNode> = {
  'AGI Code': <EditorWindow />,
  'AGI Work': <AgentRunWindow />,
  'AGI for Business': <ConsoleWindow view="policy" />,
  'Use cases': <ProjectWindow />,
};

const MAP_FACTS = [
  'the same chat',
  'the same projects',
  'the same connectors',
  'the same approval prompts',
] as const;

export default function SolutionsPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <section className="agi-lp-hero" aria-labelledby={IDS.hero}>
          <div className="agi-ds-container agi-lp-hero-grid">
            <div className="agi-lp-hero-copy">
              <p className="agi-lp-eyebrow">Solutions</p>
              <h1 className="agi-lp-h1" id={IDS.hero}>
                <span className="agi-lp-line">Every page below</span>
                <em className="agi-lp-accent">is a different way into the same workspace.</em>
              </h1>
              <p className="agi-lp-lede">
                This page is an index and argues nothing on its own. Each entry names the job its
                page was written for, and behind all of them sits one workspace.
              </p>
              <ButtonRow>
                <Button href="/download">See what&rsquo;s live</Button>
              </ButtonRow>
            </div>
            <div className="agi-lp-hero-stage">
              <WebWindow />
            </div>
          </div>
        </section>

        <Section id="solutions-map" labelledBy={IDS.map} rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Where to start</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.map}>
                Each of these pages was written for someone doing a different job.
              </h2>
            </div>
            <Bento
              label="Solution pages"
              tiles={ROUTES.map((route) => ({
                title: route.title,
                body: route.body,
                href: route.href,
                eyebrow: route.meta,
                visual: SOLUTION_VISUALS[route.title],
              }))}
            />
          </Stack>
        </Section>

        <div className="agi-lp-factline">
          <div className="agi-ds-container">
            <p className="agi-lp-eyebrow" style={{ marginBottom: '0.75rem' }}>
              Before you pick
            </p>
            <ul className="agi-lp-factline-list">
              {MAP_FACTS.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          </div>
        </div>

        <section className="agi-lp-close" aria-labelledby={IDS.close}>
          <div className="agi-ds-container">
            <div className="agi-lp-close-inner">
              <h2 className="agi-lp-h2" id={IDS.close}>
                Cost and privacy are each argued once,{' '}
                <em className="agi-lp-accent">on the page that owns the claim.</em>
              </h2>
              <p className="agi-lp-lede">
                The map sorts pages by the person doing the work, and stops there. What a route
                costs, and what a Local session is allowed to do, are settled in one place each.
              </p>
              <ButtonRow>
                <Button href="/pricing">See what each route costs</Button>
                <Button href="/local" variant="secondary">
                  Read how Local mode works
                </Button>
              </ButtonRow>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
