import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Refund policy | AGI Workforce',
  description: 'When refunds are issued and how to request one.',
  alternates: { canonical: 'https://agiworkforce.com/refund-policy' },
};

export default function RefundPolicyPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Refunds.</h1>
          <p className="agi-page-lede">
            We don&rsquo;t make you fight for a refund.{' '}
            <strong>
              If a charge doesn&rsquo;t match expectations and you reach out within 30 days,
              we&rsquo;ll refund it. No multi-step process.
            </strong>
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">When we refund</p>
          <table className="agi-ledger">
            <tbody>
              <tr>
                <td>Hobby subscription</td>
                <td>
                  Pro-rated refund on cancellation if requested within 30 days of the most recent
                  charge. Email contact@agiworkforce.com.
                </td>
              </tr>
              <tr>
                <td>Annual Hobby</td>
                <td>
                  Pro-rated refund for unused months if requested within 30 days. After 30 days, the
                  remaining annual term stays active and does not auto-renew.
                </td>
              </tr>
              <tr>
                <td>Hobby credits</td>
                <td>
                  Unused credits are refunded at the rate paid. Credits expire 12 months after
                  purchase.
                </td>
              </tr>
              <tr>
                <td>Enterprise contracts</td>
                <td>Refund terms are part of the MSA negotiated with each customer.</td>
              </tr>
              <tr>
                <td>BYOK usage</td>
                <td>
                  Provider charges (Anthropic, OpenAI, Google, etc.) are billed directly by the
                  provider — refunds for those go through the provider, not us.
                </td>
              </tr>
            </tbody>
          </table>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">How to request</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            Email{' '}
            <a href="mailto:contact@agiworkforce.com" style={{ color: 'var(--agi-ink)' }}>
              contact@agiworkforce.com
            </a>{' '}
            with the email on your account and a brief reason. We respond within one business day
            and refund within five.
          </p>
          <div className="agi-cta-row">
            <a href="mailto:contact@agiworkforce.com" className="agi-cta-primary">
              Request a refund
            </a>
            <Link href="/terms" className="agi-cta-ghost">
              Terms of service →
            </Link>
          </div>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
