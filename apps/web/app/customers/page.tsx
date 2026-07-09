import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { CapabilityGrid, FinalCta } from '../../components/marketing/FlagshipSections';

export const metadata: Metadata = {
  title: 'Customers',
  description:
    'Case studies will appear here once we have written permission to share customer names and outcomes.',
  alternates: { canonical: 'https://agiworkforce.com/customers' },
};

export default function CustomersPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-customers-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">Customers</p>
          <h1 id="agi-customers-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">Case studies,</span>
            <span className="agi-fl-h1-line">
              <em className="agi-fl-h1-em">named with permission.</em>
            </span>
          </h1>
          <p className="agi-fl-lede">
            We publish customer stories only with consent.{' '}
            <strong>
              Case studies will appear here once we have written permission to share customer names
              and outcomes.
            </strong>{' '}
            We don't list logos we haven't cleared.
          </p>
          <div style={{ paddingBottom: 'clamp(48px, 7vw, 88px)' }}>
            <div className="agi-fl-cta-row">
              <Link href="/download" className="agi-fl-cta agi-fl-cta--primary">
                Get notified
              </Link>
              <Link href="/contact-sales" className="agi-fl-cta agi-fl-cta--secondary">
                Talk to Sales
              </Link>
            </div>
          </div>
        </section>

        <CapabilityGrid
          eyebrow="Where AGI fits"
          title="The work AGI is built for."
          items={[
            {
              meta: 'Engineering',
              title: 'Engineering teams',
              body: 'CLI in CI, the VS Code extension for editor work, and the desktop app for harder problems.',
              href: '/use-cases/startups',
            },
            {
              meta: 'Consulting',
              title: 'Consulting firms',
              body: 'Research, deliverables, and auditable outputs across multi-provider AI without vendor lock-in.',
              href: '/use-cases/consulting',
            },
            {
              meta: 'IT services',
              title: 'IT service providers',
              body: 'Triage, runbooks, and ticket-grade automation with sandboxed tool execution.',
              href: '/use-cases/it-providers',
            },
          ]}
        />

        <FinalCta
          eyebrow="Use it"
          title="Be the case study we ask to publish."
          body="Put AGI to work when it opens. If it earns a place in your stack, we'll ask your permission before your name ever appears here."
          ctas={[
            { href: '/download', label: 'Get notified' },
            { href: '/contact-sales', label: 'Talk to Sales' },
          ]}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
