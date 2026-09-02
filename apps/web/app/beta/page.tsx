import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Section } from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';

import { BetaApplicationForm } from './BetaApplicationForm';

export const metadata = buildMetadata({
  title: 'Apply to test',
  description:
    'Apply to test AGI Workforce before a surface ships. Tell us which surfaces you would actually exercise and what you would use them for.',
  path: '/beta',
});

export default function BetaPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-beta-title"
          eyebrow="Beta programme"
          title="Apply to test."
          lede="Managed cloud is open to everyone already: this is different. It is for people who want builds before they ship and are willing to tell us when they break. We read every application and pick for a spread of surfaces, not a queue position."
          ctas={[]}
        />

        <Section id="apply" size="sm">
          <BetaApplicationForm />
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
