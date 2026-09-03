import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Eyebrow, Prose, Section, Stack } from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { LinkGrid } from '@/features/marketing/components/pages/features/shared';

export const metadata = buildMetadata({
  title: 'Features: chat, artifacts, projects, tools, memory, and research',
  description:
    'Everything inside the AGI workspace: chat, artifacts, projects, tools and connectors, memory, deep research, agents, plugins, and skills. Across every surface and trust mode.',
  path: '/features',
});

export default function FeaturesHubPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-features-hero-title"
          eyebrow="Features"
          title="Conversation is the front door. This is what sits behind it."
          lede="Projects, artifacts, memory, research, and agents are not separate products: they are what a chat can reach into. Every one of them runs in Local, BYOK, or AGI Cloud, and the lane that answered is labelled on the reply."
          ctas={[
            { href: '/login?redirectTo=%2F', label: 'Try AGI Web' },
            { href: '/download', label: 'Get the CLI', variant: 'secondary' },
          ]}
        />

        <Section id="daily-loop" labelledBy="agi-features-loop-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>The daily loop</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-features-loop-title">
                Chat, and the things a chat opens into.
              </h2>
            </div>
            <LinkGrid
              items={[
                {
                  meta: 'Chat',
                  title: 'AI chat',
                  body: 'One composer with attachments, dictation, web search, and slash commands, then a reply that shows the tools it called.',
                  href: '/features/ai-chat',
                },
                {
                  meta: 'Artifacts',
                  title: 'Artifacts',
                  body: 'Documents, code, and diagrams that leave the message stream and open in a versioned panel you can restore or edit.',
                  href: '/features/artifacts',
                },
                {
                  meta: 'Projects',
                  title: 'Projects',
                  body: 'Standing instructions and files a thread can lean on, rebuilt into the system message on every request.',
                  href: '/features/projects',
                },
                {
                  meta: 'Memory',
                  title: 'Memory',
                  body: 'Short sentences you can read, search, rewrite, or clear, written by you, a finished chat, or an import.',
                  href: '/features/memory',
                },
                {
                  meta: 'Research',
                  title: 'Deep research',
                  body: 'A run that plans its searches, waits for you to approve them, then writes a report with a citation behind every claim.',
                  href: '/features/deep-research',
                },
                {
                  meta: 'Agents',
                  title: 'Agents',
                  body: 'A markdown file names the tools it may touch. Anything risky opens an approval whose cursor starts on No.',
                  href: '/features/agents',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="extend" labelledBy="agi-features-extend-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>Extend</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-features-extend-title">
                Bring your own tools in.
              </h2>
            </div>
            <LinkGrid
              items={[
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
              ]}
            />
          </Stack>
        </Section>

        <Section id="features-close" labelledBy="agi-features-close-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-features-close-title">
              Pick where the request runs, then use all of this.
            </h2>
            <Prose>
              Local, BYOK, and AGI Cloud are the same workspace on three different lanes. Each
              feature above runs on whichever one you picked for that request.
            </Prose>
          </Stack>
        </Section>

        <MarketingFooter />
      </main>
    </div>
  );
}
