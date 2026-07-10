import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { LAUNCH, POSITIONING } from '../../lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'Trust',
  description: 'Compliance, audits, and security posture. With honest dates.',
  path: '/trust',
});

const COMPLIANCE: { item: string; status: string; note: string }[] = [
  {
    item: 'SOC 2 Type II',
    status: 'Planned',
    note: 'No audit report claimed. Evidence collection is part of the Cloud release path.',
  },
  {
    item: 'GDPR',
    status: 'In progress',
    note: 'Privacy controls, export, deletion, and subprocessors are being prepared for legal review.',
  },
  {
    item: 'CCPA',
    status: 'In progress',
    note: 'User data export and deletion paths must be verified before broad Cloud launch.',
  },
  {
    item: 'HIPAA',
    status: 'Not available',
    note: 'AGI is not a medical device and does not offer HIPAA-covered workflows today.',
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
      'Local and BYOK secrets are designed for masked display, local secure storage, and explicit provider labeling.',
  },
  {
    item: 'Tool execution',
    detail:
      'File, shell, browser, and external actions use explicit approval and sandbox paths where available.',
  },
  {
    item: 'Auth',
    detail:
      'Managed Cloud auth uses server-side route checks and secure cookie settings where enabled.',
  },
  {
    item: 'Database',
    detail:
      'Cloud data is scoped by authenticated user in server routes and database policies before broad release.',
  },
  { item: 'Transit', detail: 'HTTPS in transit on deployed surfaces.' },
  {
    item: 'Code signing',
    detail: `Desktop installers are launch-gated and will be published through verified GitHub release assets or configured signed-asset URLs. Windows public release remains aligned to ${LAUNCH.date}.`,
  },
  {
    item: 'Privacy',
    detail: POSITIONING.trustBoundary,
  },
];

export default function TrustPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-trust-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">Trust</p>
          <h1 id="agi-trust-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">Claims with dates,</span>
            <span className="agi-fl-h1-line">
              <em className="agi-fl-h1-em">nothing more.</em>
            </span>
          </h1>
          <p className="agi-fl-lede">
            Compliance, audits, and security posture. Honest dates.{' '}
            <strong>
              We claim only what we have completed. Anything else is on the roadmap with no date
              until there's a date.
            </strong>
          </p>
          <div style={{ paddingBottom: 'clamp(48px, 7vw, 88px)' }}>
            <div className="agi-fl-cta-row">
              <Link href="/security" className="agi-fl-cta agi-fl-cta--primary">
                Read the Security Details
              </Link>
              <Link href="/privacy" className="agi-fl-cta agi-fl-cta--secondary">
                Read the Privacy Policy
              </Link>
            </div>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-trust-compliance-title">
          <p className="agi-fl-eyebrow">Compliance</p>
          <h2 id="agi-trust-compliance-title" className="agi-fl-h2">
            Compliance, as it stands today.
          </h2>
          <p className="agi-fl-section-lede">
            Every line below carries its real status. When a status changes, this table changes. Not
            before.
          </p>
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

        <section className="agi-fl-section" aria-labelledby="agi-trust-security-title">
          <p className="agi-fl-eyebrow">Security posture</p>
          <h2 id="agi-trust-security-title" className="agi-fl-h2">
            How the product is held together.
          </h2>
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

        <section className="agi-fl-section" aria-labelledby="agi-trust-more-title">
          <p className="agi-fl-eyebrow">More detail</p>
          <h2 id="agi-trust-more-title" className="agi-fl-h2">
            Go deeper on any of it.
          </h2>
          <div className="agi-fl-cta-row">
            <Link href="/security" className="agi-fl-cta agi-fl-cta--primary">
              Read the Security Details
            </Link>
            <Link href="/privacy" className="agi-fl-cta agi-fl-cta--ghost">
              Read the Privacy Policy
            </Link>
            <Link href="/subprocessors" className="agi-fl-cta agi-fl-cta--ghost">
              See the Subprocessors
            </Link>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
