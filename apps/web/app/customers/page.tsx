import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Customers | AGI Workforce',
  description:
    'Real teams using AGI Workforce. Case studies coming once we have written permission to share them.',
  alternates: { canonical: 'https://agiworkforce.com/customers' },
};

export default function CustomersPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Customers.</h1>
          <p className="agi-page-lede">
            Real teams use AGI Workforce.{' '}
            <strong>
              Case studies will appear here once we have written permission to share customer names
              and outcomes.
            </strong>{' '}
            We don&rsquo;t list logos we haven&rsquo;t cleared.
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Where we show up most</p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">Engineering teams</h3>
              <p className="agi-reason-p">
                CLI in CI, VS Code extension for editor work, desktop app for harder problems — with
                the same chat history across all three.
              </p>
              <Link href="/use-cases/startups" className="agi-cta-ghost" style={{ marginTop: 4 }}>
                Read the startup case →
              </Link>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Consulting firms</h3>
              <p className="agi-reason-p">
                Research, deliverables, audit-grade outputs across multi-provider AI without vendor
                lock-in.
              </p>
              <Link href="/use-cases/consulting" className="agi-cta-ghost" style={{ marginTop: 4 }}>
                Read the consulting case →
              </Link>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">IT service providers</h3>
              <p className="agi-reason-p">
                Triage, runbooks, ticket-grade automation with sandboxed tool execution.
              </p>
              <Link
                href="/use-cases/it-providers"
                className="agi-cta-ghost"
                style={{ marginTop: 4 }}
              >
                Read the MSP case →
              </Link>
            </li>
          </ul>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Use it</p>
          <div className="agi-cta-row">
            <Link href="/download" className="agi-cta-primary">
              Install
            </Link>
            <Link href="/contact-sales" className="agi-cta-ghost">
              Talk to sales →
            </Link>
          </div>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
