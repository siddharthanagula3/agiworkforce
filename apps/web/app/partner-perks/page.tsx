import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { PERKS } from '../../lib/perks';

export const metadata: Metadata = {
  title: 'Partner Perks | AGI Workforce',
  description:
    'Exclusive perks and credits from AGI Workforce partners. AWS, Linear, Vercel, and more.',
  openGraph: {
    title: 'Partner Perks | AGI Workforce',
    description:
      'Exclusive perks and credits from AGI Workforce partners. AWS, Linear, Vercel, and more.',
    url: 'https://agiworkforce.com/partner-perks',
    siteName: 'AGI Workforce',
    type: 'website',
  },
  alternates: { canonical: 'https://agiworkforce.com/partner-perks' },
};

export default function PartnerPerksPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Partner perks.</h1>
          <p className="agi-page-lede">
            Exclusive credits and offers from our technology partners.{' '}
            <strong>AGI Workforce subscribers get access to all active perks below.</strong> Email
            partnerships@agiworkforce.com with questions.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Active perks</p>
          <ul className="agi-perks-grid" role="list">
            {PERKS.map((perk) => (
              <li key={perk.id} className="agi-perk-card">
                <p className="agi-perk-partner">{perk.partner}</p>
                <h3 className="agi-perk-title">{perk.title}</h3>
                <p className="agi-perk-description">{perk.description}</p>
                <a href={perk.ctaUrl} className="agi-perk-cta">
                  {perk.ctaText}
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Become a partner</p>
          <div className="agi-cta-row">
            <a href="mailto:partnerships@agiworkforce.com" className="agi-cta-primary">
              Email partnerships
            </a>
            <Link href="/partners" className="agi-cta-ghost">
              Partner program details &rarr;
            </Link>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
