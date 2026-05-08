import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Gallery | AGI Workforce',
  description: 'A gallery of artifacts users have built with AGI Workforce. Coming soon.',
  alternates: { canonical: 'https://agiworkforce.com/gallery' },
};

export default function GalleryPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Gallery.</h1>
          <p className="agi-page-lede">
            A gallery of artifacts users have built with AGI Workforce.{' '}
            <strong>Not live yet</strong> — we want a real collection before we ship a gallery, not
            stock examples.
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">In the meantime</p>
          <div className="agi-cta-row">
            <Link href="/download" className="agi-cta-primary">
              Build something
            </Link>
            <Link href="/changelog" className="agi-cta-ghost">
              See what shipped →
            </Link>
          </div>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
