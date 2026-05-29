import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { LAUNCH, POSITIONING } from '../../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'Desktop — The native AGI app',
  description: `The native AGI desktop app for Local, BYOK, and invited Cloud. ${POSITIONING.wedge} ${LAUNCH.publicLabel}.`,
  alternates: { canonical: 'https://agiworkforce.com/desktop' },
};

const SPECS: { k: string; v: string }[] = [
  { k: 'Engine', v: 'Pure Rust, Tauri' },
  { k: 'Size', v: '~35 MB installed' },
  { k: 'Modes', v: 'Local · BYOK · Cloud invite' },
  { k: 'Storage', v: 'SQLite local · optional cloud sync' },
  { k: 'Computer use', v: 'Browser · files · terminal · screen' },
  { k: 'MCP plugins', v: 'stdio · SSE · streamable HTTP' },
  { k: 'Skills', v: 'Markdown + frontmatter, layered precedence' },
  { k: 'Code signing', v: 'Apple Developer ID D2PR62RLT4' },
  { k: 'Launch', v: LAUNCH.date },
];

export default function DesktopPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <p className="agi-section-eyebrow" style={{ marginBottom: 12 }}>
            {LAUNCH.publicLabel}
          </p>
          <h1 className="agi-page-h1">The native desktop for every model.</h1>
          <p className="agi-page-lede">
            Desktop is the local compute host, BYOK vault, browser bridge, file bridge, and Cloud
            invite gateway. Local mode keeps work on the machine. BYOK routes only to selected
            providers. Cloud unlocks hosted sync by invite.{' '}
            <strong>{POSITIONING.trustBoundary}</strong>
          </p>
          <div className="agi-cta-row">
            <Link href="/download" className="agi-cta-primary">
              {LAUNCH.ctaLabel}
            </Link>
            <Link href="/local" className="agi-cta-ghost">
              Run it offline →
            </Link>
          </div>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">What&rsquo;s inside</p>
          <table className="agi-ledger">
            <tbody>
              {SPECS.map((s) => (
                <tr key={s.k}>
                  <td>{s.k}</td>
                  <td>{s.v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Available for</p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">macOS</h3>
              <p className="agi-reason-p">
                Universal DMG for Apple Silicon and Intel, signed with Apple Developer ID
                D2PR62RLT4.
              </p>
              <Link href="/download" className="agi-cta-ghost" style={{ marginTop: 4 }}>
                Download →
              </Link>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Linux</h3>
              <p className="agi-reason-p">
                AppImage for modern Linux distributions. Drop it anywhere on your path and run.
              </p>
              <Link href="/download" className="agi-cta-ghost" style={{ marginTop: 4 }}>
                Download →
              </Link>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Windows</h3>
              <p className="agi-reason-p">
                Windows joins the same public launch date with installer, CLI, and desktop bridge
                messaging aligned around Local, BYOK, and invited Cloud.
              </p>
              <Link href="/download" className="agi-cta-ghost" style={{ marginTop: 4 }}>
                Get launch access →
              </Link>
            </li>
          </ul>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
