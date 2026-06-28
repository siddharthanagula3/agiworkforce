import type { Metadata } from 'next';
import { Header } from '../components/layout/Header';
import { MarketingFooter } from '../components/marketing/MarketingFooter';
import { HeroAppWindow } from '../components/marketing/HeroAppWindow';
import { MobileHeroVisual } from '../components/marketing/MobileHeroVisual';
import { MobileMockup, VSCodeMockup, ChromeMockup } from '../components/marketing/SurfaceMockups';
import { RouteFlow } from '../components/marketing/RouteFlow';
import { ProductFrame } from '../components/marketing/ProductFrame';
import { ApprovalWindow, DiffWindow } from '../components/marketing/ShowcaseScenes';
import {
  CapabilityGrid,
  DevBand,
  FinalCta,
  FlagshipHero,
  SurfaceIndex,
  SurfaceTicker,
  TrustTriptych,
} from '../components/marketing/FlagshipSections';
import { LAUNCH } from '../lib/marketing-constants';

const WEB_CHAT_ENTRY_HREF = '/login?redirectTo=%2Fchat';

export const metadata: Metadata = {
  title: 'AGI | One AI Workspace. Six Surfaces. Your Rules.',
  description:
    'The AI application suite for six surfaces. Local models, your own keys, or AGI managed cloud (public alpha). You see the route before anything leaves your device.',
  keywords: [
    'AI workspace',
    'multi-provider AI',
    'local AI',
    'BYOK AI',
    'AI agents',
    'AI tools',
    'AI automation',
    'AI coding assistant',
    'AI research assistant',
    'artifacts',
    'connectors',
    'Ollama',
    'LM Studio',
  ],
  openGraph: {
    title: 'AGI | One AI Workspace. Six Surfaces. Your Rules.',
    description: 'One workspace on six surfaces. Local, BYOK, or AGI managed cloud. Your rules.',
    type: 'website',
    url: 'https://agiworkforce.com',
    images: [{ url: '/app-preview.png', width: 1024, height: 665, alt: 'AGI Web composer' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AGI | One AI Workspace. Six Surfaces. Your Rules.',
    description: 'One workspace on six surfaces. Local, BYOK, or AGI managed cloud. Your rules.',
    images: ['/app-preview.png'],
  },
};

export default function Home() {
  return (
    <div data-design="agi">
      <Header />
      <main className="agi-shell">
        <FlagshipHero
          brand="AGI"
          eyebrow="the AI application suite"
          ctas={[
            { href: WEB_CHAT_ENTRY_HREF, label: 'Try AGI Web' },
            { href: '/download', label: 'Download AGI Desktop' },
            { href: '/cli', label: 'Install CLI' },
          ]}
          ctas2={[
            { href: '/vscode-extension', label: 'VS Code Extension' },
            { href: '/chrome-extension', label: 'Chrome Extension' },
          ]}
          modeRibbon={['Local · on-device', 'BYOK · your keys', 'Cloud · public alpha']}
          visual={<MobileHeroVisual />}
        />

        <SurfaceTicker words={['Web', 'Desktop', 'Mobile', 'CLI', 'Chrome', 'VS Code']} />

        <RouteFlow
          eyebrow="Routing"
          title="Every model. One router. Your call."
          lede="Pick a provider or let Auto route the task. Run it local, on your keys, or in AGI Cloud. The label is always on screen."
        />

        <SurfaceIndex
          eyebrow="The suite"
          title="Six surfaces."
          lede="Start anywhere. Your projects and artifacts follow. The rule never changes: you see where work runs."
          items={[
            {
              index: '01',
              name: 'AGI Desktop',
              tagline: 'Runs on your machine.',
              body: 'The native app, built in Rust. Local models, encrypted keys, connectors, and scheduled work. The Chrome extension pairs with it.',
              capabilities: [
                'Local models via Ollama & LM Studio',
                'BYOK keys, encrypted at rest',
                'MCP connectors & tool approvals',
                'Artifacts workbench',
                'Scheduled work with AGI Work',
              ],
              platforms: 'macOS · Windows · Linux',
              status: 'Local + BYOK host',
              href: '/desktop',
              frame: { variant: 'desktop', title: 'AGI Workforce', badge: 'Local' },
            },
            {
              index: '02',
              name: 'AGI Web',
              tagline: 'Zero install.',
              body: 'Chat in the browser. Projects, artifacts, web search, and shared links. Your account and managed cloud live here.',
              capabilities: [
                'Chat with projects & memory',
                'Artifact sidecar',
                'Web search',
                'Shared conversations',
                'Account & managed cloud',
              ],
              platforms: 'Any modern browser',
              status: 'Available in browser',
              href: WEB_CHAT_ENTRY_HREF,
              visual: <HeroAppWindow />,
            },
            {
              index: '03',
              name: 'AGI CLI',
              tagline: 'agi, in your terminal.',
              body: 'A Rust agent for the shell. Resume and fork sessions. Review code. Execute in a sandbox. Works offline.',
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
              index: '04',
              name: 'AGI in Chrome',
              tagline: 'Context from any page.',
              body: 'A side panel that reads the page when you ask. Real work executes on Desktop over a paired bridge. Permissions stay scoped.',
              capabilities: [
                'Side panel on any page',
                'Page context on request',
                'Paired Desktop bridge',
                'Scoped permissions',
                'Workflow recording',
              ],
              platforms: 'Chrome (MV3)',
              status: 'Desktop-bridge scoped',
              href: '/chrome-extension',
              visual: <ChromeMockup />,
            },
            {
              index: '05',
              name: 'AGI in VS Code',
              tagline: 'Help where you code.',
              body: 'Chat with @agi in the editor. Workspace context, diff review, slash commands. Handoffs are explicit.',
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
              visual: <VSCodeMockup />,
            },
            {
              index: '06',
              name: 'AGI Mobile',
              tagline: 'Private by default.',
              body: 'Local Mode out of the box. Conversations and memory stay on the phone until you say otherwise. Managed cloud is in public alpha.',
              capabilities: [
                'On-device Local chat',
                'Local data stays local',
                'Projects & recents drawer',
                'Cloud · public alpha',
              ],
              platforms: 'iPhone · Android',
              status: 'Local + Cloud (public alpha)',
              href: '/mobile',
              visual: <MobileMockup />,
            },
          ]}
        />

        <TrustTriptych
          eyebrow="Trust modes"
          title="Choose the route before work leaves your device."
          lede="Three routes, separate by design. A Local thread stays Local. Moving work anywhere else takes a label and your consent."
          cards={[
            {
              mode: 'Local',
              glyph: '◆',
              title: 'Yours alone.',
              body: 'Models on your hardware. Works offline. Free.',
              points: [
                'Local chats, files, and sessions never silently leave your device',
                'Ollama & LM Studio on Desktop and CLI',
                'On-device Local Mode on Mobile',
                'No account required',
              ],
              cta: { href: '/local', label: 'Run AGI Locally' },
            },
            {
              mode: 'BYOK',
              glyph: '◇',
              title: 'Your keys, your bill.',
              body: 'Bring provider keys on Desktop and CLI.',
              points: [
                'Keys stored encrypted, on your machine',
                'Traffic goes directly to your provider',
                'Visible provider label on every route',
                'Explicit, reviewed continuation from Local',
              ],
              cta: { href: '/byok', label: 'Set Up BYOK' },
            },
            {
              mode: 'AGI Cloud',
              glyph: '●',
              title: 'Public alpha.',
              body: 'Hosted capacity, open by default.',
              points: [
                'Public alpha — sign in and start, no waitlist',
                'Shared across Web, Mobile & Desktop',
                'AGI-owned routing with clear labels',
                'Usage metered and transparent',
              ],
              cta: { href: '/get-started', label: 'Get Started' },
            },
          ]}
        />

        <CapabilityGrid
          eyebrow="Capabilities"
          title="An application suite, not a one-screen chatbot."
          items={[
            {
              meta: 'Chat',
              title: 'AI Chat',
              body: 'Fast and familiar, on every surface.',
              href: '/features/ai-chat',
            },
            {
              meta: 'Artifacts',
              title: 'Artifacts',
              body: 'Documents, code, and previews. Versioned. Shareable.',
              href: '/features/artifacts',
            },
            {
              meta: 'Projects',
              title: 'Projects',
              body: 'Chats, files, and instructions, grouped.',
              href: '/features/projects',
            },
            {
              meta: 'Tools',
              title: 'Tools & Connectors',
              body: 'MCP servers and OAuth apps, behind explicit permissions.',
              href: '/apps',
            },
            {
              meta: 'Memory',
              title: 'Memory',
              body: 'Saved facts you can read, edit, and delete.',
              href: '/features/memory',
            },
            {
              meta: 'Research',
              title: 'Deep Research',
              body: 'Reports with citations you can check.',
              href: '/features/deep-research',
            },
          ]}
        />

        <DevBand
          eyebrow="For developers"
          title="Serious about the terminal."
          body="AGI Code spans the CLI and VS Code. Sessions resume and fork. Execution is sandboxed. It all runs offline on local models."
          ctas={[
            { href: '/agi-code', label: 'Explore AGI Code' },
            { href: '/cli', label: 'See the CLI' },
          ]}
          visual={
            <div className="agi-fl-devband-visual">
              <ProductFrame variant="terminal" title="agi · zsh" badge="sandboxed" />
              <DiffWindow />
            </div>
          }
        />

        <DevBand
          eyebrow="Approvals"
          title="Nothing runs without you."
          body="Every file edit and shell command asks first. Pick your autonomy: Suggest, Auto-edit, or Full-auto. Change it any time with Shift+Tab."
          ctas={[
            { href: '/features/tools', label: 'See Tool Permissions' },
            { href: '/security', label: 'Read the Security Model' },
          ]}
          visual={<ApprovalWindow />}
        />

        <FinalCta
          eyebrow={LAUNCH.publicLabel}
          title="Start where you work."
          body="Try the web app now. Install Desktop or the CLI for local work."
          ctas={[
            { href: WEB_CHAT_ENTRY_HREF, label: 'Try AGI Web' },
            { href: '/download', label: 'Download AGI Desktop' },
          ]}
          stamp={`Public launch · ${LAUNCH.date}`}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
