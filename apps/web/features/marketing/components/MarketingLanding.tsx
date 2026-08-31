import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { HeroAppWindow } from '@/features/marketing/components/HeroAppWindow';
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
  FinalCta,
  SurfaceIndex,
} from '@/features/marketing/components/FlagshipSections';
import { PublicWaitlistForm } from '@/features/marketing/components/PublicWaitlistForm';
import { DESKTOP_LOCAL_RUNTIMES, SURFACE_STATUS } from '@/lib/marketing-constants';

const WEB_CHAT_ENTRY_HREF = '/login?redirectTo=%2F';

export function MarketingLanding() {
  return (
    <div data-design="agi">
      <Header />
      <main className="agi-shell">
        {/* The product takes the stage. This hero used to lead with a wordmark
            and put a phone in the column beside it, where it rendered around
            250px in a 1440px viewport - small enough that the interface could
            not be read, which makes it decoration rather than the thing being
            sold. Statement above, application beneath it, at a size where the
            composer, the model picker and the route are all legible. */}
        <section className="agi-hero-stage" aria-labelledby="agi-fl-hero-title">
          <div className="agi-hero-stage-copy">
            <h1 id="agi-fl-hero-title" className="agi-hero-stage-title">
              One workspace. Every surface.
            </h1>
            <p className="agi-hero-stage-lede">
              One assistant across six surfaces — and you choose where each request actually runs.
            </p>
            <div className="agi-fl-cta-row">
              <Link href={WEB_CHAT_ENTRY_HREF} className="agi-fl-cta agi-fl-cta--primary">
                Try AGI Web
              </Link>
              <Link href="/download" className="agi-fl-cta agi-fl-cta--ghost">
                Get AGI Desktop
              </Link>
            </div>
          </div>

          <div className="agi-hero-stage-product">
            <HeroAppWindow />
          </div>
        </section>

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
              body: 'Local Mode out of the box. Conversations and memory stay on the phone until you say otherwise. Managed cloud is in public alpha.',
              capabilities: [
                'On-device Local chat',
                'Local data stays local',
                'Projects & recents drawer',
                'Cloud · public alpha',
              ],
              platforms: 'iPhone · Android',
              status: SURFACE_STATUS.mobile,
              href: '/mobile',
              visual: <MobileMockup />,
            },
          ]}
        />
        <CapabilityGrid
          stage="ink"
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
          stage="void"
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
          stage="void"
          eyebrow="Approvals"
          title="Nothing runs without you."
          body="Every file edit and shell command asks first. Pick how much rope the agent gets — Safe, Plan, Build, or Autopilot — and change it any time with Shift+Tab."
          ctas={[
            { href: '/features/tools', label: 'See tool permissions' },
            { href: '/security', label: 'Read the security model' },
          ]}
          visual={<ApprovalWindow />}
        />

        <section
          className="agi-fl-section agi-stage agi-stage--ink"
          aria-labelledby="agi-mobile-launch-title"
        >
          <p className="agi-fl-eyebrow">AGI Mobile</p>
          <h2 id="agi-mobile-launch-title" className="agi-fl-h2">
            Local, on-device AI. Built, not yet shipped.
          </h2>
          <p className="agi-fl-section-lede">
            AGI Mobile is built around Local Mode: chats and memory stay on the phone unless you
            move them. It is not on the App Store or Google Play yet, so there is nothing to install
            today. Leave your email to be told when it lands.
          </p>
          {/*
           * The copy here used to promise "we will tell you the day it lands"
           * and "We'll email you the day AGI Mobile lands". Nothing in this
           * repository reads `cloud_managed_waitlist` to send mail — the only
           * wired email paths are support escalation and scheduled-task
           * notifications, neither of which can broadcast to this list. So the
           * promise was unperformable, and under the DPDP consent model it was
           * worse than that: the address is collected for a stated purpose, and
           * a purpose we cannot carry out is not a lawful one to collect for.
           * Say what actually happens — the address is recorded, a human sends
           * the announcement — and do not restore a delivery guarantee until
           * something can deliver it.
           */}
          <div className="agi-fl-launch-form">
            <PublicWaitlistForm
              source="mobile"
              ctaLabel="Notify Me"
              successMessage="You're on the list. We announce launches on the changelog, and we'll reach the addresses on this list when it ships."
            />
          </div>
        </section>

        <FinalCta
          stage="ink"
          eyebrow="Start now"
          title="Start where you work."
          body="AGI Web runs in the browser today. The CLI is released for Local and BYOK work; Desktop Linux assets are published, with installer availability verified live before download."
          ctas={[
            { href: WEB_CHAT_ENTRY_HREF, label: 'Try AGI Web' },
            { href: '/download', label: 'Check Desktop availability' },
            { href: '/cli', label: 'Install the CLI' },
          ]}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
