import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { CONTACT_EMAIL, POLICY_LAST_UPDATED, contactMailto } from '@/lib/legal-constants';

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
            </strong>{' '}
            Last updated: {POLICY_LAST_UPDATED.refunds}.
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
                  Immediate upgrades preserve the renewal date and charge the exact prorated price
                  difference Stripe previews for the time remaining in the current period. This is
                  an invoice adjustment, not a reset or refund of already-consumed usage.
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
                <td>App Store and Play purchases</td>
                <td>
                  Subscriptions bought inside the mobile apps are charged by Apple or Google, not by
                  us. We cannot refund them. Request those through the store that took the payment;
                  its own refund rules and windows apply.
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
          <p className="agi-section-eyebrow">Statutory withdrawal rights</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            <strong>EU, UK and other consumers with a statutory cooling-off right:</strong> where
            the law gives you a right to withdraw from a distance contract within 14 days, that
            right applies and this policy does not reduce it. Note that when you ask us to start the
            service immediately, that right can be lost or reduced in proportion to what you have
            already used, which is what the law provides for. Tell us within the window and we will
            apply the statutory outcome, not the commercial one above.
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">How to request</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            Email{' '}
            <a href={contactMailto('Refund request')} style={{ color: 'var(--agi-ink)' }}>
              {CONTACT_EMAIL}
            </a>{' '}
            with the email on your account, the charge date, and a brief reason. We aim to respond
            within the support response target for your plan, published at{' '}
            <Link href="/sla" style={{ color: 'var(--agi-ink)' }}>
              /sla
            </Link>{' '}
            . This page used to promise one business day for everyone, which did not match those
            targets. Approved refunds are returned through the original payment method on the
            payment processor&rsquo;s timeline.
          </p>
          <div className="agi-cta-row">
            <a href={contactMailto('Refund request')} className="agi-cta-primary">
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
