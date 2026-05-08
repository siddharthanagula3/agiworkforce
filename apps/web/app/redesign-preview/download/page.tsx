import Link from 'next/link';
import { AgiTopBar } from '../AgiTopBar';
import { AgiFooter } from '../AgiFooter';

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

export default function RedesignPreviewDownloadPage() {
  return (
    <main className="pv-shell">
      <AgiTopBar />

      <section className="pv-page-hero">
        <h1 className="pv-page-h1">Install AGI Workforce.</h1>
        <p className="pv-page-lede">
          Free. macOS, Linux, Windows. The CLI is a small Rust binary; the desktop app adds the chat
          shell on top.{' '}
          <strong>Code-signed. Reversible. Your data stays local in local mode.</strong>
        </p>
      </section>

      <section className="pv-section">
        <p className="pv-section-eyebrow">One install line</p>
        <div className="pv-terminal">
          <div className="pv-terminal-bar">~/agi-workforce — install</div>
          <pre className="pv-terminal-pre">
            <span className="pv-terminal-prompt">$</span>curl -fsSL
            https://agiworkforce.com/install.sh | sh
            {'\n'}
            <span className="pv-terminal-prompt">$</span>agiworkforce login
            {'\n'}
            <span className="pv-terminal-prompt">$</span>agiworkforce exec &quot;your first
            task&quot;
          </pre>
        </div>
      </section>

      <section className="pv-section">
        <p className="pv-section-eyebrow">Pick a path</p>
        <ul className="pv-reasons">
          <li className="pv-reason">
            <h3 className="pv-reason-h">Homebrew</h3>
            <p className="pv-reason-p">
              <code>brew install siddharthanagula3/tap/agiworkforce</code>
            </p>
          </li>
          <li className="pv-reason">
            <h3 className="pv-reason-h">cargo</h3>
            <p className="pv-reason-p">
              <code>cargo install agiworkforce-cli</code>
            </p>
          </li>
          <li className="pv-reason">
            <h3 className="pv-reason-h">npm</h3>
            <p className="pv-reason-p">
              <code>npm install -g @agiworkforce/cli</code> — joining the waitlist; use Homebrew or
              cargo until then.
            </p>
          </li>
        </ul>
      </section>

      <section className="pv-section">
        <p className="pv-section-eyebrow">Direct downloads</p>
        <table className="pv-ledger">
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
                      ? 'var(--pv-ink)'
                      : 'var(--pv-ink-quiet)',
                  }}
                >
                  {a.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="pv-section">
        <p className="pv-section-eyebrow">Before you install</p>
        <ul className="pv-reasons">
          <li className="pv-reason">
            <h3 className="pv-reason-h">Code-signed</h3>
            <p className="pv-reason-p">
              macOS DMG is signed with our Apple Developer ID D2PR62RLT4 and notarized.
            </p>
          </li>
          <li className="pv-reason">
            <h3 className="pv-reason-h">Local by default</h3>
            <p className="pv-reason-p">
              Local mode is the default on first run. No cloud, no auth, no telemetry. Your data
              stays on your machine.
            </p>
          </li>
          <li className="pv-reason">
            <h3 className="pv-reason-h">Reversible</h3>
            <p className="pv-reason-p">
              Every action the agent takes is journaled and undoable. The undo manager is built into
              the desktop app.
            </p>
          </li>
        </ul>
        <div className="pv-cta-row" style={{ marginTop: 28 }}>
          <Link href="/terms" className="pv-cta-ghost">
            Terms
          </Link>
          <Link href="/privacy" className="pv-cta-ghost">
            Privacy
          </Link>
          <Link href="/security" className="pv-cta-ghost">
            Security
          </Link>
        </div>
      </section>

      <AgiFooter />
    </main>
  );
}
