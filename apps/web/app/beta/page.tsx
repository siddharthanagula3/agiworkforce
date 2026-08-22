import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';

import { BetaApplicationForm } from './BetaApplicationForm';

export const metadata = buildMetadata({
  title: 'Apply to test',
  description:
    'Apply to test AGI Workforce before a surface ships. Tell us which surfaces you would actually exercise and what you would use them for.',
  path: '/beta',
});

export default function BetaPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-page-hero">
          <p className="agi-section-eyebrow">Beta programme</p>
          <h1 className="agi-page-h1">Apply to test.</h1>
          <p className="agi-page-lede">
            Managed cloud is open to everyone already — this is different. It is for people who
            want builds before they ship and are willing to tell us when they break. We read every
            application and pick for a spread of surfaces, not a queue position.
          </p>
        </section>

        <section className="agi-page-section">
          <BetaApplicationForm />
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
