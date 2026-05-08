import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Download — Install AGI Workforce | AGI Workforce',
  description:
    'Free. macOS, Linux, Windows. The CLI is a small Rust binary; the desktop app adds the chat shell on top. Code-signed, reversible, local by default.',
  alternates: { canonical: 'https://agiworkforce.com/download' },
};

const ARTIFACTS: { platform: string; format: string; status: string }[] = [
  {
    platform: 'macOS (Apple Silicon + Intel)',
    format: 'DMG, signed Apple Developer ID D2PR62RLT4',
    status: 'Shipping',
  },
  { platform: 'Linux (any distro)', format: 'AppImage', status: 'Shipping' },
  { platform: 'Windows', format: 'EXE', status: 'EV cert pending — on the waitlist' },
  { platform: 'CLI (every platform)', format: 'Rust binary, ~5.7 MB on arm64', status: 'Shipping' },
];

export default function DownloadPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Install AGI Workforce.</h1>
          <p className="agi-page-lede">
            Free. macOS, Linux, Windows. The CLI is a small Rust binary; the desktop app adds the
            chat shell on top.{' '}
            <strong>Code-signed. Reversible. Your data stays local in local mode.</strong>
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">One install line</p>
          <div className="agi-terminal">
            <div className="agi-terminal-bar">~/agi-workforce — install</div>
            <pre className="agi-terminal-pre">
              <span className="agi-terminal-prompt">$</span>curl -fsSL
              https://agiworkforce.com/install.sh | sh
              {'\n'}
              <span className="agi-terminal-prompt">$</span>agiworkforce login
              {'\n'}
              <span className="agi-terminal-prompt">$</span>agiworkforce exec &quot;your first
              task&quot;
            </pre>
          </div>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Pick a path</p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">Homebrew</h3>
              <p className="agi-reason-p">
                <code>brew install siddharthanagula3/tap/agiworkforce</code>
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">cargo</h3>
              <p className="agi-reason-p">
                <code>cargo install agiworkforce-cli</code>
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">npm</h3>
              <p className="agi-reason-p">
                <code>npm install -g @agiworkforce/cli</code> — joining the waitlist; use Homebrew
                or cargo until then.
              </p>
            </li>
          </ul>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Direct downloads</p>
          <table className="agi-ledger">
            <thead>
              <tr>
                <th>Platform</th>
                <th>Format</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {ARTIFACTS.map((a) => (
                <tr key={a.platform}>
                  <td style={{ width: '30%' }}>{a.platform}</td>
                  <td>{a.format}</td>
                  <td
                    style={{
                      color: a.status.startsWith('Shipping')
                        ? 'var(--agi-ink)'
                        : 'var(--agi-ink-quiet)',
                    }}
                  >
                    {a.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Before you install</p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">Code-signed</h3>
              <p className="agi-reason-p">
                macOS DMG is signed with our Apple Developer ID D2PR62RLT4 and notarized.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Local by default</h3>
              <p className="agi-reason-p">
                Local mode is the default on first run. No cloud, no auth, no telemetry. Your data
                stays on your machine.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Reversible</h3>
              <p className="agi-reason-p">
                Every action the agent takes is journaled and undoable. The undo manager is built
                into the desktop app.
              </p>
            </li>
          </ul>
          <div className="agi-cta-row" style={{ marginTop: 28 }}>
            <Link href="/terms" className="agi-cta-ghost">
              Terms
            </Link>
            <Link href="/privacy" className="agi-cta-ghost">
              Privacy
            </Link>
            <Link href="/security" className="agi-cta-ghost">
              Security
            </Link>
          </div>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
