import { Header } from '@shared/components/layout/Header';
import './legacy-landing.css';
import './motion/motion.css';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { HeroAppWindow } from '@/features/marketing/components/HeroAppWindow';
import { MobileHeroVisual } from '@/features/marketing/components/MobileHeroVisual';
import {
  MobileMockup,
  VSCodeMockup,
  ChromeMockup,
} from '@/features/marketing/components/SurfaceMockups';
import { RouteFlow } from '@/features/marketing/components/RouteFlow';
import { ProductFrame } from '@/features/marketing/components/ProductFrame';
import { ApprovalWindow, DiffWindow } from '@/features/marketing/components/ShowcaseScenes';
import {
  CapabilityGrid,
  DevBand,
  FlagshipHero,
  LatestBlock,
  ProofRow,
  StartCards,
  SurfaceIndex,
  SurfaceTicker,
  TrustTriptych,
} from '@/features/marketing/components/FlagshipSections';
import { RELEASES } from '@/lib/changelog-entries';
import { BYOK_PROVIDER_IDS } from '@/app/byok/byok-providers';
import { PublicWaitlistForm } from '@/features/marketing/components/PublicWaitlistForm';
import {
  approximateCount,
  DESKTOP_LOCAL_RUNTIMES,
  MARKETING,
  SURFACE_STATUS,
} from '@/lib/marketing-constants';

const WEB_CHAT_ENTRY_HREF = '/login?redirectTo=%2F';
const LATEST_ENTRY_COUNT = 3;
const LATEST_ENTRIES = RELEASES.slice(0, LATEST_ENTRY_COUNT).map((release) => ({
  date: release.date,
  headline: release.headline,
  summary: release.body[0] ?? '',
}));

export function MarketingLanding() {
  return (
    <div data-design="agi">
      <Header />
      <main className="agi-shell">
        <FlagshipHero
          brand="AGI"
          eyebrow="the AI application suite"
          ctas={[
            { href: WEB_CHAT_ENTRY_HREF, label: 'Try AGI Web' },
            { href: '/download', label: 'Get AGI Desktop' },
          ]}
          visual={<MobileHeroVisual />}
          announcement={{
            tag: 'New',
            label: `${approximateCount(MARKETING.models.count)} models across ${approximateCount(BYOK_PROVIDER_IDS.length)} providers`,
            href: '/providers',
          }}
        />

        <SurfaceTicker words={['Web', 'Desktop', 'Mobile', 'CLI', 'Chrome', 'VS Code']} />

        <ProofRow
          label="Product facts"
          facts={[
            { value: approximateCount(MARKETING.models.count), label: 'models in the catalogue' },
            {
              value: approximateCount(BYOK_PROVIDER_IDS.length),
              label: 'providers that take your key',
            },
            {
              value: approximateCount(DESKTOP_LOCAL_RUNTIMES.names.length),
              label: 'local runtimes on Desktop',
            },
            { value: approximateCount(MARKETING.surfaces.count), label: 'surfaces, one account' },
          ]}
        />

        <RouteFlow
          eyebrow="Routing"
          title="Every model. One router. Your call."
          lede="Ask for a model by name and that model answers. Leave it on Auto and the router reads the intent of each request, takes the cheapest route that fits it, and prints the label under the answer. Run it local, on your keys, or in AGI Cloud."
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
                `Local models via ${DESKTOP_LOCAL_RUNTIMES.label}`,
                'BYOK keys, encrypted at rest',
                'MCP connectors & tool approvals',
                'Artifacts workbench',
                'Scheduled work with AGI Work',
              ],
              platforms: 'Linux x64 assets · installer verification pending',
              status: SURFACE_STATUS.desktop,
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
              status: SURFACE_STATUS.web,
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
              platforms: 'macOS · Linux · Windows',
              status: SURFACE_STATUS.cli,
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
              status: SURFACE_STATUS.chrome,
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
              status: SURFACE_STATUS.vscode,
              href: '/vscode-extension',
              visual: <VSCodeMockup />,
            },
            {
              index: '06',
              name: 'AGI Mobile',
              tagline: 'Private by default.',
              body: 'Local Mode out of the box. Conversations and memory stay on the phone until you say otherwise. Managed cloud is open by default.',
              capabilities: [
                'On-device Local chat',
                'Local data stays local',
                'Projects & recents drawer',
                'Cloud · managed by AGI',
              ],
              platforms: 'iPhone · Android',
              status: SURFACE_STATUS.mobile,
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
                'Ollama, LM Studio, llama.cpp & vLLM on Desktop',
                'On-device Local Mode on Mobile',
                'No account required',
              ],
              cta: { href: '/local', label: 'Run AGI Locally' },
            },
            {
              mode: 'BYOK',
              glyph: '◇',
              title: 'Your keys, your bill.',
              body: 'Bring provider keys on Desktop, CLI, and VS Code.',
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
              title: 'Open by default.',
              body: 'Hosted capacity, open by default.',
              points: [
                'Sign in and start, no waitlist',
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

        <section className="agi-fl-section" aria-labelledby="agi-mobile-launch-title">
          <p className="agi-fl-eyebrow">AGI Mobile</p>
          <h2 id="agi-mobile-launch-title" className="agi-fl-h2">
            Local, on-device AI. Built, not yet shipped.
          </h2>
          <p className="agi-fl-section-lede">
            AGI Mobile is built around Local Mode: chats and memory stay on the phone unless you
            move them. It is not on the App Store or Google Play yet, so there is nothing to install
            today. Leave your email to be told when it lands.
          </p>
          <div className="agi-fl-launch-form">
            <PublicWaitlistForm
              source="mobile"
              ctaLabel="Notify Me"
              successMessage="You're on the list. We announce launches on the changelog, and we'll reach the addresses on this list when it ships."
            />
          </div>
        </section>

        <LatestBlock
          eyebrow="Latest"
          title="What shipped."
          entries={LATEST_ENTRIES}
          more={{ href: '/changelog', label: 'Full changelog' }}
        />

        <StartCards
          eyebrow="Get started"
          title="Start where you work."
          cards={[
            {
              title: 'Start on your own',
              body: 'AGI Web is free to try in the browser. Local and BYOK need no account at all.',
              points: [
                'Every admitted model behind one selector, with Auto as the default',
                'Projects, memory, artifacts and web search on the first day',
                'A served-by receipt under every reply',
                'Desktop, CLI and the extensions on the same account',
              ],
              cta: { href: WEB_CHAT_ENTRY_HREF, label: 'Try AGI Web' },
            },
            {
              title: 'Bring your organisation',
              body: 'Seats, roles and a workspace console that decides where work is allowed to run.',
              points: [
                'SSO and directory provisioning, contract scoped',
                'Audit export you can read line by line',
                'Retention windows and data-rights handling',
                'Local and BYOK keep data on your hardware or your provider contract',
              ],
              cta: { href: '/contact-sales', label: 'Contact sales' },
            },
          ]}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
