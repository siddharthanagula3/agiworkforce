import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Trust | AGI Workforce',
  description: 'Compliance, audits, and security posture — with honest dates.',
  alternates: { canonical: 'https://agiworkforce.com/trust' },
};

const COMPLIANCE: { item: string; status: string; note: string }[] = [
  {
    item: 'SOC 2 Type II',
    status: 'In progress',
    note: 'Audit initiated. Evidence collection underway.',
  },
  {
    item: 'GDPR',
    status: 'Compliant',
    note: 'DPA available on request. Standard Contractual Clauses on Enterprise contracts.',
  },
  { item: 'CCPA', status: 'Compliant', note: 'Data export and deletion supported.' },
  {
    item: 'HIPAA',
    status: 'On request',
    note: 'BAA available for qualifying Enterprise customers. Not HIPAA-certified.',
  },
  {
    item: 'ISO 27001',
    status: 'On the roadmap',
    note: 'No date claimed. Will list date once we commit.',
  },
];

const SECURITY: { item: string; detail: string }[] = [
  {
    item: 'Key storage',
    detail:
      'AES-256-GCM encryption at rest, with Argon2id key derivation. Master password unrecoverable by design.',
  },
  {
    item: 'Tool execution',
    detail:
      'macOS Seatbelt + Linux bwrap sandbox by default for dangerous tools. Per-tool permission model.',
  },
  {
    item: 'Auth',
    detail:
      'Supabase auth, JWT cookies with strict same-site, CSRF tokens on state-changing endpoints.',
  },
  {
    item: 'Database',
    detail: 'Row-level security on every table. Service-role keys never used on user-data paths.',
  },
  { item: 'Transit', detail: 'TLS 1.3 everywhere. HSTS preload.' },
  {
    item: 'Code signing',
    detail:
      'macOS DMG signed with Apple Developer ID D2PR62RLT4 and notarized. Windows EV cert pending.',
  },
  {
    item: 'Privacy',
    detail: 'We do not train on customer data. Local mode never sends prompts off your machine.',
  },
];

export default function TrustPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Trust.</h1>
          <p className="agi-page-lede">
            Compliance, audits, and security posture — with honest dates.{' '}
            <strong>
              We claim only what we have completed. Anything else is on the roadmap with no date
              until there&rsquo;s a date.
            </strong>
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Compliance</p>
          <table className="agi-ledger">
            <thead>
              <tr>
                <th>Item</th>
                <th>Status</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {COMPLIANCE.map((c) => (
                <tr key={c.item}>
                  <td style={{ width: '24%' }}>{c.item}</td>
                  <td style={{ width: '20%', color: 'var(--agi-ink)', fontWeight: 500 }}>
                    {c.status}
                  </td>
                  <td>{c.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Security posture</p>
          <table className="agi-ledger">
            <tbody>
              {SECURITY.map((s) => (
                <tr key={s.item}>
                  <td style={{ width: '22%' }}>{s.item}</td>
                  <td>{s.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">More detail</p>
          <div className="agi-cta-row">
            <Link href="/security" className="agi-cta-primary">
              Security details
            </Link>
            <Link href="/privacy" className="agi-cta-ghost">
              Privacy policy →
            </Link>
            <Link href="/subprocessors" className="agi-cta-ghost">
              Subprocessors →
            </Link>
          </div>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
