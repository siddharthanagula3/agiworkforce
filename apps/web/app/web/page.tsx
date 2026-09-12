import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Bento,
  Eyebrow,
  Section,
  Stack,
  StatBand,
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
import { approximateCount, MARKETING, SURFACE_STATUS } from '@/lib/marketing-constants';
import { WEB_ENTRY_HREF } from '@/features/marketing/components/system/nav';

export const metadata = buildMetadata({
  title: 'AGI Web: the workspace in your browser',
  description:
    'Chat, projects, artifacts, memory, deep research and agents in the browser, with every admitted model behind one selector and the route named on every reply.',
  path: '/web',
});

const IDS = {
  hero: 'agi-web-title',
  numbers: 'agi-web-numbers-title',
  status: 'agi-web-status-title',
  inside: 'agi-web-inside-title',
} as const;

export default function WebSurfacePage() {
  return (
    <div data-design="agi">
      <main className="agi-shell agi-surface">
        <Header />

        <section className="agi-fl-hero" aria-labelledby={IDS.hero}>
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <div className="agi-fl-hero-split">
            <div className="agi-fl-hero-copy">
              <p className="agi-fl-eyebrow">AGI Web · {SURFACE_STATUS.web}</p>
              <h1 id={IDS.hero} className="agi-fl-h1">
                <span className="agi-fl-h1-line">The whole workspace,</span>{' '}
                <span className="agi-fl-h1-line">
                  <em className="agi-fl-h1-em">zero install.</em>
                </span>
              </h1>
              <p className="agi-fl-lede">
                Chat in the browser with every admitted model behind one selector. Projects,
                artifacts, memory, deep research and agents open from the same composer, and each
                reply names the model that answered it in its actions menu.
              </p>
              <div className="agi-fl-cta-row">
                <Link href={WEB_ENTRY_HREF} className="agi-fl-cta agi-fl-cta--primary">
                  Try AGI Web
                </Link>
                <Link href="/features" className="agi-fl-cta agi-fl-cta--secondary">
                  See every feature
                </Link>
              </div>
              <ul className="agi-fl-mode-ribbon" aria-label="Trust modes">
                <li>Cloud · public alpha</li>
                <li>Auto · route per message</li>
                <li>Receipt · when Auto leaves your pin</li>
              </ul>
            </div>
            <div className="agi-fl-hero-visual agi-fl-hero-frame--main" aria-hidden="true">
              <WebWindow />
            </div>
          </div>
        </section>

        <Section id="numbers" labelledBy={IDS.numbers} size="sm" rule>
          <h2 className="sr-only" id={IDS.numbers}>
            AGI Web in numbers
          </h2>
          <StatBand
            label="AGI Web in numbers"
            stats={[
              {
                value: approximateCount(MARKETING.models.count),
                label: 'models behind one selector',
              },
              {
                value: approximateCount(MARKETING.providers.count),
                label: 'providers in the catalog',
              },
              { value: '1', label: 'route: AGI managed cloud' },
              { value: '3', label: 'surfaces released: Web, Desktop, CLI' },
            ]}
          />
        </Section>

        <Section id="status" labelledBy={IDS.status} rule>
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
                  title: 'Instructions and files that follow every prompt',
                  body: 'A project rebuilds its own context into each request.',
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
          body="Free to try in the browser. Every reply names the model that answered in its actions menu, and prints a receipt line under itself whenever Auto left the model you pinned. Desktop adds local models, encrypted keys, connectors and scheduled work on the same account."
          ctas={[
            { href: WEB_ENTRY_HREF, label: 'Try AGI Web' },
            { href: '/download', label: 'Get AGI Desktop' },
            { href: '/pricing', label: 'See pricing' },
          ]}
          stamp={SURFACE_STATUS.web}
        />
      </main>
      <MarketingFooter />
    </div>
  );
}
