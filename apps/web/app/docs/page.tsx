import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { COMING_SOON_LABEL } from '../../lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'Documentation | AGI',
  description:
    'Reference for every AGI surface: CLI, Desktop, Mobile, Web, Chrome, and VS Code extension.',
  path: '/docs',
});

const SIDEBAR: { heading: string; icon: string; links: { label: string; href: string }[] }[] = [
  {
    heading: 'Get Started',
    icon: '>_',
    links: [
      { label: 'Welcome to AGI', href: '/docs' },
      { label: 'Installation', href: '/download' },
      { label: 'Quickstart', href: '/get-started' },
    ],
  },
  {
    heading: 'CLI',
    icon: '$',
    links: [
      { label: 'Overview', href: '/cli' },
      { label: 'Sessions', href: '/cli' },
      { label: 'REPL', href: '/cli' },
      { label: 'Hooks', href: '/cli' },
      { label: 'MCP Tools', href: '/integrations' },
    ],
  },
  {
    heading: 'Desktop',
    icon: '⬜',
    links: [
      { label: 'Overview', href: '/desktop' },
      { label: 'Local Mode', href: '/local' },
      { label: 'BYOK', href: '/byok' },
      { label: 'Connectors', href: '/integrations' },
    ],
  },
  {
    heading: 'Mobile',
    icon: '◻',
    links: [
      { label: 'Overview', href: '/mobile' },
      { label: 'Local Mode', href: '/local' },
      { label: 'App Setup', href: '/mobile' },
    ],
  },
  {
    heading: 'Web',
    icon: '○',
    links: [
      { label: 'Overview', href: '/get-started' },
      { label: 'Projects', href: '/features/projects' },
      { label: 'Artifacts', href: '/features/artifacts' },
    ],
  },
  {
    heading: 'Reference',
    icon: '◈',
    links: [
      { label: 'API Reference', href: '/api-docs' },
      { label: 'Providers', href: '/providers' },
      { label: 'Integrations', href: '/integrations' },
      { label: 'FAQ', href: '/faq' },
    ],
  },
  {
    heading: 'Trust',
    icon: '◇',
    links: [
      { label: 'Security', href: '/security' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Changelog', href: '/changelog' },
    ],
  },
];

const SURFACE_TABS = [
  { label: 'Get Started', href: '/docs', active: true },
  { label: 'CLI', href: '/cli' },
  { label: 'Desktop', href: '/desktop' },
  { label: 'Mobile', href: '/mobile' },
  { label: 'Web', href: '/get-started' },
  { label: 'Chrome', href: '/chrome-extension' },
  { label: 'VS Code', href: '/vscode-extension' },
];

const FEATURE_CARDS = [
  {
    href: '/cli',
    title: 'AGI CLI',
    body: 'Rust-native agent for coding sessions, diffs, reviews, sandboxed execution, and hooks in your terminal.',
    cta: 'agi',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
      </svg>
    ),
  },
  {
    href: '/desktop',
    title: 'AGI Desktop',
    body: 'Native app for macOS, Windows, and Linux. Local models, encrypted BYOK keys, tools, and connectors.',
    cta: 'AGI.app',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
  {
    href: '/mobile',
    title: 'AGI Mobile',
    body: 'iPhone and Android. On-device Local Mode by default. Dispatch tasks to Desktop for heavier work.',
    cta: COMING_SOON_LABEL,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="5" y="2" width="14" height="20" rx="2" />
        <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    href: '/get-started',
    title: 'AGI Web',
    body: 'Hosted chat with projects, artifacts, cited research, and account management. Works in any browser.',
    cta: 'agiworkforce.com',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
  },
  {
    href: '/chrome-extension',
    title: 'Chrome Extension',
    body: 'Side panel UI in Chrome MV3. The paired Desktop handles the real work; no keys stored in the browser.',
    cta: COMING_SOON_LABEL,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="4" />
        <line x1="21.17" y1="8" x2="12" y2="8" />
        <line x1="3.95" y1="6.06" x2="8.54" y2="14" />
        <line x1="10.88" y1="21.94" x2="15.46" y2="14" />
      </svg>
    ),
  },
  {
    href: '/vscode-extension',
    title: 'VS Code Extension',
    body: '@agi chat participant, diff review, inline completions, and slash commands inside VS Code.',
    cta: COMING_SOON_LABEL,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
];

const REFERENCE_CARDS = [
  {
    href: '/api-docs',
    title: 'API Reference',
    body: 'OpenAI-compatible gateway endpoints for building on AGI infrastructure.',
    cta: '/v1/chat/completions',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    href: '/providers',
    title: 'Providers & Models',
    body: 'Cloud APIs, local runtimes, and custom endpoints. Bring your own keys or run fully offline.',
    cta: 'providers',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
      </svg>
    ),
  },
  {
    href: '/integrations',
    title: 'MCP & Integrations',
    body: 'Model Context Protocol plugins, the Desktop bridge, BYOK key management, and custom connectors.',
    cta: 'integrations',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    ),
  },
  {
    href: '/byok',
    title: 'BYOK Mode',
    body: 'Add a provider key on Desktop or CLI and route work directly. AGI never sees your API keys.',
    cta: 'byok',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
      </svg>
    ),
  },
];

