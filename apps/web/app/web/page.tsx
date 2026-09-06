import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Bento,
  CtaPanel,
  Eyebrow,
  Section,
  Stack,
  StatBand,
  SurfaceStatus,
} from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { WebWindow } from '@/features/marketing/components/DeviceMockups';
import {
  AgentRunWindow,
  ArtifactsWindow,
  MemoryWindow,
  ProjectWindow,
  ResearchWindow,
} from '@/features/marketing/components/FeatureScenes';
import { BYOK_PROVIDER_IDS } from '@/app/byok/byok-providers';
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
  close: 'agi-web-close-title',
} as const;

export default function WebSurfacePage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id={IDS.hero}
          eyebrow="AGI Web"
          title="The whole workspace, zero install."
          lede="Chat in the browser with every admitted model behind one selector. Projects, artifacts, memory, deep research and agents open from the same composer, and the reply names the route that served it."
          ctas={[
            { href: WEB_ENTRY_HREF, label: 'Try AGI Web' },
            { href: '/features', label: 'See every feature', variant: 'secondary' },
          ]}
          visual={<WebWindow />}
        />

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
              { value: approximateCount(BYOK_PROVIDER_IDS.length), label: 'providers on your key' },
              { value: '3', label: 'routes: Local, BYOK, Cloud' },
              { value: '1', label: 'account across six surfaces' },
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
                Everything a chat opens into.
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

        <Section id="close" labelledBy={IDS.close} rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Start</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.close}>
                Open it in a tab, or take it with you.
              </h2>
            </div>
            <CtaPanel
              label="Ways to start"
              cards={[
                {
                  title: 'In the browser',
                  body: 'Free to try. Every admitted model, projects, memory, artifacts and research from the first message.',
                  points: [
                    'Auto picks the model per message, or you pin one',
                    'A served-by receipt under every reply',
                    'Share links and account management included',
                  ],
                  cta: { href: WEB_ENTRY_HREF, label: 'Try AGI Web' },
                },
                {
                  title: 'On your machine',
                  body: 'Desktop adds local models, encrypted keys, connectors and scheduled work on the same account.',
                  points: [
                    'Local runs never leave your hardware',
                    'Bring your own provider keys',
                    'The CLI and editor share the same sessions',
                  ],
                  cta: { href: '/download', label: 'Get AGI Desktop' },
                },
              ]}
            />
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
