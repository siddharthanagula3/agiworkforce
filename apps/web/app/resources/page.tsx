import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Section, Stack } from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { LinkGrid } from '@/features/marketing/components/pages/features/shared';

export const metadata = buildMetadata({
  title: 'Resources: pointers into the product',
  description: 'Pointers into the parts of AGI most often asked about, every one a real page.',
  path: '/resources',
});

const SECTIONS = [
  {
    href: '/docs',
    meta: 'Reference',
    title: 'Documentation',
    body: 'Reference material for every surface.',
  },
  {
    href: '/api-docs',
    meta: 'API',
    title: 'API reference',
    body: 'OpenAI-compatible gateway endpoints.',
  },
  {
    href: '/changelog',
    meta: 'Releases',
    title: 'Changelog',
    body: 'A dated archive of what shipped.',
  },
  {
    href: '/security',
    meta: 'Trust',
    title: 'Security',
    body: 'How keys, data, and tools are protected.',
  },
  {
    href: '/byok',
    meta: 'Keys',
    title: 'BYOK posture',
    body: 'Bring your own keys, pay providers directly.',
  },
  {
    href: '/status',
    meta: 'Live',
    title: 'Status',
    body: 'A live health signal, rechecked every minute.',
  },
];

export default function ResourcesPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-resources-title"
          eyebrow="Resources"
          title="Pointers into the parts of AGI most often asked about."
          lede="Every entry below is a real page with real content. Nothing here is a placeholder."
          ctas={[]}
        />

        <Section id="index" labelledBy="agi-resources-index-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-resources-index-title">
              The index.
            </h2>
            <LinkGrid items={SECTIONS} />
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
