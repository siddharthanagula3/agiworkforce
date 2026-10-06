import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Bento,
  Eyebrow,
  Prose,
  Section,
  Stack,
  SurfaceStatus,
} from '@/features/marketing/components/system';
import { FinalCta } from '@/features/marketing/components/SurfaceSections';
import { WebWindow } from '@/features/marketing/components/DeviceMockups';
import {
  AgentRunWindow,
  ArtifactsWindow,
  MemoryWindow,
  ProjectWindow,
  ResearchWindow,
} from '@/features/marketing/components/FeatureScenes';
import { CLI_AVAILABILITY_NOTE, SURFACE_STATUS, surfaceCta } from '@/lib/marketing-constants';
import { MANAGED_CLOUD_STATUS } from '@/lib/legal-constants';
import { WEB_ENTRY_HREF } from '@/features/marketing/components/system/nav';

export const metadata = buildMetadata({
  title: 'AGI Web: the workspace in your browser',
  description:
    'Chat, projects, artifacts, memory, deep research and agents in the browser, with every admitted model behind one selector and the route named on every reply.',
  path: '/web',
});

const DESKTOP_CTA = surfaceCta('desktop');
const FINAL_CTA_BODY = [
  'Free to try in the browser. Every reply names the model that answered in its actions menu, and prints a receipt line under itself whenever Auto left the model you pinned. Desktop adds approved folders, computer use, connectors and scheduled work on the same managed-cloud account; Local and BYOK run in the CLI.',
  CLI_AVAILABILITY_NOTE,
]
  .filter(Boolean)
  .join(' ');

const IDS = {
  hero: 'agi-web-title',
  status: 'agi-web-status-title',
  inside: 'agi-web-inside-title',
} as const;

export default function WebSurfacePage() {
  return (
    <div data-design="agi">
      <Header />
      <main id="main-content" tabIndex={-1} className="agi-shell agi-surface">
        <section className="agi-fl-hero" aria-labelledby={IDS.hero}>
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <div className="agi-fl-hero-split">
            <div className="agi-fl-hero-copy">
              <div className="agi-fl-eyebrow">AGI Web · {SURFACE_STATUS.web}</div>
              <h1 id={IDS.hero} className="sr-only">
                AGI Web
              </h1>
              <div className="agi-fl-cta-row">
                <Link href={WEB_ENTRY_HREF} className="agi-fl-cta agi-fl-cta--primary">
                  Try AGI Web
                </Link>
                <Link href="/features" className="agi-fl-cta agi-fl-cta--secondary">
                  See every feature
                </Link>
              </div>
            </div>
            <div className="agi-fl-hero-visual agi-fl-hero-frame--main">
              <WebWindow />
            </div>
          </div>
        </section>

        <Section id="status" labelledBy={IDS.status}>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id={IDS.status}>
              What is live today.
            </h2>
            <SurfaceStatus
              state="live"
              name="AGI Web"
              detail={`${SURFACE_STATUS.web}. Hosted chat with projects, artifacts, cited research, memory and account management, in any modern browser.`}
              action={{ label: 'Open AGI Web', href: WEB_ENTRY_HREF }}
            />
            <Prose size="sm">
              AGI Web uses managed cloud ({MANAGED_CLOUD_STATUS}). Choose a model; each reply names
              the model that answered it in its actions menu. Auto shows an inline receipt when it
              changes your pinned model.
            </Prose>
          </Stack>
        </Section>

        <Section id="inside" labelledBy={IDS.inside} rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>Inside</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.inside}>
                Everything a chat <em className="agi-ds-accent">opens into.</em>
              </h2>
            </div>
            <Bento
              label="What AGI Web includes"
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
                  title: 'A source behind every claim',
                  body: 'Searches you approve, then a report with numbered citations.',
                  href: '/features/deep-research',
                  visual: <ResearchWindow />,
                },
                {
                  eyebrow: 'Agents',
                  title: 'Delegation with approval as the default',
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
            { href: WEB_ENTRY_HREF, label: 'Try AGI Web' },
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
