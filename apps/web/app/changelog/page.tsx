import type { Metadata } from 'next';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { LAUNCH } from '../../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'Changelog',
  description: `A dated archive of what shipped and what is aligned to the public release.`,
  alternates: { canonical: '/changelog' },
  openGraph: {
    title: 'Changelog',
    description: 'A dated archive of what shipped. Honest about what has not.',
    type: 'website',
    url: 'https://agiworkforce.com/changelog',
  },
};

interface Release {
  date: string;
  headline: string;
  body: string[];
}

const RELEASES: Release[] = [
  {
    date: '2026-05-08',
    headline: 'Marketing site redesign · live',
    body: [
      'Site-wide redesign on the new dark theme. Same surface across every marketing route.',
      'Single typeface (Geist Sans), 12-spoke brand mark, single amber accent used surgically.',
      'No version numbers, no model IDs, no vanity counts in marketing copy. /changelog is the explicit exception.',
    ],
  },
  {
    date: '2026-05-04',
    headline: 'OpenClaw porting · complete',
    body: [
      'Provider adapter interface stable. Anthropic, OpenAI, Ollama, Google adapters live.',
      'MCP transport and skills loader landed. Hook events parity in the Rust CLI. Live cross-provider demo runs through the API gateway.',
    ],
  },
  {
    date: '2026-05-03',
    headline: 'CLI v1.0 · live',
    body: [
      'Pure Rust binary on five platforms. GitHub Release, Homebrew tap auto-generated, install.sh tested.',
      'Cleanup pass: removed ~70 codex-rs port crates and a large net of dead code. Audit closed most P0/P1 items.',
    ],
  },
  {
    date: '2026-02 to 2026-05',
    headline: 'Desktop · early releases',
    body: [
      `Tauri + React desktop with release signing and installer publishing aligned to the public release path.`,
      'Public download links open only after verified GitHub release assets or configured signed-asset URLs are available.',
    ],
  },
];

const FORTHCOMING: { item: string; detail: string; quarter: string }[] = [
  { item: 'Mobile', detail: 'App Store + Play Store listings.', quarter: LAUNCH.shortLabel },
  {
    item: 'Chrome extension',
    detail: 'CWS submission once visual review clears.',
    quarter: LAUNCH.shortLabel,
  },
  {
    item: 'VS Code extension',
    detail: 'Marketplace listing planned for public launch.',
    quarter: LAUNCH.shortLabel,
  },
];

export default function ChangelogPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Changelog.</h1>
          <p className="agi-page-lede">
            Every shipped feature is dated. Every &ldquo;in progress&rdquo; item is named openly.
            <strong>
              {' '}
              We do not backdate, we do not pre-announce, and we do not list things we are not
              actively maintaining.
            </strong>
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Releases, newest first</p>
          <table className="agi-ledger">
            <tbody>
              {RELEASES.map((r) => (
                <tr key={r.date}>
                  <td style={{ width: '20%', verticalAlign: 'top' }}>{r.date}</td>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--agi-ink)', marginBottom: 6 }}>
                      {r.headline}
                    </div>
                    {r.body.map((line, idx) => (
                      <p
                        key={idx}
                        style={{
                          margin: idx === 0 ? '0' : '8px 0 0',
                          color: 'var(--agi-ink-2)',
                          fontSize: 14,
                          lineHeight: 1.55,
                        }}
                      >
                        {line}
                      </p>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Forthcoming</p>
          <table className="agi-ledger">
            <thead>
              <tr>
                <th>Item</th>
                <th>Status</th>
                <th>Target</th>
              </tr>
            </thead>
            <tbody>
              {FORTHCOMING.map((f) => (
                <tr key={f.item}>
                  <td style={{ width: '25%' }}>{f.item}</td>
                  <td>{f.detail}</td>
                  <td style={{ width: '15%', color: 'var(--agi-ink-quiet)' }}>{f.quarter}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
