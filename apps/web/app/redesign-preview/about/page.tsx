import { AgiTopBar } from '../AgiTopBar';
import { AgiFooter } from '../AgiFooter';

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

export default function RedesignPreviewAboutPage() {
  return (
    <main className="pv-shell">
      <AgiTopBar />

      <section className="pv-page-hero">
        <h1 className="pv-page-h1">Multi-provider by design.</h1>
        <p className="pv-page-lede">
          AGI Automation LLC. Austin, Texas. The CLI is the engine; the apps are surfaces over it.{' '}
          <strong>We built this because we were tired of being locked to one model</strong> — and we
          figured other people were too. The bet: the user, not the vendor, owns the keys, the data,
          and the choice of model.
        </p>
      </section>

      <section className="pv-section">
        <p className="pv-section-eyebrow">The colophon</p>
        <dl className="pv-colophon">
          {COLOPHON.map((row) => (
            <div key={row.key} className="pv-colophon-row">
              <dt className="pv-colophon-key">{row.key}</dt>
              <dd className="pv-colophon-val">{row.val}</dd>
            </div>
          ))}
        </dl>
      </section>

      <AgiFooter />
    </main>
  );
}
