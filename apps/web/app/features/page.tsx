import Link from 'next/link';
import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  CtaPanel,
  Eyebrow,
  Prose,
  ScrollFeatures,
  Section,
  Stack,
  type ScrollFeature,
} from '@/features/marketing/components/system';
import { WebWindow } from '@/features/marketing/components/DeviceMockups';
import {
  AgentRunWindow,
  ArtifactsWindow,
  MemoryWindow,
  ProjectWindow,
  ResearchWindow,
} from '@/features/marketing/components/FeatureScenes';

export const metadata = buildMetadata({
  title: 'Features: chat, artifacts, projects, tools, memory, and research',
  description:
    'Everything inside the AGI workspace: chat, artifacts, projects, tools and connectors, memory, deep research, agents, plugins, and skills. Across every surface and trust mode.',
  path: '/features',
});

const IDS = {
  hero: 'agi-features-hero-title',
  loop: 'agi-features-loop-title',
  extend: 'agi-features-extend-title',
  close: 'agi-features-close-title',
} as const;

const FEATURES: readonly ScrollFeature[] = [
  {
    id: 'feature-ai-chat',
    eyebrow: 'AI chat',
    title: 'One composer. Every model. A reply that shows its work.',
    body: 'Attachments, dictation, web search and slash commands go in; the tools it called, the sources it read and the route that served it come back with the answer.',
    points: [
      'Auto picks the model per message, or you pin one',
      'Search, code and files as tool rows you can open',
    ],
    visual: <WebWindow />,
  },
  {
    id: 'feature-artifacts',
    eyebrow: 'Artifacts',
    title: 'Substantial output leaves the message stream.',
    body: 'Documents, code and diagrams open in a versioned panel beside the chat, with the render on one tab and the source on the other.',
    points: ['Every version kept, any version restored', 'Copy, download, or open in the Library'],
    visual: <ArtifactsWindow />,
  },
  {
    id: 'feature-projects',
    eyebrow: 'Projects',
    title: 'A project rebuilds its own context into every prompt.',
    body: 'Standing instructions, files and the threads you already ran are reassembled into the system message for each request, ranked against the question you asked.',
    points: ['Instructions and files follow every thread', 'Local and Cloud allowed per project'],
    visual: <ProjectWindow />,
  },
  {
    id: 'feature-memory',
    eyebrow: 'Memory',
    title: 'Every fact AGI keeps is a sentence you can read.',
    body: 'Short sentences written by you, a finished chat or an import, with the source beside each one and the whole list under your control.',
    points: ['Search, rewrite or delete any line', 'Stays on the device in Local mode'],
    visual: <MemoryWindow />,
  },
  {
    id: 'feature-deep-research',
    eyebrow: 'Deep research',
    title: 'Every claim names the source it came from.',
    body: 'The run writes out its searches, waits for you to approve them, then returns a report with a numbered citation behind each factual claim.',
    points: ['Plan approved before anything searches', 'Rejected sources listed with the reason'],
    visual: <ResearchWindow />,
  },
  {
    id: 'feature-agents',
    eyebrow: 'Agents',
    title: 'Delegation only works if the default is no.',
    body: 'An agent reads files, runs commands and calls connectors, and every risky step opens an approval you answer, inside a permission list you set for the run.',
    points: ['Allow once, always, or deny per tool', 'Commands run in an OS sandbox'],
    visual: <AgentRunWindow />,
  },
];

const EXTEND = [
  {
    meta: 'Tools',
    title: 'Tools and connectors',
    body: 'MCP servers and OAuth apps, added one explicit permission at a time, with a default of asking first.',
    href: '/features/tools',
  },
  {
    meta: 'Plugins',
    title: 'Plugins',
    body: 'Commands, agents, skills, hooks, and MCP wiring bundled into one install, gated behind a SHA-256 you pin yourself.',
    href: '/features/plugins',
  },
  {
    meta: 'Skills',
    title: 'Skills',
    body: 'A directory of reusable instruction sets to start a workspace from.',
    href: '/skills',
  },
  {
    meta: 'Integrations',
    title: 'Integrations',
    body: 'MCP plugins, the native messaging bridge, and BYOK provider keys, wired the same way on Desktop, CLI, and VS Code.',
    href: '/integrations',
  },
] as const;

export default function FeaturesPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <section className="agi-lp-hero" aria-labelledby={IDS.hero}>
          <div className="agi-ds-container agi-lp-hero-grid">
            <div className="agi-lp-hero-copy">
              <p className="agi-lp-eyebrow">Features</p>
              <h1 className="agi-lp-h1" id={IDS.hero}>
                Conversation is the front door. This is what sits behind it.
              </h1>
              <p className="agi-lp-lede">
                Projects, artifacts, memory, research, and agents are not separate products: they
                are what a chat can reach into. Every one runs in Local, BYOK, or AGI Cloud, and the
                lane that answered is labelled on the reply.
              </p>
              <ButtonRow>
                <Button href="/login?redirectTo=%2F">Try AGI Web</Button>
                <Button href="/download" variant="secondary">
                  Get the CLI
                </Button>
              </ButtonRow>
            </div>
            <div className="agi-lp-hero-stage">
              <WebWindow />
            </div>
          </div>
        </section>

        <Section id="loop" labelledBy={IDS.loop} rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>The daily loop</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.loop}>
                Chat, and the things a chat opens into.
              </h2>
            </div>
            <ScrollFeatures features={FEATURES} label="Six things a chat opens into" />
          </Stack>
        </Section>

        <Section id="extend" labelledBy={IDS.extend} rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>Extend</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.extend}>
                Bring your own tools in.
              </h2>
            </div>
            <div className="agi-ds-grid-2">
              {EXTEND.map((item) => (
                <div className="agi-ds-card" key={item.title}>
                  <Eyebrow>{item.meta}</Eyebrow>
                  <h3 className="agi-ds-h3">{item.title}</h3>
                  <Prose size="sm">{item.body}</Prose>
                  <Link href={item.href} className="agi-ds-link">
                    Read more
                  </Link>
                </div>
              ))}
            </div>
          </Stack>
        </Section>

        <Section id="close" labelledBy={IDS.close} rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Three routes, one workspace</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.close}>
                Pick where the request runs, then use all of this.
              </h2>
            </div>
            <CtaPanel
              label="Ways to start"
              cards={[
                {
                  title: 'Start on your own',
                  body: 'AGI Web is free to try in the browser. Local and BYOK need no account at all.',
                  points: [
                    'Every admitted model behind one selector',
                    'Projects, memory, artifacts and research from the first day',
                    'A served-by receipt under every reply',
                  ],
                  cta: { href: '/login?redirectTo=%2F', label: 'Try AGI Web' },
                },
                {
                  title: 'Bring your team',
                  body: 'Seats, roles and a console that decides where work is allowed to run.',
                  points: [
                    'SSO and directory provisioning on the enterprise contract',
                    'Audit export you can read line by line',
                    'Local and BYOK keep data on your hardware or your contract',
                  ],
                  cta: { href: '/contact-sales', label: 'Contact sales' },
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
