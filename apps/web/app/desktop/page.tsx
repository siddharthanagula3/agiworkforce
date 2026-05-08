import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Desktop — The native AGI Workforce app | AGI Workforce',
  description:
    'A small Rust binary that runs every provider natively. Local mode runs Ollama or LM Studio without ever touching the cloud. Cloud mode brings BYOK and Realtime cross-device sync.',
  alternates: { canonical: 'https://agiworkforce.com/desktop' },
};

const SPECS: { k: string; v: string }[] = [
  { k: 'Engine', v: 'Pure Rust, Tauri' },
  { k: 'Size', v: '~35 MB installed' },
  { k: 'Modes', v: 'Local · Cloud (BYOK or managed)' },
  { k: 'Storage', v: 'SQLite local · Supabase cloud' },
  { k: 'Computer use', v: 'Browser · files · terminal · screen' },
  { k: 'MCP plugins', v: 'stdio · SSE · streamable HTTP' },
  { k: 'Skills', v: 'Markdown + frontmatter, layered precedence' },
  { k: 'Code signing', v: 'Apple Developer ID D2PR62RLT4' },
];

export default function DesktopPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">The native desktop.</h1>
          <p className="agi-page-lede">
            A small Rust binary that runs every provider natively. Local mode runs Ollama or LM
            Studio without ever touching the cloud. Cloud mode brings BYOK and Realtime cross-device
            sync.{' '}
            <strong>
              Not Electron. Not a wrapper around a website. The chat is the desktop app.
            </strong>
          </p>
          <div className="agi-cta-row">
            <Link href="/download" className="agi-cta-primary">
              Download
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
                Universal DMG, signed with our Apple Developer ID. Both Apple Silicon and Intel.
              </p>
              <Link href="/download" className="agi-cta-ghost" style={{ marginTop: 4 }}>
                Download →
              </Link>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Linux</h3>
              <p className="agi-reason-p">AppImage. Drop it anywhere on your path and run.</p>
              <Link href="/download" className="agi-cta-ghost" style={{ marginTop: 4 }}>
                Download →
              </Link>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Windows</h3>
              <p className="agi-reason-p">
                EXE shipping once the EV certificate clears. Use the AppImage under WSL until then.
              </p>
              <span className="agi-cta-ghost" style={{ marginTop: 4, opacity: 0.7 }}>
                On the waitlist
              </span>
            </li>
          </ul>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
