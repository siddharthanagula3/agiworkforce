import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Cookie policy | AGI Workforce',
  description:
    'How AGI Workforce uses cookies and similar technologies. Strictly-necessary by default; analytics opt-in.',
  alternates: { canonical: 'https://agiworkforce.com/cookies' },
};

export default function CookiesPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Cookies.</h1>
          <p className="agi-page-lede">
            We use the minimum cookies needed to keep you signed in and the site functional.{' '}
            <strong>No third-party advertising cookies.</strong> Analytics is opt-in.
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">What we set</p>
          <table className="agi-ledger">
            <thead>
              <tr>
                <th>Category</th>
                <th>Purpose</th>
                <th>Default</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Strictly necessary</td>
                <td>Auth session, CSRF token, locale preference.</td>
                <td>Always on</td>
              </tr>
              <tr>
                <td>Analytics</td>
                <td>Aggregated page-view data, no personally identifying information.</td>
                <td>Opt-in</td>
              </tr>
              <tr>
                <td>Advertising</td>
                <td>None. We do not run ads.</td>
                <td>Never</td>
              </tr>
            </tbody>
          </table>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Your choices</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            Manage cookies through your browser. Clearing cookies will sign you out of any active
            session. For data export or deletion requests, see the{' '}
            <Link href="/privacy" style={{ color: 'var(--agi-ink)' }}>
              privacy policy
            </Link>
            .
          </p>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
