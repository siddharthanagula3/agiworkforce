import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';

export const metadata = buildMetadata({
  title: 'Refund policy',
  description: 'When refunds are issued and how to request one.',
  path: '/refund-policy',
});

export default function RefundPolicyPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Refunds.</h1>
          <p className="agi-page-lede">
            We review billing problems promptly.{' '}
            <strong>
              Eligibility depends on the type of charge, account usage, applicable law, and any
              contract-specific terms.
            </strong>
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">When we refund</p>
          <table className="agi-ledger">
            <tbody>
              <tr>
                <td>Paid subscriptions</td>
                <td>
                  Cancellation stops the next renewal and access continues through the paid term.
                  Current-period charges are not automatically refunded, except where required by
                  law or when we confirm a duplicate, unauthorized, or billing-error charge.
                </td>
              </tr>
              <tr>
                <td>Plan upgrades</td>
                <td>
                  Immediate upgrades use the credit shown by Stripe for unused subscription time.
                  This is an invoice adjustment, not a reset or refund of already-consumed usage.
                </td>
              </tr>
              <tr>
                <td>Purchased usage add-ons</td>
                <td>
                  Used add-ons are not refundable. Contact support about an unused, duplicate, or
                  mistaken purchase; statutory rights still apply.
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
                  provider. Refunds for those go through the provider, not us.
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
            with the email on your account, charge date, and a brief reason. We aim to respond
            within one business day. Approved refunds are returned through the original payment
            method on the payment processor&rsquo;s timeline.
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
