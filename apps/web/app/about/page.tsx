import type { Metadata } from 'next';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'About — Multi-provider by design | AGI Workforce',
  description:
    'AGI Automation LLC. Austin, Texas. The CLI is the engine; the apps are surfaces over it. The bet: the user owns the keys, the data, and the choice of model.',
  alternates: { canonical: 'https://agiworkforce.com/about' },
};

const COLOPHON: { key: string; val: string }[] = [
  { key: 'Headquarters', val: 'Austin, Texas, USA' },
  { key: 'Founded', val: '2026' },
  { key: 'License', val: 'Proprietary' },
  { key: 'Region', val: 'us-east-2 (Supabase)' },
  { key: 'Set in', val: 'Geist Sans' },
  { key: 'Engine', val: 'Pure Rust CLI' },
  { key: 'Surfaces', val: 'Desktop · Web · Mobile · CLI · Chrome · VS Code' },
  { key: 'Providers', val: 'Multi-provider — 10+ wired, BYO endpoints supported' },
  { key: 'Data policy', val: 'We do not train on your data.' },
  { key: 'Compliance', val: 'SOC 2 in progress · GDPR DPA on request' },
];

export default function AboutPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Multi-provider by design.</h1>
          <p className="agi-page-lede">
            AGI Automation LLC. Austin, Texas. The CLI is the engine; the apps are surfaces over it.{' '}
            <strong>We built this because we were tired of being locked to one model</strong> — and
            we figured other people were too. The bet: the user, not the vendor, owns the keys, the
            data, and the choice of model.
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">The colophon</p>
          <dl className="agi-colophon">
            {COLOPHON.map((row) => (
              <div key={row.key} className="agi-colophon-row">
                <dt className="agi-colophon-key">{row.key}</dt>
                <dd className="agi-colophon-val">{row.val}</dd>
              </div>
            ))}
          </dl>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
