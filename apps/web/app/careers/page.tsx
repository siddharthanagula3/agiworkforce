import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Reveal } from '@/features/marketing/components/Reveal';

export const metadata = buildMetadata({
  title: 'Careers',
  description: 'AGI Automation LLC is small and intentional. We do not have open roles right now.',
  path: '/careers',
});

export default function CareersPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-careers-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">Careers</p>
          <h1 id="agi-careers-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">A small team,</span>{' '}
            <span className="agi-fl-h1-line">
              <em className="agi-fl-h1-em">on purpose.</em>
            </span>
          </h1>
          <p className="agi-fl-lede">
            AGI Automation LLC is small and intentional.{' '}
            <strong>We do not have open roles right now.</strong> If that changes, we'll list them
            here · no ghost listings.
          </p>
          <div style={{ paddingBottom: 'clamp(48px, 7vw, 88px)' }}>
            <div className="agi-fl-cta-row">
              <Link href="/download" className="agi-fl-cta agi-fl-cta--primary">
                Get notified
              </Link>
              <Link href="/changelog" className="agi-fl-cta agi-fl-cta--secondary">
                Follow the Changelog
              </Link>
            </div>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-careers-meanwhile-title">
          <p className="agi-fl-eyebrow">In the meantime</p>
          <h2 id="agi-careers-meanwhile-title" className="agi-fl-h2">
            Three ways onto our radar.
          </h2>
          <div className="agi-fl-cap-grid">
            <Reveal className="agi-fl-cap-cardwrap">
              <Link href="/download" className="agi-fl-cap-card">
                <span className="agi-fl-cap-meta">Build</span>
                <span className="agi-fl-cap-title">Use the product</span>
                <span className="agi-fl-cap-body">
                  The best way to get on our radar is to ship something real with AGI · agents, MCP
                  connectors, downstream tooling.
                </span>
                <span className="agi-fl-cap-arrow" aria-hidden="true">
                  →
                </span>
              </Link>
            </Reveal>
            <Reveal delay={60} className="agi-fl-cap-cardwrap">
              <Link href="/changelog" className="agi-fl-cap-card">
                <span className="agi-fl-cap-meta">Follow</span>
                <span className="agi-fl-cap-title">Follow the changelog</span>
                <span className="agi-fl-cap-body">
                  A dated archive of what shipped · the clearest signal of where the product is
                  going.
                </span>
                <span className="agi-fl-cap-arrow" aria-hidden="true">
                  →
                </span>
              </Link>
            </Reveal>
            <Reveal delay={120} className="agi-fl-cap-cardwrap">
              <a href="mailto:contact@agiworkforce.com" className="agi-fl-cap-card">
                <span className="agi-fl-cap-meta">Write</span>
                <span className="agi-fl-cap-title">Stay in touch</span>
                <span className="agi-fl-cap-body">
                  Email us and tell us what you're building. A real human reads it.
                </span>
                <span className="agi-fl-cap-arrow" aria-hidden="true">
                  →
                </span>
              </a>
            </Reveal>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
