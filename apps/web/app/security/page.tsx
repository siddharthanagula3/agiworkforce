import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata = buildMetadata({
  title: 'Security',
  description: 'How AGI protects your keys, your data, and your tool execution.',
  path: '/security',
});

const KEYS: { title: string; body: string }[] = [
  {
    title: 'Encrypted at rest',
    body: 'BYOK key handling is designed around local secret storage, masked display, and no plaintext logging. Public surfaces must keep provider labels and route boundaries visible before a request leaves the device.',
  },
  {
    title: 'Master password is yours',
    body: 'Local secret recovery is intentionally limited. If a local key store depends on a master password or OS secure storage, AGI should not be able to recover that secret for you.',
  },
  {
    title: 'Direct provider traffic',
    body: 'On supported BYOK surfaces, direct-provider calls are kept separate from AGI Cloud and labeled with the chosen provider before use.',
  },
];

const TOOLS: { title: string; body: string }[] = [
  {
    title: 'Sandboxed by default',
    body: 'File, shell, network, and browser actions are routed through explicit permission and sandbox paths where available. No destructive action should run without visible scope.',
  },
  {
    title: 'Audit trail',
    body: 'Tool activity is designed to be journaled with timestamps and visible summaries so you can understand what happened during a session.',
  },
  {
    title: 'Approval flow',
    body: 'Sensitive operations such as file writes, credential access, external actions, and expensive compute require explicit user approval. No silent escalation.',
  },
];

const DATA_ROWS: { k: string; v: string }[] = [
  {
    k: 'Database',
    v: 'Managed Cloud data is scoped by authenticated user in server routes and database policies. Broad Cloud release remains gated until audits are complete.',
  },
  {
    k: 'Local storage',
    v: 'Local mode uses SQLite on disk. SQLCipher available for at-rest encryption.',
  },
  { k: 'In transit', v: 'HTTPS in transit on deployed surfaces.' },
  {
    k: 'Auth',
    v: 'Managed auth uses server-side route checks and secure cookie settings where enabled. State-changing endpoints should keep CSRF and ownership checks.',
  },
  {
    k: 'Code signing',
    v: 'Desktop installers are launch-gated. When public builds ship, they will be published only through verified GitHub releases or configured signed-asset URLs, with Windows EV signing planned as part of that release path.',
  },
];

export default function SecurityPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-security-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">Security</p>
          <h1 id="agi-security-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">Separate routes,</span>
            <span className="agi-fl-h1-line">
              <em className="agi-fl-h1-em">visible approvals.</em>
            </span>
          </h1>
          <p className="agi-fl-lede">
            Our operational posture in plain language.{' '}
            <strong>
              AGI separates Local, BYOK, and Cloud paths. Sensitive tool actions use visible
              approvals. Managed Cloud remains gated until operational controls are proven.
            </strong>{' '}
            For the dated compliance status, see{' '}
            <Link href="/trust" style={{ color: 'var(--agi-ink)' }}>
              /trust
            </Link>
            .
          </p>
          <div style={{ paddingBottom: 'clamp(48px, 7vw, 88px)' }}>
            <div className="agi-fl-cta-row">
              <a href="#report" className="agi-fl-cta agi-fl-cta--primary">
                Report a Vulnerability
              </a>
              <Link href="/trust" className="agi-fl-cta agi-fl-cta--secondary">
                See Compliance Status
              </Link>
            </div>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-security-keys-title">
          <p className="agi-fl-eyebrow">Keys</p>
          <h2 id="agi-security-keys-title" className="agi-fl-h2">
            How AGI treats your keys.
          </h2>
          <ul className="agi-reasons">
            {KEYS.map((item) => (
              <li key={item.title} className="agi-reason">
                <h3 className="agi-reason-h">{item.title}</h3>
                <p className="agi-reason-p">{item.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-security-tools-title">
          <p className="agi-fl-eyebrow">Tools</p>
          <h2 id="agi-security-tools-title" className="agi-fl-h2">
            Tool execution stays in view.
          </h2>
          <ul className="agi-reasons">
            {TOOLS.map((item) => (
              <li key={item.title} className="agi-reason">
                <h3 className="agi-reason-h">{item.title}</h3>
                <p className="agi-reason-p">{item.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-security-data-title">
          <p className="agi-fl-eyebrow">Data</p>
          <h2 id="agi-security-data-title" className="agi-fl-h2">
            Where your data lives.
          </h2>
          <table className="agi-ledger">
            <tbody>
              {DATA_ROWS.map((row) => (
                <tr key={row.k}>
                  <td>{row.k}</td>
                  <td>{row.v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-security-practices-title">
          <p className="agi-fl-eyebrow">Practices</p>
          <h2 id="agi-security-practices-title" className="agi-fl-h2">
            Engineering practices behind releases.
          </h2>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">Code review</h3>
              <p className="agi-reason-p">
                Changes are expected to pass repo guardrails, type checks, lint checks, and focused
                tests before public release.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Continuous scanning</h3>
              <p className="agi-reason-p">
                The release path includes dependency, vulnerability, and Rust workspace checks.
                Results must be treated as release evidence, not as marketing claims.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Incident response</h3>
              <p className="agi-reason-p">
                Security reports go through the support channel. Public incident process and status
                reporting live on{' '}
                <Link href="/status" style={{ color: 'var(--agi-ink)' }}>
                  /status
                </Link>
                .
              </p>
            </li>
          </ul>
        </section>

        <section id="report" className="agi-fl-section" aria-labelledby="agi-security-report-title">
          <p className="agi-fl-eyebrow">Report a vulnerability</p>
          <h2 id="agi-security-report-title" className="agi-fl-h2">
            Found something? Tell us directly.
          </h2>
          <p className="agi-fl-section-lede">
            Email{' '}
            <a href="mailto:contact@agiworkforce.com" style={{ color: 'var(--agi-ink)' }}>
              contact@agiworkforce.com
            </a>{' '}
            with the subject line “security”. Include the affected surface, steps to reproduce, and
            any relevant logs or screenshots.
          </p>
          <div className="agi-fl-cta-row">
            <Link href="/trust" className="agi-fl-cta agi-fl-cta--primary">
              See Compliance Posture
            </Link>
            <Link href="/byok" className="agi-fl-cta agi-fl-cta--ghost">
              Read the BYOK Details
            </Link>
            <Link href="/privacy" className="agi-fl-cta agi-fl-cta--ghost">
              Read the Privacy Policy
            </Link>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
