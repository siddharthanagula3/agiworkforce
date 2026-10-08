import type { CSSProperties } from 'react';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { AgiMark } from '@shared/components/agi/AgiMark';
import '../legacy-landing.css';
import '../motion/motion.css';
import './landing-next.css';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { HeroAppWindow } from '@/features/marketing/components/HeroAppWindow';
import {
  ChromeMockup,
  MobileMockup,
  VSCodeMockup,
} from '@/features/marketing/components/SurfaceMockups';
import { RouteFlow } from '@/features/marketing/components/RouteFlow';
import { ProductFrame } from '@/features/marketing/components/ProductFrame';
import { ApprovalWindow, DiffWindow } from '@/features/marketing/components/ShowcaseScenes';
import { PublicWaitlistForm } from '@/features/marketing/components/PublicWaitlistForm';
import { CATALOG_SCOPES } from '@/lib/catalog-scopes';
import { RELEASES } from '@/lib/changelog-entries';
import {
  CLI_AVAILABILITY_NOTE,
  CLI_LOCAL_RUNTIMES,
  MARKETING,
  SURFACE_STATUS,
} from '@/lib/marketing-constants';
import { isReleased, surfaceAvailabilitySummary, surfaceCta } from '@/lib/surface-status';
import { SurfaceShowcase, type ShowcaseSurface } from './SurfaceShowcase';

const WEB_CHAT_ENTRY_HREF = '/login?redirectTo=%2F';
const LATEST_ENTRY_COUNT = 3;
const BRAND_MARK_SIZE = 82;

const LATEST_ENTRIES = RELEASES.slice(0, LATEST_ENTRY_COUNT).map((release) => ({
  date: release.date,
  headline: release.headline,
  summary: release.body[0] ?? '',
}));

const FACTS = [
  {
    value: `${CATALOG_SCOPES.catalogueEntries.value}`,
    label: CATALOG_SCOPES.catalogueEntries.label,
  },
  { value: `${CATALOG_SCOPES.byokProviders.value}`, label: CATALOG_SCOPES.byokProviders.label },
  {
    value: `${CATALOG_SCOPES.localRuntimes.value}`,
    label: `${CATALOG_SCOPES.localRuntimes.label} in the CLI`,
  },
  { value: `${MARKETING.surfaces.count}`, label: 'surfaces, one account' },
] as const;

const DESKTOP_CTA = surfaceCta('desktop');
const CLI_CTA = surfaceCta('cli');
const CHROME_CTA = surfaceCta('chrome');
const VSCODE_CTA = surfaceCta('vscode');
const MOBILE_CTA = surfaceCta('mobile');

