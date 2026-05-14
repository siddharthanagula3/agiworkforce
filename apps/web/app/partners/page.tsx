import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Partners | AGI Workforce',
  description: 'How to partner with AGI Workforce — integrations, resellers, and platform plays.',
  alternates: { canonical: 'https://agiworkforce.com/partners' },
};

export default function PartnersPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Partners.</h1>
          <p className="agi-page-lede">
            We work with three kinds of partners.{' '}
            <strong>Integration builders, resellers, and platform plays.</strong> Email
            contact@agiworkforce.com if any of these describe you and we&rsquo;ll respond.
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">The three kinds</p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">Integration builders</h3>
              <p className="agi-reason-p">
                Building MCP plugins, model adapters, or skill packs for AGI Workforce. We help
                publish to our directory once it ships.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Resellers</h3>
              <p className="agi-reason-p">
                Selling AGI Workforce as part of a larger consulting or implementation engagement.
                Volume pricing on Enterprise contracts.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Platform plays</h3>
              <p className="agi-reason-p">
                Embedding our gateway, BYOK posture, or local-mode capability into your product.
                Discuss licensing terms.
              </p>
            </li>
          </ul>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Talk to us</p>
          <div className="agi-cta-row">
            <a href="mailto:contact@agiworkforce.com" className="agi-cta-primary">
              Email partnerships
            </a>
            <Link href="/enterprise" className="agi-cta-ghost">
              Enterprise terms →
            </Link>
          </div>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
