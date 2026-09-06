import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Eyebrow,
  ProductFrame,
  Prose,
  Section,
  Stack,
} from '@/features/marketing/components/system';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { WebWindow } from '@/features/marketing/components/DeviceMockups';
import {
  AgentRunWindow,
  ArtifactsWindow,
  MemoryWindow,
  ProjectWindow,
  ResearchWindow,
} from '@/features/marketing/components/FeatureScenes';

const FAMILY_SCENES: Record<string, ReactNode> = {
  'AI chat': <WebWindow />,
  Artifacts: <ArtifactsWindow />,
  Projects: <ProjectWindow />,
  Memory: <MemoryWindow />,
  'Deep research': <ResearchWindow />,
  Agents: <AgentRunWindow />,
};

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

const FAMILIES = [
  {
    title: 'AI chat',
    body: 'One composer with attachments, dictation, web search, and slash commands, then a reply that shows the tools it called.',
    href: '/features/ai-chat',
    image: {
      dark: '/product/composer-dark.png',
      light: '/product/composer-light.png',
      alt: 'The AGI composer with attachments, dictation, and the model picker',
      width: 1472,
      height: 254,
    },
  },
  {
    title: 'Artifacts',
    body: 'Documents, code, and diagrams that leave the message stream and open in a versioned panel you can restore or edit.',
    href: '/features/artifacts',
    image: {
      dark: '/product/artifacts-library-dark.png',
      light: '/product/artifacts-library-light.png',
      alt: 'The AGI library listing generated artifacts with their type, size, and route labels',
      width: 2880,
      height: 1800,
    },
  },
  {
    title: 'Projects',
    body: 'Standing instructions and files a thread can lean on, rebuilt into the system message on every request.',
    href: '/features/projects',
    image: {
      dark: '/product/projects-dark-landing.png',
      light: '/product/projects-light-landing.png',
      alt: 'Creating a new AGI project from a template',
      width: 2880,
      height: 1800,
    },
  },
  {
    title: 'Memory',
    body: 'Short sentences you can read, search, rewrite, or clear, written by you, a finished chat, or an import.',
    href: '/features/memory',
    image: {
      dark: '/product/memory-settings-dark.png',
      light: '/product/memory-settings-light.png',
      alt: 'The memory settings panel in AGI, listing where memories come from',
      width: 1720,
      height: 1360,
    },
  },
  {
    title: 'Deep research',
    body: 'A run that plans its searches, waits for you to approve them, then writes a report with a citation behind every claim.',
    href: '/features/deep-research',
    image: {
      dark: '/product/deep-research-report-dark.png',
      light: '/product/deep-research-report-light.png',
      alt: 'A finished AGI deep research report with numbered inline citations and a sources list',
      width: 2392,
      height: 1402,
    },
  },
  {
    title: 'Agents',
    body: 'A markdown file names the tools it may touch. Anything risky opens an approval whose cursor starts on No.',
    href: '/features/agents',
    image: {
      dark: '/product/agents-tool-approvals-dark.png',
      light: '/product/agents-tool-approvals-light.png',
      alt: 'The tool approvals setting in AGI, with "Ask before every action" selected',
      width: 1132,
      height: 584,
    },
  },
] as const;

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

export default function FeaturesHubPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <section className="agi-lp-hero" aria-labelledby={IDS.hero}>
          <div className="agi-ds-container agi-lp-hero-grid">
            <div className="agi-lp-hero-copy">
              <p className="agi-lp-eyebrow">Features</p>
              <h1 className="agi-lp-h1" id={IDS.hero}>
                <span className="agi-lp-line">Conversation is the front door.</span>
                <em className="agi-lp-accent">This is what sits behind it.</em>
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

        <section className="agi-lp-section" aria-labelledby={IDS.loop}>
          <div className="agi-ds-container">
            <div className="agi-lp-heading">
              <p className="agi-lp-eyebrow">The daily loop</p>
              <h2 className="agi-lp-h2" id={IDS.loop}>
                Chat, and the things <em className="agi-lp-accent">a chat opens into.</em>
              </h2>
            </div>
            <div className="agi-lp-moments">
              {FAMILIES.map((family) => (
                <article className="agi-lp-moment" key={family.title}>
                  <div className="agi-lp-moment-copy">
                    <h3 className="agi-lp-moment-title">{family.title}</h3>
                    <p className="agi-lp-moment-body">{family.body}</p>
                    <Link href={family.href} className="agi-lp-lane-link">
                      Read the {family.title} page
                    </Link>
                  </div>
                  {FAMILY_SCENES[family.title] ?? (
                    <ProductFrame
                      src={family.image.dark}
                      srcLight={family.image.light}
                      alt={family.image.alt}
                      width={family.image.width}
                      height={family.image.height}
                    />
                  )}
                </article>
              ))}
            </div>
          </div>
        </section>

        <Section id="extend" labelledBy={IDS.extend} rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>Extend</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.extend}>
                Bring your own tools in.
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {EXTEND.map((item) => (
                <div
                  key={item.title}
                  className="flex flex-col gap-3 rounded-xl border border-[var(--agi-rule)] bg-[var(--agi-ground)] p-6"
                >
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

        <section className="agi-lp-close" aria-labelledby={IDS.close}>
          <div className="agi-ds-container">
            <div className="agi-lp-close-inner">
              <h2 className="agi-lp-h2" id={IDS.close}>
                Pick where the request runs,{' '}
                <em className="agi-lp-accent">then use all of this.</em>
              </h2>
              <p className="agi-lp-lede">
                Local, BYOK, and AGI Cloud are the same workspace on three different lanes. Each
                feature above runs on whichever one you picked for that request.
              </p>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
