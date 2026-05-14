import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Payment issue | AGI Workforce',
  description: 'Something went wrong with your payment. Here is how to resolve it.',
};

export default function PaymentFailurePage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Payment didn&rsquo;t go through.</h1>
          <p className="agi-page-lede">
            Your card was declined or the charge was canceled.{' '}
            <strong>
              No subscription was created and you weren&rsquo;t charged. Try a different payment
              method or email us if it keeps happening.
            </strong>
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Common reasons</p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">Card declined</h3>
              <p className="agi-reason-p">
                Insufficient funds, expired card, or the issuer flagged the charge. Try a different
                card or contact your bank.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">3D Secure timed out</h3>
              <p className="agi-reason-p">
                The verification window closed before you confirmed. Start the checkout again.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Network error</h3>
              <p className="agi-reason-p">
                Stripe couldn&rsquo;t reach your bank. Usually resolves on retry.
              </p>
            </li>
          </ul>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Next step</p>
          <div className="agi-cta-row">
            <Link href="/pricing" className="agi-cta-primary">
              Try again
            </Link>
            <a href="mailto:contact@agiworkforce.com" className="agi-cta-ghost">
              Email us →
            </a>
          </div>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
