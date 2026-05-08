import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'SLA | AGI Workforce',
  description: 'Service level agreement — uptime targets, response times, and credit terms.',
  alternates: { canonical: 'https://agiworkforce.com/sla' },
};

export default function SlaPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">SLA.</h1>
          <p className="agi-page-lede">
            What we commit to keep up, and what happens when we don&rsquo;t.{' '}
            <strong>
              The targets below apply to paid tiers (Hobby and above). Local + BYOK free tiers run
              on best-effort.
            </strong>
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Uptime targets</p>
          <table className="agi-ledger">
            <thead>
              <tr>
                <th>Component</th>
                <th>Target</th>
                <th>Measurement window</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Web (agiworkforce.com)</td>
                <td>99.9%</td>
                <td>Monthly</td>
              </tr>
              <tr>
                <td>API gateway</td>
                <td>99.9%</td>
                <td>Monthly</td>
              </tr>
              <tr>
                <td>Auth (Supabase)</td>
                <td>99.9%</td>
                <td>Monthly</td>
              </tr>
              <tr>
                <td>Provider passthrough</td>
                <td>Inherits provider SLA</td>
                <td>n/a</td>
              </tr>
            </tbody>
          </table>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Response times by tier</p>
          <table className="agi-ledger">
            <thead>
              <tr>
                <th>Tier</th>
                <th>First response</th>
                <th>Channel</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Hobby</td>
                <td>48 hours</td>
                <td>Email</td>
              </tr>
              <tr>
                <td>Pro</td>
                <td>24 hours</td>
                <td>Priority email</td>
              </tr>
              <tr>
                <td>Pro+ / Max</td>
                <td>12 / 8 hours</td>
                <td>Priority email</td>
              </tr>
              <tr>
                <td>Enterprise</td>
                <td>4 hours</td>
                <td>Named support contact + email</td>
              </tr>
            </tbody>
          </table>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Service credits</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            If we miss the uptime target in a given month, paid customers can claim a service
            credit. The credit equals 10% of the monthly fee for each 0.1% below target, capped at
            50% of the monthly fee. To claim: email{' '}
            <a href="mailto:contact@agiworkforce.com" style={{ color: 'var(--agi-ink)' }}>
              contact@agiworkforce.com
            </a>{' '}
            within 30 days of the incident.
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Status</p>
          <div className="agi-cta-row">
            <Link href="/status" className="agi-cta-primary">
              Live status page
            </Link>
            <Link href="/security" className="agi-cta-ghost">
              Security posture →
            </Link>
          </div>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
