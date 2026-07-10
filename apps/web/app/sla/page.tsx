import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata = buildMetadata({
  title: 'SLA',
  description: 'Service level agreement · uptime targets, response times, and credit terms.',
  path: '/sla',
});

export default function SlaPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">SLA.</h1>
          <p className="agi-page-lede">
            What we plan to commit to at general availability, and what happens when we miss.{' '}
            <strong>
              AGI is pre-launch: the numbers below are planned targets for paid tiers, not yet a
              binding contractual commitment. They take effect when paid plans reach general
              availability. Local + BYOK free modes run on best-effort.
            </strong>
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Planned uptime targets (at GA)</p>
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
                <td>Auth</td>
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
          <p className="agi-section-eyebrow">Planned response times by tier</p>
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
                <td>Free</td>
                <td>48 hours</td>
                <td>Email</td>
              </tr>
              <tr>
                <td>Pro</td>
                <td>24 hours</td>
                <td>Priority email</td>
              </tr>
              <tr>
                <td>Max</td>
                <td>8 hours</td>
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
          <p className="agi-section-eyebrow">Planned service credits</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            Once paid plans reach general availability, the intended policy is: if we miss the
            uptime target in a given month, paid customers can claim a service credit equal to 10%
            of the monthly fee for each 0.1% below target, capped at 50% of the monthly fee. Final
            credit terms are confirmed in your plan agreement at launch. To reach us: email{' '}
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