const SURFACES: readonly ShowcaseSurface[] = [
  {
    id: 'web',
    tab: 'Web',
    name: 'AGI Web',
    body: 'Chat in the browser. Projects, artifacts, web search, and shared links. Your account and managed cloud live here.',
    capabilities: [
      'Chat with projects and memory',
      'Artifact sidecar',
      'Web search',
      'Shared conversations',
    ],
    platforms: 'Any modern browser',
    status: SURFACE_STATUS.web,
    live: isReleased('web'),
    cta: { href: WEB_CHAT_ENTRY_HREF, label: 'Try AGI Web' },
    visual: <HeroAppWindow />,
  },
  {
    id: 'desktop',
    tab: 'Desktop',
    name: 'AGI Desktop',
    body: 'The AGI app for macOS. Your managed-cloud account in a window that stays open, plus approved folders and computer use one step at a time.',
    capabilities: [
      'Managed-cloud chat with visible model labels',
      'Approved folders and programs',
      'Computer use on macOS, step by step',
      'Quick Ask, screenshot and dictation shortcuts',
    ],
    platforms: 'macOS, Apple silicon and Intel',
    status: SURFACE_STATUS.desktop,
    live: isReleased('desktop'),
    cta: DESKTOP_CTA,
    visual: <ProductFrame variant="desktop" title="AGI Workforce" badge="Cloud" />,
  },
  {
    id: 'mobile',
    tab: 'Mobile',
    name: 'AGI Mobile',
    body: 'Planned around Local Mode: conversations and memory stay on the phone until you say otherwise.',
    capabilities: [
      'On-device Local chat',
      'Local data stays local',
      'Projects and recents drawer',
      'Cloud, managed by AGI',
    ],
    platforms: 'iPhone and Android',
    status: SURFACE_STATUS.mobile,
    live: isReleased('mobile'),
    cta: MOBILE_CTA,
    visual: <MobileMockup />,
  },
  {
    id: 'cli',
    tab: 'CLI',
    name: 'AGI CLI',
    body: 'A Rust agent for the shell. Resume and fork sessions, review code, and execute in a sandbox, on local models or your own keys.',
    capabilities: [
      'Sessions, resume and fork',
      'Sandboxed execution',
      'Hooks, skills and MCP',
      'Offline with local models',
    ],
    platforms: 'macOS, Linux and Windows',
    status: SURFACE_STATUS.cli,
    live: isReleased('cli'),
    cta: CLI_CTA,
    visual: <ProductFrame variant="terminal" title="agi · zsh" badge="sandboxed" />,
  },
  {
    id: 'chrome',
    tab: 'Chrome',
    name: 'AGI in Chrome',
    body: 'A side panel that reads the page when you ask. Answers come back from AGI Managed Cloud.',
    capabilities: [
      'Side panel on any page',
      'Page context on request',
      'Scoped permissions',
      'Workflow recording',
    ],
    platforms: 'Chrome (MV3)',
    status: SURFACE_STATUS.chrome,
    live: isReleased('chrome'),
    cta: CHROME_CTA,
    visual: <ChromeMockup />,
  },
  {
    id: 'vscode',
    tab: 'VS Code',
    name: 'AGI in VS Code',
    body: 'Chat with @agi in the editor. Workspace context, diff review and slash commands, with explicit handoffs.',
    capabilities: [
      '@agi chat participant',
      'Workspace-scoped context',
      'Diff review',
      'Explicit handoffs',
    ],
    platforms: 'VS Code',
    status: SURFACE_STATUS.vscode,
    live: isReleased('vscode'),
    cta: VSCODE_CTA,
    visual: <VSCodeMockup />,
  },
];

const TRUST = [
  {
    lane: 'local',
    mode: 'Local',
    title: 'Yours alone.',
    body: 'Models on your hardware. Works offline. Free.',
    points: [
      'Local chats, files and sessions never silently leave your device',
      `${CLI_LOCAL_RUNTIMES.label} in the CLI`,
      'No account required',
    ],
    cta: { href: '/local', label: 'How Local works' },
  },
  {
    lane: 'byok',
    mode: 'BYOK',
    title: 'Your keys, your bill.',
    body: 'Bring provider keys in the CLI. Traffic goes directly to your provider.',
    points: [
      'Keys saved on your own machine',
      'Visible provider label on every route',
      'Explicit, reviewed continuation from Local',
    ],
    cta: { href: '/byok', label: 'How BYOK works' },
  },
  {
    lane: 'cloud',
    mode: 'AGI Cloud',
    title: 'Open by default.',
    body: 'Hosted capacity. Sign in and start, no waitlist.',
    points: [
      'AGI-owned routing with clear labels',
      'Usage metered and transparent',
      'The route AGI Web uses',
    ],
    cta: { href: '/get-started', label: 'Get started' },
  },
] as const;

const CAPABILITIES = [
  { title: 'AI Chat', body: 'Fast and familiar, on every surface.', href: '/features/ai-chat' },
  {
    title: 'Artifacts',
    body: 'Documents, code and previews. Versioned and shareable.',
    href: '/features/artifacts',
  },
  {
    title: 'Projects',
    body: 'Chats, files and instructions, grouped.',
    href: '/features/projects',
  },
  {
    title: 'Tools and connectors',
    body: 'MCP servers and OAuth apps, behind explicit permissions. Connectors are coming soon.',
    href: '/connectors/mcp-directory',
  },
  { title: 'Memory', body: 'Saved facts you can read, edit and delete.', href: '/features/memory' },
  {
    title: 'Deep Research',
    body: 'Reports with citations you can check.',
    href: '/features/deep-research',
  },
] as const;

