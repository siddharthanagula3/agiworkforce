import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { RouteMap } from '../../components/marketing/LandingSections';
import {
  CapabilityGrid,
  DevBand,
  FinalCta,
  FlagshipHero,
  SurfaceIndex,
} from '../../components/marketing/FlagshipSections';
import { LAUNCH } from '../../lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'AGI Code | CLI + VS Code developer stack',
  description:
    'AGI Code spans the agi CLI and the VS Code extension: resumable sessions, code review, sandboxed execution, hooks, skills, MCP, and privacy modes. Local models, BYOK, or AGI managed cloud (public alpha).',
  path: '/agi-code',
});

export default function AgiCodePage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <FlagshipHero
          eyebrow="AGI Code · for developers"
          titleLines={['Your terminal.', 'Your editor.', 'One agent.']}
          em="One agent."
          lede="AGI Code spans the agi CLI and the VS Code extension. Resume and fork sessions. Review diffs before they land. Run commands in an OS sandbox. Extend the agent with hooks, skills, and MCP. Local models, your own keys, or AGI managed cloud (public alpha)."
          ctas={[
            { href: '/cli', label: 'See the CLI' },
            { href: '/vscode-extension', label: 'Get the VS Code Extension' },
            { href: '/download', label: 'Get notified' },
          ]}
          modeRibbon={['Local · offline-capable', 'BYOK · your keys', 'Cloud · public alpha']}
        />

        <SurfaceIndex
          eyebrow="The stack"
          title="Two developer surfaces. One workflow."
          lede="Work in the terminal or inside your editor. Same agent, same permission model. You can always see where your work runs."
          items={[
            {
              index: '01',
              name: 'AGI CLI',
              tagline: 'An agent in your terminal.',
              body: 'The agi binary is a Rust-native developer agent: sessions you can resume and fork, code review, and sandboxed execution. Works offline with local models.',
              capabilities: [
                'Sessions, resume & fork',
                'Sandboxed execution',
                'Hooks, skills & MCP',
                'Privacy modes',
                'Offline with local models',
              ],
              platforms: 'macOS · Linux',
              status: 'Developer preview',
              href: '/cli',
              frame: { variant: 'terminal', title: 'agi · zsh', badge: 'sandboxed' },
            },
            {
              index: '02',
              name: 'AGI in VS Code',
              tagline: 'IDE-native assistance.',
              body: 'Chat with @agi inside your editor with workspace-scoped context. Review diffs before they land, run slash commands like /explain and /tests, and hand off to other surfaces explicitly.',
              capabilities: [
                '@agi chat participant',
                'Workspace-scoped context',
                'Diff review',
                '/explain · /fix · /tests · /docs',
                'Explicit handoffs',
              ],
              platforms: 'VS Code',
              status: 'Developer preview',
              href: '/vscode-extension',
              frame: { variant: 'editor', title: 'AGI · VS Code', badge: '@agi' },
            },
          ]}
        />

        <CapabilityGrid
          eyebrow="Capabilities"
          title="Built for the way agents actually work."
          items={[
            {
              meta: 'Sessions',
              title: 'Resume & fork',
              body: 'Pick a session back up where you left it, or fork it with /fork to explore a branch without losing the original.',
              href: '/cli',
            },
            {
              meta: 'Review',
              title: 'Code review',
              body: 'agi review reads your diff and returns severity-ranked findings with file and line references, before you commit.',
              href: '/cli',
            },
            {
              meta: 'Safety',
              title: 'Sandboxed execution',
              body: 'Commands run inside an OS sandbox with network access denied by default; sensitive actions wait for your explicit approval.',
              href: '/cli',
            },
            {
              meta: 'Extensibility',
              title: 'Hooks & skills',
              body: 'Run your own commands on agent lifecycle events, and package repeatable workflows as skills.',
              href: '/cli',
            },
            {
              meta: 'Tools',
              title: 'MCP servers',
              body: 'Connect local MCP servers as stdio processes and call their tools mid-session, behind the same permission model.',
              href: '/apps',
            },
            {
              meta: 'Privacy',
              title: 'Privacy modes',
              body: 'Set a privacy mode per project to pin the trust boundary. Local work stays local. Any other route is explicit and labeled.',
              href: '/local',
            },
          ]}
        />

        <DevBand
          eyebrow="Local-first"
          title="Works offline. Routes on your rules."
          body="Point AGI Code at local models through Ollama or LM Studio and work entirely offline. Bring your own provider keys when you want frontier models. The provider label is visible on every request. Nothing moves between modes silently."
          ctas={[
            { href: '/local', label: 'Run AGI Locally' },
            { href: '/byok', label: 'Set Up BYOK' },
          ]}
        />

        <RouteMap
          eyebrow="Explore"
          title="Go deeper, surface by surface."
          routes={[
            {
              meta: 'Terminal',
              title: 'AGI CLI',
              body: 'The command-line coding surface, in detail.',
              href: '/cli',
            },
            {
              meta: 'Editor',
              title: 'AGI in VS Code',
              body: 'Editor-native chat, diffs, and reviews.',
              href: '/vscode-extension',
            },
          ]}
        />

        <FinalCta
          eyebrow={LAUNCH.publicLabel}
          title="Bring the agent to your repo."
          body="The CLI and VS Code extension are coming soon. Get notified, request the VS Code preview, and choose the route for every task: local models, your own keys, or AGI managed cloud (public alpha, open by default)."
          ctas={[
            { href: '/download', label: 'Get notified' },
            { href: '/cli', label: 'See the CLI' },
            { href: '/get-started', label: 'Get Started' },
          ]}
          stamp={`Public launch · ${LAUNCH.date}`}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
