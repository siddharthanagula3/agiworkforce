import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Support | AGI Workforce',
  description: 'How to reach us, what response time to expect, and where to file bugs.',
  alternates: { canonical: 'https://agiworkforce.com/support' },
};

export default function SupportPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Support.</h1>
          <p className="agi-page-lede">
            We answer.{' '}
            <strong>
              Email is the canonical channel — community for free tiers, priority email for paid
              tiers, named contact + 4-hour SLA for Enterprise.
            </strong>
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">By tier</p>
          <table className="agi-ledger">
            <thead>
              <tr>
                <th>Tier</th>
                <th>Channel</th>
                <th>Target response</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Local · BYOK</td>
                <td>Community + GitHub issues</td>
                <td>Best-effort</td>
              </tr>
              <tr>
                <td>Hobby</td>
                <td>Email · contact@agiworkforce.com</td>
                <td>48 hours</td>
              </tr>
              <tr>
                <td>Pro</td>
                <td>Priority email</td>
                <td>24 hours</td>
              </tr>
              <tr>
                <td>Pro+ / Max</td>
                <td>Priority email</td>
                <td>12 / 8 hours</td>
              </tr>
              <tr>
                <td>Enterprise</td>
                <td>Named support contact, contract SLA</td>
                <td>4 hours</td>
              </tr>
            </tbody>
          </table>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Reach us</p>
          <div className="agi-cta-row">
            <a href="mailto:contact@agiworkforce.com" className="agi-cta-primary">
              Email contact@agiworkforce.com
            </a>
            <Link href="/contact" className="agi-cta-ghost">
              Contact form →
            </Link>
            <Link href="/help" className="agi-cta-ghost">
              Help index →
            </Link>
          </div>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
