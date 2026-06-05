import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../../components/layout/Header';
import { MarketingFooter } from '../../../components/marketing/MarketingFooter';
import { LAUNCH } from '../../../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'EU Representative',
  description: 'EU representative status for AGI mobile and web users before the public launch.',
  alternates: { canonical: 'https://agiworkforce.com/legal/eu-representative' },
};

export default function EuRepresentativePage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <p className="agi-section-eyebrow">Legal</p>
          <h1 className="agi-page-h1">EU Representative.</h1>
          <p className="agi-page-lede">
            AGI will publish its EU representative details before the {LAUNCH.publicLabel}. Until
            then, privacy requests can be sent directly to AGI Automation LLC.
          </p>
        </section>

        <section className="agi-section">
          <div className="agi-callout">
            <h2 className="agi-callout-h">Representative details pending appointment.</h2>
            <p className="agi-callout-p">
              This page exists so public legal links do not dead-end. The appointed representative
              name, address, and contact instructions will be added here before public release.
            </p>
          </div>
          <div className="agi-cta-row">
            <a href="mailto:legal@agiworkforce.com" className="agi-cta-primary">
              Email Legal
            </a>
            <Link href="/mobile/legal" className="agi-cta-ghost">
              Mobile Legal
            </Link>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
