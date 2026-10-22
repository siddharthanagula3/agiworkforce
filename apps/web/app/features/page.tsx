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
  WEB_ENTRY_HREF,
  type ScrollFeature,
} from '@/features/marketing/components/system';
import { WebWindow } from '@/features/marketing/components/DeviceMockups';
import { BYOK_SURFACES, CLI_AVAILABILITY_NOTE, surfaceCta } from '@/lib/marketing-constants';
import {
  BILLING_PLAN_CAPABILITY_LABELS,
  CONNECTORS_COMING_SOON_MESSAGE,
  billingPlanCapabilityPlanLabels,
  connectorsReleased,
} from '@agiworkforce/types';
import {
  AgentRunWindow,
  ArtifactsWindow,
  MemoryWindow,
  ProjectWindow,
  ResearchWindow,
} from '@/features/marketing/components/FeatureScenes';

const CONNECTORS_RELEASED = connectorsReleased();
const TOOLS_IN_THE_WORKSPACE = CONNECTORS_RELEASED ? 'tools and connectors' : 'tools';
const CONNECTORS_NOTE = CONNECTORS_RELEASED ? '' : ` ${CONNECTORS_COMING_SOON_MESSAGE}`;

export const metadata = buildMetadata({
  title: 'Features: chat, artifacts, projects, tools, memory, and research',
  description: `What is inside the AGI workspace: chat, artifacts, projects, memory, deep research, agents, image and video generation, voice, ${TOOLS_IN_THE_WORKSPACE}, plugins, and skills.`,
  path: '/features',
});

const CLI_CTA = surfaceCta('cli');
const RESEARCH_PLANS = billingPlanCapabilityPlanLabels('deep_research');
const IMAGE_PLANS = billingPlanCapabilityPlanLabels('image_generation');
const VIDEO_PLANS = billingPlanCapabilityPlanLabels('video_generation');

const IDS = {
  hero: 'agi-features-hero-title',
  loop: 'agi-features-loop-title',
  media: 'agi-features-media-title',
  extend: 'agi-features-extend-title',
  close: 'agi-features-close-title',
} as const;

const FEATURES: readonly ScrollFeature[] = [
  {
    id: 'feature-ai-chat',
    eyebrow: 'AI chat',
    title: 'One composer. The models on your plan. A reply that shows its work.',
    body: 'Attachments, dictation, web search and slash commands go in; the tools it called, the sources it read and the model that answered come back with the answer.',
    points: [
      'Auto picks the model per message, or you pin one',
      'Search, code and files as tool rows you can open',
    ],
    href: '/features/ai-chat',
    linkLabel: 'Learn more about AI chat',
    visual: <WebWindow />,
  },
  {
    id: 'feature-artifacts',
    eyebrow: 'Artifacts',
    title: 'Substantial output leaves the message stream.',
    body: 'Documents, code and diagrams open in a versioned panel beside the chat, with the render on one tab and the source on the other.',
    points: ['Every version kept, any version restored', 'Copy, download, or open in the Library'],
    href: '/features/artifacts',
    linkLabel: 'Learn more about artifacts',
    visual: <ArtifactsWindow />,
  },
  {
    id: 'feature-projects',
    eyebrow: 'Projects',
    title: 'Project instructions, with selected reference material.',
    body: 'Chats in a project can use its saved instructions and selected passages from knowledge files and earlier project chats, within access and context limits.',
    points: ['Saved instructions for a project', 'References selected for the question'],
    href: '/features/projects',
    linkLabel: 'Learn more about projects',
    visual: <ProjectWindow />,
  },
  {
    id: 'feature-memory',
    eyebrow: 'Memory',
    title: 'Every fact AGI keeps is a sentence you can read.',
    body: 'Short sentences written by you, a finished chat or an import, with the source beside each one and the whole list under your control.',
    points: ['Search, rewrite or delete any line', 'A temporary chat never writes to the list'],
    href: '/features/memory',
    linkLabel: 'Learn more about memory',
    visual: <MemoryWindow />,
  },
  {
    id: 'feature-deep-research',
    eyebrow: 'Deep research',
    title: 'A plan you approve, then a report with numbered sources.',
    body: 'The run writes out an editable plan and waits for you to start it, then returns a report in which the model is asked to cite factual claims with numbered sources.',
    points: [
      'Plan approved before web gathering starts',
      'Sources chosen, and sites ruled out, before it runs',
      `Included on ${RESEARCH_PLANS} plans; web search is on every plan`,
    ],
    href: '/features/deep-research',
    linkLabel: 'Learn more about deep research',
    visual: <ResearchWindow />,
  },
  {
    id: 'feature-agents',
    eyebrow: 'Agents',
    title: 'Delegated work that stops to ask.',
    body: `A tool call that needs permission stops at an approval you answer. Agent files, subagents, hooks and the OS sandbox belong to the agi CLI. ${CLI_AVAILABILITY_NOTE} In the browser, the agent mode is ${BILLING_PLAN_CAPABILITY_LABELS.agi_work}.`,
    points: ['Allow once, always, or deny per tool', 'In the CLI, commands run in an OS sandbox'],
    href: '/features/agents',
    linkLabel: 'Learn more about agents',
    visual: <AgentRunWindow />,
  },
];

const MEDIA = [
  {
    meta: 'Images',
    title: 'Image generation',
    body: `Describe a picture in chat, choose its shape and style, then revise the result. Included on ${IMAGE_PLANS} plans.`,
    href: '/features/images',
  },
  {
    meta: 'Video',
    title: 'Video generation',
    body: `Describe a short video, follow its progress while it renders, then play or download it. Included on ${VIDEO_PLANS} plans.`,
    href: '/features/video',
  },
  {
    meta: 'Voice',
    title: 'Voice',
    body: 'Hold a spoken conversation that is added to the chat, or dictate a message into the composer.',
    href: '/features/voice',
  },
] as const;

const EXTEND = [
  {
    meta: 'Tools',
    title: 'Tools and connectors',
    body: `MCP servers and OAuth apps, added one explicit permission at a time, with a default of asking first.${CONNECTORS_NOTE}`,
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
    body: `MCP plugins, the native messaging bridge, and BYOK provider keys in the CLI. ${BYOK_SURFACES.availability}`,
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
              <h1 className="sr-only" id={IDS.hero}>
                Conversation is the front door. This is what sits behind it.
              </h1>
              <ButtonRow>
                <Button href={WEB_ENTRY_HREF}>Try AGI Chat</Button>
                <Button href={CLI_CTA.href} variant="secondary">
                  {CLI_CTA.label}
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
              <Prose>
                These features open from the same composer on a managed-cloud account. Local and
                BYOK are CLI routes.
              </Prose>
            </div>
            <ScrollFeatures features={FEATURES} label="Six things a chat opens into" />
          </Stack>
        </Section>

        <Section id="media" labelledBy={IDS.media} rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Images, video and voice</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.media}>
                Create and speak from the same composer.
              </h2>
            </div>
            <div className="agi-ds-grid-2">
              {MEDIA.map((item) => (
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
                  body: 'AGI Chat is free to try in the browser. Local and BYOK need no account at all.',
                  points: [
                    'Every admitted model behind one selector',
                    'Projects, memory, artifacts and web search from the first day',
                    'Every reply names the model that answered it',
                  ],
                  cta: { href: WEB_ENTRY_HREF, label: 'Try AGI Chat' },
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