export default function DocsPage() {
  return (
    <div data-design="agi">
      <div className="agi-docs-wrap">
        <Header />

        {/* Secondary surface tab nav */}
        <nav className="agi-docs-tabnav" aria-label="Documentation sections">
          <div className="agi-docs-tabs">
            {SURFACE_TABS.map((tab) => (
              <Link
                key={tab.href + tab.label}
                href={tab.href}
                className={`agi-docs-tab${tab.active ? ' agi-docs-tab--active' : ''}`}
              >
                {tab.label}
              </Link>
            ))}
          </div>
          <div className="agi-docs-tabnav-right">
            <Link href="/api-docs" className="agi-docs-tabnav-link">
              Reference
            </Link>
            <Link href="/changelog" className="agi-docs-tabnav-link">
              Changelog
            </Link>
            <a
              href="https://github.com/siddharthanagula3/agiworkforce"
              target="_blank"
              rel="noopener noreferrer"
              className="agi-docs-tabnav-link"
            >
              GitHub
            </a>
          </div>
        </nav>

        {/* Sidebar + content */}
        <div className="agi-docs-layout">
          <aside className="agi-docs-sidebar" aria-label="Documentation navigation">
            {SIDEBAR.map((section) => (
              <div key={section.heading} className="agi-docs-sidebar-group">
                <p className="agi-docs-sidebar-heading">{section.heading}</p>
                <ul role="list">
                  {section.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className={`agi-docs-sidebar-link${section.heading === 'Get Started' && link.label === 'Welcome to AGI' ? ' active' : ''}`}
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </aside>

          <main className="agi-docs-content">
            <p className="agi-docs-breadcrumb">Get Started</p>
            <h1 className="agi-docs-h1">Welcome to AGI</h1>
            <p className="agi-docs-lead">
              AGI is a multi-surface AI workspace: one account across six surfaces, three routing
              modes (Local, BYOK, and Cloud), and a consistent API for tools, memory, and
              connectors.
            </p>

            <div className="agi-docs-cards">
              {FEATURE_CARDS.map((card) => (
                <Link key={card.href + card.title} href={card.href} className="agi-docs-card">
                  <div className="agi-docs-card-icon">{card.icon}</div>
                  <strong className="agi-docs-card-title">{card.title}</strong>
                  <p className="agi-docs-card-body">{card.body}</p>
                  <p className="agi-docs-card-cta">
                    {card.cta === COMING_SOON_LABEL ? (
                      <>{COMING_SOON_LABEL} ›</>
                    ) : (
                      <>
                        Get started with <code>{card.cta}</code> ›
                      </>
                    )}
                  </p>
                </Link>
              ))}
            </div>

            <div className="agi-docs-section">
              <p className="agi-docs-section-eyebrow">Reference</p>
              <h2 className="agi-docs-section-title">APIs, providers, and integrations.</h2>
              <div className="agi-docs-cards">
                {REFERENCE_CARDS.map((card) => (
                  <Link key={card.href + card.title} href={card.href} className="agi-docs-card">
                    <div className="agi-docs-card-icon">{card.icon}</div>
                    <strong className="agi-docs-card-title">{card.title}</strong>
                    <p className="agi-docs-card-body">{card.body}</p>
                    <p className="agi-docs-card-cta">
                      <code>{card.cta}</code> ›
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
