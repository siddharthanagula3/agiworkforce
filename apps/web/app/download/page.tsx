import type { Metadata } from 'next';
import Link from 'next/link';
import { Code2, Globe2, Monitor, Smartphone, TerminalSquare, type LucideIcon } from 'lucide-react';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { LAUNCH, POSITIONING } from '../../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'Download AGI — All AGI Apps',
  description: `Download and join the AGI app suite across Website, Mobile, Desktop, CLI, Chrome, and VS Code. ${POSITIONING.wedge} ${LAUNCH.publicLabel}.`,
  alternates: { canonical: 'https://agiworkforce.com/download' },
};

type Surface = {
  title: string;
  icon: LucideIcon;
  body: string;
  bullets: string[];
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  status: string;
};

const SURFACES: Surface[] = [
  {
    title: 'Website',
    icon: Globe2,
    body: 'Use AGI in the browser with subscription-backed chat, projects, artifacts, usage, billing, and account settings.',
    bullets: ['Subscription web chat', 'Projects and artifacts', 'Usage and billing controls'],
    primaryLabel: 'Open web app',
    primaryHref: '/chat',
    secondaryLabel: 'See website features',
    secondaryHref: '/business',
    status: 'Available in browser',
  },
  {
    title: 'Mobile',
    icon: Smartphone,
    body: 'Use AGI on iOS and Android for local chat, voice, approvals, share previews, and Cloud Managed invite access.',
    bullets: ['iOS and Android', 'Local chat and voice', 'Cloud invite waitlist'],
    primaryLabel: 'Join mobile list',
    primaryHref: '/mobile',
    secondaryLabel: 'Mobile legal',
    secondaryHref: '/mobile/legal',
    status: 'Local + Cloud invite',
  },
  {
    title: 'Desktop',
    icon: Monitor,
    body: 'The local AGI host for chat, local models, BYOK keys, computer use, and cowork tasks in one shell.',
    bullets: ['macOS, Windows, Linux', 'Local and BYOK modes', 'Chat and cowork together'],
    primaryLabel: 'Desktop details',
    primaryHref: '/desktop',
    secondaryLabel: 'Desktop details',
    secondaryHref: '/desktop',
    status: LAUNCH.publicLabel,
  },
  {
    title: 'CLI',
    icon: TerminalSquare,
    body: 'Run AGI from the terminal for repo-aware coding, permissioned tools, model routing, and local sessions.',
    bullets: ['Terminal agent', 'Permission modes', 'Local workspace scope'],
    primaryLabel: 'CLI install guide',
    primaryHref: '/cli',
    secondaryLabel: 'AGI Code',
    secondaryHref: '/agi-code',
    status: 'Developer preview',
  },
  {
    title: 'Chrome',
    icon: Globe2,
    body: 'Bring AGI into the browser side panel for page-aware chat, capture, and permissioned browser actions.',
    bullets: ['Side panel', 'Ask and act modes', 'Site permissions'],
    primaryLabel: 'Chrome extension',
    primaryHref: '/chrome-extension',
    secondaryLabel: 'Connectors',
    secondaryHref: '/apps',
    status: 'Desktop-bridge scoped',
  },
  {
    title: 'VS Code',
    icon: Code2,
    body: 'Use AGI inside the editor for chat, edits, review, terminal handoff, and effort-aware coding sessions.',
    bullets: ['Editor sidebar', 'Diff review', 'Terminal handoff'],
    primaryLabel: 'VS Code extension',
    primaryHref: '/vscode-extension',
    secondaryLabel: 'Compare Code',
    secondaryHref: '/compare/codex',
    status: 'Developer preview',
  },
];

const DESKTOP_DOWNLOADS = [
  {
    platform: 'macOS',
    detail: 'Signed installer route opens when release assets are available',
    href: '/desktop',
    action: 'Check availability',
  },
  {
    platform: 'Windows',
    detail: 'Installer route opens when release assets are available',
    href: '/api/download?platform=windows',
    action: 'Check availability',
  },
  {
    platform: 'Linux',
    detail: 'AppImage or package route opens when release assets are available',
    href: '/api/download?platform=linux',
    action: 'Check availability',
  },
];

export default function DownloadPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <p className="agi-section-eyebrow" style={{ marginBottom: 12 }}>
            {LAUNCH.publicLabel} · six surfaces
          </p>
          <h1 className="agi-page-h1">Do more with AGI, everywhere you work.</h1>
          <p className="agi-page-lede">
            One product suite across Website, Mobile, Desktop, CLI, Chrome, and VS Code. AGI keeps
            the same core promise on every surface: <strong>{POSITIONING.trustBoundary}</strong>
          </p>
          <div className="agi-cta-row">
            <Link href="/get-started" className="agi-cta-primary">
              Get started
            </Link>
            <Link href="/apps" className="agi-cta-ghost">
              View apps and connectors
            </Link>
          </div>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Surfaces</p>
          <div className="agi-route-grid">
            {SURFACES.map((surface) => {
              const Icon = surface.icon;
              return (
                <article className="agi-route-card" key={surface.title}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 16,
                    }}
                  >
                    <span className="agi-route-meta">{surface.status}</span>
                    <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                  </div>
                  <h2 className="agi-route-title">{surface.title}</h2>
                  <p className="agi-route-body">{surface.body}</p>
                  <ul className="agi-route-body" style={{ paddingLeft: 18, marginBottom: 0 }}>
                    {surface.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                  <div className="agi-cta-row" style={{ marginTop: 'auto', paddingTop: 22 }}>
                    <Link href={surface.primaryHref} className="agi-cta-primary">
                      {surface.primaryLabel}
                    </Link>
                    {surface.secondaryHref && surface.secondaryLabel && (
                      <Link href={surface.secondaryHref} className="agi-cta-ghost">
                        {surface.secondaryLabel}
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Desktop installers</p>
          <table className="agi-ledger">
            <thead>
              <tr>
                <th>Platform</th>
                <th>What it installs</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {DESKTOP_DOWNLOADS.map((download) => (
                <tr key={download.platform}>
                  <td style={{ width: '24%' }}>{download.platform}</td>
                  <td>{download.detail}</td>
                  <td>
                    <a className="agi-cta-ghost" href={download.href}>
                      {download.action}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Terminal</p>
          <div className="agi-terminal">
            <div className="agi-terminal-bar">~/agi-workforce — install</div>
            <pre className="agi-terminal-pre">
              <span className="agi-terminal-prompt">$ </span>curl -fsSL
              https://agiworkforce.com/install.sh | sh
              {'\n'}
              <span className="agi-terminal-prompt">$ </span>agi login
              {'\n'}
              <span className="agi-terminal-prompt">$ </span>agi exec &quot;review this repo&quot;
            </pre>
          </div>
        </section>

        <section className="agi-section">
          <div className="agi-launch-cta">
            <div>
              <h2 className="agi-launch-title">
                Choose local, BYOK, or managed cloud deliberately.
              </h2>
              <p className="agi-launch-body">
                Desktop and CLI are the local execution anchors. Website uses subscription-backed
                app chat. Mobile is Local plus Cloud invite. Chrome and VS Code stay scoped to
                browser and workspace tasks unless the user explicitly hands off context.
              </p>
            </div>
            <Link href="/compare" className="agi-cta-primary">
              Compare surfaces
            </Link>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
