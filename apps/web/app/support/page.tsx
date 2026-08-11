import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';

export const metadata = buildMetadata({
  title: 'Support',
  description:
    'How to reach us today, where to report bugs, and what support looks like across every tier.',
  path: '/support',
});

const SUPPORT_ROWS: { tier: string; status: string; channel: string; expectation: string }[] = [
  {
    tier: 'Local · BYOK',
    status: 'Available now',
    channel: 'Email · contact@agiworkforce.com',
    expectation: 'Best-effort reply from a human',
  },
  {
    tier: 'Basic · Pro · Max',
    status: 'Available now',
    channel: 'Email · contact@agiworkforce.com',
    expectation: 'Best-effort reply from a human, no published response-time SLA yet',
  },
  {
    tier: 'Enterprise',
    status: 'In scoping',
    channel: 'Named contact, planned',
    expectation: 'SLA defined per contract during scoping',
  },
];

export default function SupportPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-support-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">Support</p>
          <h1 id="agi-support-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">We read</span>{' '}
            <span className="agi-fl-h1-line">
              <em className="agi-fl-h1-em">every email.</em>
            </span>
          </h1>
          <p className="agi-fl-lede">
            Email is the canonical channel today, for everyone. Managed cloud is public alpha and
            paid Team &amp; Enterprise SLAs are still firming up, so we don&rsquo;t publish
            response-time promises yet. What is planned is labeled as planned.
          </p>
          <div style={{ paddingBottom: 'clamp(48px, 7vw, 88px)' }}>
            <div className="agi-fl-cta-row">
              <a href="mailto:contact@agiworkforce.com" className="agi-fl-cta agi-fl-cta--primary">
                Email contact@agiworkforce.com
              </a>
              <Link href="/help" className="agi-fl-cta agi-fl-cta--ghost">
                Browse the Help Index
              </Link>
            </div>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-support-tiers-title">
          <p className="agi-fl-eyebrow">By tier</p>
          <h2 id="agi-support-tiers-title" className="agi-fl-h2">
            What you can count on, by tier.
          </h2>
          <p className="agi-fl-section-lede">
            One honest table. The free paths get a human on email today; commitments for paid tiers
            arrive with the tiers themselves.
          </p>
          <table className="agi-ledger">
            <thead>
              <tr>
                <th>Tier</th>
                <th>Status</th>
                <th>Channel</th>
                <th>What to expect</th>
              </tr>
            </thead>
            <tbody>
              {SUPPORT_ROWS.map((row) => (
                <tr key={row.tier}>
                  <td>{row.tier}</td>
                  <td>{row.status}</td>
                  <td>{row.channel}</td>
                  <td>{row.expectation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-support-bugs-title">
          <p className="agi-fl-eyebrow">Bugs &amp; incidents</p>
          <h2 id="agi-support-bugs-title" className="agi-fl-h2">
            Found something broken?
          </h2>
          <p className="agi-fl-section-lede">
            Tell us what you did, what you expected, and what happened instead. Screenshots and
            exact error text make fixes faster. For service-wide issues, check the status page
            first.
          </p>
          <div className="agi-fl-cta-row">
            <a href="mailto:contact@agiworkforce.com" className="agi-fl-cta agi-fl-cta--primary">
              Email a Bug Report
            </a>
            <Link href="/status" className="agi-fl-cta agi-fl-cta--secondary">
              Check Service Status
            </Link>
            <Link href="/contact" className="agi-fl-cta agi-fl-cta--ghost">
              Open the Contact Page
            </Link>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
