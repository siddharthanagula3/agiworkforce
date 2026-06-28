import type { Metadata } from 'next';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { FinalCta } from '../../components/marketing/FlagshipSections';
import { LAUNCH, MARKETING, POSITIONING } from '../../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'About: Multi-provider by design',
  description:
    'AGI Automation LLC. Austin, Texas. The CLI is the engine; the apps are surfaces over it. The bet: the user owns the keys, the data, and the choice of model.',
  alternates: { canonical: 'https://agiworkforce.com/about' },
};

const COLOPHON: { key: string; val: string }[] = [
  { key: 'Headquarters', val: 'Austin, Texas, USA' },
  { key: 'License', val: 'Proprietary' },
  { key: 'Region', val: 'United States' },
  { key: 'Set in', val: 'Geist Sans' },
  { key: 'Engine', val: 'Pure Rust CLI' },
  { key: 'Surfaces', val: 'Desktop · Web · Mobile · CLI · Chrome · VS Code' },
  {
    key: 'Providers',
    val: `Multi-provider. ${MARKETING.providers.display} wired, BYO endpoints supported`,
  },
  { key: 'Data policy', val: POSITIONING.trustBoundary },
  { key: 'Compliance', val: 'SOC 2 planned · GDPR and CCPA in progress' },
];

export default function AboutPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-about-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">About AGI</p>
          <h1 id="agi-about-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">Multi-provider,</span>
            <span className="agi-fl-h1-line">
              <em className="agi-fl-h1-em">by design.</em>
            </span>
          </h1>
          <p className="agi-fl-lede">
            AGI Automation LLC. Austin, Texas. The CLI is the engine; the apps are surfaces over it.{' '}
            <strong>We built this because we were tired of being locked to one model.</strong> We
            figured other people were too. The bet: you, not the vendor, own the keys, the data, and
            the choice of model.
          </p>
          <div style={{ paddingBottom: 'clamp(48px, 7vw, 88px)' }}>
            <ul className="agi-fl-mode-ribbon" aria-label="Trust modes">
              <li>Local · on-device</li>
              <li>BYOK · your keys</li>
              <li>Cloud · public alpha</li>
            </ul>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-about-colophon-title">
          <p className="agi-fl-eyebrow">The colophon</p>
          <h2 id="agi-about-colophon-title" className="agi-fl-h2">
            The facts, plainly stated.
          </h2>
          <p className="agi-fl-section-lede">
            Who we are, where we are, and how the product is put together. No founding mythology,
            just the record.
          </p>
          <dl className="agi-colophon">
            {COLOPHON.map((row) => (
              <div key={row.key} className="agi-colophon-row">
                <dt className="agi-colophon-key">{row.key}</dt>
                <dd className="agi-colophon-val">{row.val}</dd>
              </div>
            ))}
          </dl>
        </section>

        <FinalCta
          eyebrow={LAUNCH.publicLabel}
          title="Judge the bet on its merits."
          body="Try AGI Web in the browser, install the desktop app or CLI for Local and BYOK work, and see where every request runs before it leaves your device."
          ctas={[
            { href: '/login?redirectTo=%2Fchat', label: 'Try AGI Web' },
            { href: '/download', label: 'Download AGI' },
            { href: '/trust', label: 'See the Trust Posture' },
          ]}
          stamp={`Public launch · ${LAUNCH.date}`}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
