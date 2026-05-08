import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Security | AGI Workforce',
  description: 'How AGI Workforce protects your keys, your data, and your tool execution.',
  alternates: { canonical: 'https://agiworkforce.com/security' },
};

export default function SecurityPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Security.</h1>
          <p className="agi-page-lede">
            Our operational posture in plain language.{' '}
            <strong>
              Keys are encrypted on your device. Tools are sandboxed. Your data is RLS-isolated. We
              do not train on what you write.
            </strong>{' '}
            For the dated compliance status, see{' '}
            <Link href="/trust" style={{ color: 'var(--agi-ink)' }}>
              /trust
            </Link>
            .
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Keys</p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">Encrypted at rest</h3>
              <p className="agi-reason-p">
                BYOK API keys are encrypted with AES-256-GCM, with Argon2id key derivation from your
                master password. Stored in your OS keychain or a SQLCipher database, never in
                plaintext.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Master password is yours</h3>
              <p className="agi-reason-p">
                We do not have your master password. We cannot recover your encrypted keys if you
                lose it. Back it up.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Direct provider traffic</h3>
              <p className="agi-reason-p">
                In BYOK mode, your request goes from your client to the provider. We do not proxy,
                inspect, or log model calls.
              </p>
            </li>
          </ul>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Tools</p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">Sandboxed by default</h3>
              <p className="agi-reason-p">
                Dangerous tools (file write, shell, network) run inside a sandbox: macOS Seatbelt or
                Linux bwrap. Per-tool permission model with explicit deny-lists.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Audit trail</h3>
              <p className="agi-reason-p">
                Every tool call is journaled with timestamps. Sessions are replayable. Enterprise
                customers can export the audit log to their SIEM.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Approval flow</h3>
              <p className="agi-reason-p">
                Sensitive operations (file writes outside the sandbox, credential reads) require
                explicit user approval. No silent escalation.
              </p>
            </li>
          </ul>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Data</p>
          <table className="agi-ledger">
            <tbody>
              <tr>
                <td>Database</td>
                <td>
                  Supabase Postgres in us-east-2. Row-level security on every table; service-role
                  keys never used on user-data paths.
                </td>
              </tr>
              <tr>
                <td>Local storage</td>
                <td>Local mode uses SQLite on disk. SQLCipher available for at-rest encryption.</td>
              </tr>
              <tr>
                <td>In transit</td>
                <td>TLS 1.3 end-to-end. HSTS preload.</td>
              </tr>
              <tr>
                <td>Auth</td>
                <td>
                  Supabase auth, JWT cookies (HttpOnly, SameSite=Strict). CSRF tokens on
                  state-changing endpoints.
                </td>
              </tr>
              <tr>
                <td>Code signing</td>
                <td>
                  macOS DMG signed with Apple Developer ID D2PR62RLT4 and notarized. Windows EV cert
                  pending.
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Practices</p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">Code review</h3>
              <p className="agi-reason-p">
                Every change reviewed. Strict lint rules in Rust (no <code>unsafe_code</code>) and
                across the TypeScript surface.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Continuous scanning</h3>
              <p className="agi-reason-p">
                Automated dependency and vulnerability scans on every build. Cargo audit on the Rust
                workspace.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Incident response</h3>
              <p className="agi-reason-p">
                Documented runbook. We post incidents on{' '}
                <Link href="/status" style={{ color: 'var(--agi-ink)' }}>
                  /status
                </Link>{' '}
                and notify affected customers within 24 hours of confirmation.
              </p>
            </li>
          </ul>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Report a vulnerability</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            Email{' '}
            <a href="mailto:contact@agiworkforce.com" style={{ color: 'var(--agi-ink)' }}>
              contact@agiworkforce.com
            </a>{' '}
            with the subject line &ldquo;security&rdquo;. We respond within one business day. We
            don&rsquo;t prosecute good-faith research.
          </p>
          <div className="agi-cta-row" style={{ marginTop: 28 }}>
            <Link href="/trust" className="agi-cta-primary">
              Compliance posture
            </Link>
            <Link href="/byok" className="agi-cta-ghost">
              BYOK details →
            </Link>
            <Link href="/privacy" className="agi-cta-ghost">
              Privacy policy →
            </Link>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