const START = [
  {
    title: 'Start on your own',
    body: 'AGI Web is free to try in the browser.',
    points: [
      'Every admitted model behind one selector, with Auto as the default',
      'Projects, memory, artifacts and web search on the first day',
      'Every reply names the model that answered it',
    ],
    cta: { href: WEB_CHAT_ENTRY_HREF, label: 'Try AGI Web' },
    kind: 'primary',
  },
  {
    title: 'Bring your organisation',
    body: 'Seats, roles and a workspace console that decides where work is allowed to run.',
    points: [
      'SSO and directory provisioning, contract scoped',
      'Audit export you can read line by line',
      'Retention windows and data-rights handling',
    ],
    cta: { href: '/contact-sales', label: 'Contact sales' },
    kind: 'secondary',
  },
] as const;

function rise(index: number): CSSProperties {
  return { '--lnx-i': index } as CSSProperties;
}

export function LandingNext() {
  return (
    <div data-design="agi" className="lnx">
      <Header />
      <main id="main-content" tabIndex={-1}>
        <section className="lnx-hero" aria-labelledby="lnx-hero-title">
          <div className="lnx-wrap lnx-hero-grid">
            <div>
              <Link href="/providers" className="lnx-announce lnx-rise" style={rise(0)}>
                <span className="lnx-announce-tag">New</span>
                {`${CATALOG_SCOPES.catalogueEntries.text} across ${CATALOG_SCOPES.byokProviders.text}`}
                <span className="lnx-announce-arrow" aria-hidden="true">
                  →
                </span>
              </Link>
              <h1 id="lnx-hero-title" className="lnx-h1">
                <span className="lnx-brand lnx-rise" style={rise(1)}>
                  <AgiMark size={BRAND_MARK_SIZE} className="lnx-brand-mark" />
                  AGI
                </span>
                <span className="lnx-statement lnx-rise" style={rise(2)}>
                  The AI application suite.
                </span>
              </h1>
              <p className="lnx-hero-lede lnx-rise" style={rise(3)}>
                One account for chat, research, artifacts and code. Ask for a model by name or leave
                it on Auto, and every reply names the model that answered.
              </p>
              <div className="lnx-hero-actions lnx-rise" style={rise(4)}>
                <Link href={WEB_CHAT_ENTRY_HREF} className="lnx-btn" data-kind="primary">
                  Try AGI Web
                </Link>
                <Link href={DESKTOP_CTA.href} className="lnx-btn" data-kind="secondary">
                  {DESKTOP_CTA.label}
                </Link>
              </div>
              <p className="lnx-hero-availability lnx-rise" style={rise(5)}>
                {surfaceAvailabilitySummary()}
              </p>
            </div>
            <div className="lnx-hero-visual">
              <HeroAppWindow />
            </div>
          </div>
        </section>

        <section className="lnx-facts" aria-label="Product facts">
          <div className="lnx-wrap">
            <ul className="lnx-facts-list">
              {FACTS.map((fact) => (
                <li key={fact.label} className="lnx-fact">
                  <span className="lnx-fact-value">{fact.value}</span>
                  <span className="lnx-fact-label">{fact.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div className="lnx-wrap lnx-router">
          <RouteFlow
            eyebrow="Routing"
            title="Every model. One router. Your call."
            lede="Ask for a model by name and that model answers. Leave it on Auto and the router reads each request, picks a model suited to the task and your plan while weighing cost, and prints the label under the answer."
          />
        </div>

        <section className="lnx-section" aria-labelledby="lnx-suite-title">
          <div className="lnx-wrap">
            <div className="lnx-head">
              <div>
                <p className="lnx-eyebrow">The suite</p>
                <h2 id="lnx-suite-title" className="lnx-h2">
                  Six surfaces. One account.
                </h2>
              </div>
              <p className="lnx-lede">
                Start anywhere. Your projects and artifacts follow. The rule never changes: you see
                where work runs.
              </p>
            </div>
            <SurfaceShowcase surfaces={SURFACES} label="The six surfaces" />
          </div>
        </section>

        <section className="lnx-section" aria-labelledby="lnx-trust-title">
          <div className="lnx-wrap">
            <div className="lnx-head">
              <div>
                <p className="lnx-eyebrow">Trust modes</p>
                <h2 id="lnx-trust-title" className="lnx-h2">
                  Choose the route before work leaves your device.
                </h2>
              </div>
              <p className="lnx-lede">
                Three routes, separate by design. A Local thread stays Local. Moving work anywhere
                else takes a label and your consent. {CLI_AVAILABILITY_NOTE}
              </p>
            </div>
            <div className="lnx-trust-grid">
              {TRUST.map((card) => (
                <article key={card.lane} className="lnx-trust" data-lane={card.lane}>
                  <span className="lnx-lane">{card.mode}</span>
                  <h3 className="lnx-h3">{card.title}</h3>
                  <p className="lnx-trust-body">{card.body}</p>
                  <ul className="lnx-list">
                    {card.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                  <Link href={card.cta.href} className="lnx-link">
                    {card.cta.label}
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lnx-section" aria-labelledby="lnx-caps-title">
          <div className="lnx-wrap">
            <div className="lnx-head">
              <div>
                <p className="lnx-eyebrow">Capabilities</p>
                <h2 id="lnx-caps-title" className="lnx-h2">
                  An application suite, not a one-screen chatbot.
                </h2>
              </div>
            </div>
            <div className="lnx-caps">
              {CAPABILITIES.map((item) => (
                <Link key={item.href} href={item.href} className="lnx-cap">
                  <span className="lnx-cap-title">{item.title}</span>
                  <span className="lnx-cap-body">{item.body}</span>
                  <span className="lnx-cap-arrow" aria-hidden="true">
                    →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="lnx-section" aria-labelledby="lnx-dev-title">
          <div className="lnx-wrap lnx-band">
            <div>
              <p className="lnx-eyebrow">For developers</p>
              <h2 id="lnx-dev-title" className="lnx-h2">
                Serious about the terminal.
              </h2>
              <p className="lnx-lede">
                AGI Code spans the CLI and VS Code. Sessions resume and fork, execution is
                sandboxed, and you choose whether file edits and shell commands need your approval.
              </p>
              <div className="lnx-band-actions">
                <Link href="/agi-code" className="lnx-link">
                  Explore AGI Code
                </Link>
                <Link href="/security" className="lnx-link">
                  Read the security model
                </Link>
              </div>
            </div>
            <div className="lnx-band-visual">
              <DiffWindow />
              <ApprovalWindow />
            </div>
          </div>
        </section>

        <section className="lnx-section" aria-labelledby="lnx-mobile-title">
          <div className="lnx-wrap lnx-waitlist">
            <div>
              <p className="lnx-eyebrow">AGI Mobile</p>
              <h2 id="lnx-mobile-title" className="lnx-h2">
                Local, on-device AI. Built, not yet shipped.
              </h2>
              <p className="lnx-lede">
                It is not on the App Store or Google Play yet, so there is nothing to install today.
                Leave your email to be told when it lands.
              </p>
            </div>
            <PublicWaitlistForm
              source="mobile"
              ctaLabel="Notify Me"
              successMessage="You're on the list. We announce launches on the changelog, and we'll reach the addresses on this list when it ships."
            />
          </div>
        </section>

        <section className="lnx-section" aria-labelledby="lnx-latest-title">
          <div className="lnx-wrap">
            <div className="lnx-head">
              <div>
                <p className="lnx-eyebrow">Latest</p>
                <h2 id="lnx-latest-title" className="lnx-h2">
                  What shipped.
                </h2>
              </div>
            </div>
            <ol className="lnx-latest">
              {LATEST_ENTRIES.map((entry) => (
                <li key={entry.date + entry.headline} className="lnx-latest-row">
                  <time className="lnx-meter" dateTime={entry.date}>
                    {entry.date}
                  </time>
                  <h3 className="lnx-latest-title">{entry.headline}</h3>
                  <p className="lnx-latest-summary">{entry.summary}</p>
                </li>
              ))}
            </ol>
            <p className="lnx-latest-more">
              <Link href="/changelog" className="lnx-link">
                Full changelog
              </Link>
            </p>
          </div>
        </section>

        <section className="lnx-close" aria-labelledby="lnx-close-title">
          <div className="lnx-wrap">
            <p className="lnx-eyebrow">Get started</p>
            <h2 id="lnx-close-title" className="lnx-h2">
              Start where you work.
            </h2>
            <div className="lnx-close-grid">
              {START.map((card) => (
                <article key={card.title} className="lnx-start">
                  <h3 className="lnx-h3">{card.title}</h3>
                  <p className="lnx-trust-body">{card.body}</p>
                  <ul className="lnx-list">
                    {card.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                  <Link href={card.cta.href} className="lnx-btn" data-kind={card.kind}>
                    {card.cta.label}
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
