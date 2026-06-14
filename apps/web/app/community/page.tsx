import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { Reveal } from '../../components/marketing/Reveal';

export const metadata: Metadata = {
  title: 'Community',
  description: 'Where to find AGI: follow the changelog for what ships, email for everything else.',
  alternates: { canonical: 'https://agiworkforce.com/community' },
};

export default function CommunityPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-community-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">Community</p>
          <h1 id="agi-community-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">Where to</span>
            <span className="agi-fl-h1-line">
              <em className="agi-fl-h1-em">find us.</em>
            </span>
          </h1>
          <p className="agi-fl-lede">
            We don't run a Discord, a forum, or a Slack workspace yet.{' '}
            <strong>
              Follow the changelog for what ships, and email contact@agiworkforce.com for everything
              else. A real human reads it.
            </strong>
          </p>
          <div style={{ paddingBottom: 'clamp(48px, 7vw, 88px)' }}>
            <div className="agi-fl-cta-row">
              <Link href="/changelog" className="agi-fl-cta agi-fl-cta--primary">
                Follow the Changelog
              </Link>
              <a
                href="mailto:contact@agiworkforce.com"
                className="agi-fl-cta agi-fl-cta--secondary"
              >
                Email Us
              </a>
            </div>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-community-channels-title">
          <p className="agi-fl-eyebrow">Where to go</p>
          <h2 id="agi-community-channels-title" className="agi-fl-h2">
            Three channels, all real.
          </h2>
          <div className="agi-fl-cap-grid">
            <Reveal className="agi-fl-cap-cardwrap">
              <Link href="/changelog" className="agi-fl-cap-card">
                <span className="agi-fl-cap-meta">Changelog</span>
                <span className="agi-fl-cap-title">Follow the changelog</span>
                <span className="agi-fl-cap-body">
                  A dated archive of what shipped. The fastest way to track where the product is
                  going.
                </span>
                <span className="agi-fl-cap-arrow" aria-hidden="true">
                  →
                </span>
              </Link>
            </Reveal>
            <Reveal delay={60} className="agi-fl-cap-cardwrap">
              <a href="mailto:contact@agiworkforce.com" className="agi-fl-cap-card">
                <span className="agi-fl-cap-meta">Email</span>
                <span className="agi-fl-cap-title">Email us</span>
                <span className="agi-fl-cap-body">
                  contact@agiworkforce.com. A real human reads it. Use it for billing, partnerships,
                  press, and anything the changelog doesn't answer.
                </span>
                <span className="agi-fl-cap-arrow" aria-hidden="true">
                  →
                </span>
              </a>
            </Reveal>
            <Reveal delay={120} className="agi-fl-cap-cardwrap">
              <a
                href="https://twitter.com/agiworkforce"
                target="_blank"
                rel="noopener noreferrer"
                className="agi-fl-cap-card"
              >
                <span className="agi-fl-cap-meta">X</span>
                <span className="agi-fl-cap-title">@agiworkforce</span>
                <span className="agi-fl-cap-body">
                  We post when we ship. We don't reply to support there.
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
