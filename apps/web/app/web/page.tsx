import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { billingPlanCapabilityPlanLabels } from '@agiworkforce/types';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Bento, Eyebrow, Section, Stack } from '@/features/marketing/components/system';
import { FinalCta } from '@/features/marketing/components/SurfaceSections';
import {
  AgentRunWindow,
  ArtifactsWindow,
  MemoryWindow,
  ProjectWindow,
  ResearchWindow,
} from '@/features/marketing/components/FeatureScenes';
import {
  ArtifactScenePreview,
  ResearchAskPreview,
  ResearchPlanStepPreview,
  ResearchReportPreview,
  WebProofPreview,
} from '@/features/marketing/components/app-preview/ScenePreviews';
import { CLI_AVAILABILITY_NOTE, SURFACE_STATUS, surfaceCta } from '@/lib/marketing-constants';
import { MANAGED_CLOUD_STATUS } from '@/lib/legal-constants';
import { WEB_ENTRY_HREF } from '@/features/marketing/components/system/nav';

export const metadata = buildMetadata({
  title: 'AGI Chat: the workspace in your browser',
  description:
    'Chat, projects, artifacts, memory, deep research and agents in the browser, with every admitted model behind one selector. Every reply names the model that answered in its actions menu.',
  path: '/web',
});

const DESKTOP_CTA = surfaceCta('desktop');
const RESEARCH_PLANS = billingPlanCapabilityPlanLabels('deep_research');
const FINAL_CTA_BODY = [
  `Free to try in the browser. AGI Chat uses managed cloud (${MANAGED_CLOUD_STATUS}).`,
  'Desktop adds approved folders, computer use and scheduled work on the same managed-cloud account; Local and BYOK run in the CLI.',
  CLI_AVAILABILITY_NOTE,
]
  .filter(Boolean)
  .join(' ');

const PROOF_NOTES = [
  'What a reply makes opens as an artifact, in a panel beside the chat with its version history.',
  'Each reply names the model that answered it in its actions menu.',
  'Leave the model on Auto, or pick one. On Auto a chat keeps the model it started on, and when Auto moves it to another, that reply shows a receipt line.',
] as const;

const RESEARCH_STEPS: ReadonlyArray<{ title: string; body: string; visual: ReactNode }> = [
  {
    title: 'Ask',
    body: 'Ask in plain words with Deep Research on. Choose Auto or a model with research support.',
    visual: <ResearchAskPreview />,
  },
  {
    title: 'Approve',
    body: 'Review the plan. Edit, add or remove a step, then choose Start research. Only the searches on the plan you approved run.',
    visual: <ResearchPlanStepPreview />,
  },
  {
    title: 'Read',
    body: 'The model is asked to cite each factual claim with a numbered source. Open Sources to check them.',
    visual: <ResearchReportPreview />,
  },
];

const IDS = {
  hero: 'agi-web-title',
  proof: 'agi-web-proof-title',
  steps: 'agi-web-steps-title',
  inside: 'agi-web-inside-title',
} as const;

export default function WebSurfacePage() {
  return (
    <div data-design="agi" data-public-reference="web">
      <Header />
      <main id="main-content" tabIndex={-1} className="agi-shell agi-surface">
        <section className="agi-fl-hero" aria-labelledby={IDS.hero}>
          <div className="agi-fl-hero-split">
            <div className="agi-fl-hero-copy">
              <div className="agi-fl-web-bar">
                <h1 id={IDS.hero} className="agi-fl-web-title">
                  AGI Chat
                </h1>
                <span className="agi-fl-web-status">
                  <span className="agi-fl-web-status-dot" aria-hidden="true" />
                  {SURFACE_STATUS.web}
                </span>
              </div>
              <div className="agi-fl-cta-row">
                <Link href={WEB_ENTRY_HREF} className="agi-fl-cta agi-fl-cta--primary">
                  Try AGI Chat
                </Link>
                <Link href="/features" className="agi-fl-cta agi-fl-cta--secondary">
                  See every feature
                </Link>
              </div>
            </div>
            <div className="agi-fl-hero-visual agi-fl-hero-frame--main">
              <ArtifactScenePreview example="checklist" />
            </div>
          </div>
        </section>

        <section className="agi-fl-web-section" aria-labelledby={IDS.proof}>
          <div className="agi-fl-web-proof">
            <div className="agi-fl-web-proof-notes">
              <h2 id={IDS.proof} className="agi-fl-web-h2">
                From a request to a page you can share
              </h2>
              <ol className="agi-fl-web-notes">
                {PROOF_NOTES.map((note, index) => (
                  <li key={note}>
                    <span className="agi-fl-web-num" aria-hidden="true">
                      {index + 1}
                    </span>
                    <span>{note}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="agi-fl-web-proof-visual">
              <WebProofPreview />
              <p className="agi-fl-web-caption">Illustrative example</p>
            </div>
          </div>
        </section>

        <section className="agi-fl-web-section" aria-labelledby={IDS.steps}>
          <h2 id={IDS.steps} className="agi-fl-web-h2">
            Ask, approve the plan, read the report
          </h2>
          <ol className="agi-fl-web-steps">
            {RESEARCH_STEPS.map((step, index) => (
              <li key={step.title} className="agi-fl-web-step">
                <span className="agi-fl-web-step-title">
                  <span className="agi-fl-web-num" aria-hidden="true">
                    {index + 1}
                  </span>
                  {step.title}
                </span>
                {step.visual}
                <p className="agi-fl-web-step-body">{step.body}</p>
              </li>
            ))}
          </ol>
          <p className="agi-fl-web-caption">
            Illustrative example. Deep Research is included on {RESEARCH_PLANS} plans.
          </p>
        </section>

        <Section id="inside" labelledBy={IDS.inside} rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>Inside</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.inside}>
                Everything a chat opens into.
              </h2>
            </div>
            <Bento
              label="What AGI Chat includes"
              tiles={[
                {
                  eyebrow: 'Artifacts',
                  title: 'Substantial output leaves the message stream',
                  body: 'Documents, code and diagrams in a versioned panel beside the chat.',
                  href: '/features/artifacts',
                  visual: <ArtifactsWindow />,
                },
                {
                  eyebrow: 'Projects',
                  title: 'Project instructions and selected references',
                  body: 'Keep instructions and reference material with a project.',
                  href: '/features/projects',
                  visual: <ProjectWindow />,
                },
                {
                  eyebrow: 'Deep research',
                  title: 'Reports with numbered sources',
                  body: 'Searches you approve, then a report with numbered citations.',
                  href: '/features/deep-research',
                  visual: <ResearchWindow />,
                },
                {
                  eyebrow: 'Agents',
                  title: 'Delegated work that stops to ask',
                  body: 'Risky steps stop for you inside a permission list you set.',
                  href: '/features/agents',
                  visual: <AgentRunWindow />,
                },
                {
                  eyebrow: 'Memory',
                  title: 'Facts you can read and delete',
                  body: 'Plain sentences with their source beside each one.',
                  href: '/features/memory',
                  visual: <MemoryWindow />,
                  span: 2,
                },
              ]}
            />
          </Stack>
        </Section>

        <FinalCta
          eyebrow="Start"
          title="Open it in a tab, or take it with you."
          body={FINAL_CTA_BODY}
          ctas={[
            { href: WEB_ENTRY_HREF, label: 'Try AGI Chat' },
            { href: DESKTOP_CTA.href, label: DESKTOP_CTA.label },
            { href: '/pricing', label: 'See pricing' },
          ]}
          stamp={SURFACE_STATUS.web}
        />
      </main>
      <MarketingFooter />
    </div>
  );
}
