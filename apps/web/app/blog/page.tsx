import type { Metadata } from 'next';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Writing | AGI Workforce',
  description:
    'We post when we have something to say. Engineering deep-dives, security postures, design notes.',
  alternates: { canonical: 'https://agiworkforce.com/blog' },
};

export default function BlogPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Writing.</h1>
          <p className="agi-page-lede">
            We post when we have something to say.{' '}
            <strong>
              Engineering deep-dives, security postures, and design notes — not content marketing.
            </strong>{' '}
            Posts will appear here when they exist.
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Until then</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            Read the{' '}
            <a href="/changelog" style={{ color: 'var(--agi-ink)' }}>
              changelog
            </a>{' '}
            for what shipped, the{' '}
            <a href="/about" style={{ color: 'var(--agi-ink)' }}>
              about page
            </a>{' '}
            for who we are, and the{' '}
            <a href="/security" style={{ color: 'var(--agi-ink)' }}>
              security page
            </a>{' '}
            for the operational posture.
          </p>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
