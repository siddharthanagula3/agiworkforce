import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Section, Stack } from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { LinkGrid } from '@/features/marketing/components/pages/features/shared';

export const metadata = buildMetadata({
  title: 'Careers: a small team, on purpose',
  description: 'AGI Automation LLC is small and intentional. We do not have open roles right now.',
  path: '/careers',
});

export default function CareersPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-careers-title"
          eyebrow="Careers"
          title="A small team, on purpose."
          lede="AGI Automation LLC is small and intentional. We do not have open roles right now. If that changes, we will list them here, no ghost listings."
          ctas={[
            { href: '/download', label: 'Get notified' },
            { href: '/changelog', label: 'Follow the changelog', variant: 'secondary' },
          ]}
        />

        <Section id="meanwhile" labelledBy="agi-careers-meanwhile-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-careers-meanwhile-title">
              Three ways onto our radar.
            </h2>
            <LinkGrid
              items={[
                {
                  meta: 'Build',
                  title: 'Use the product',
                  href: '/download',
                  body: 'The best way to get on our radar is to ship something real with AGI: agents, MCP connectors, downstream tooling.',
                },
                {
                  meta: 'Follow',
                  title: 'Follow the changelog',
                  href: '/changelog',
                  body: 'A dated archive of what shipped, the clearest signal of where the product is going.',
                },
                {
                  meta: 'Write',
                  title: 'Stay in touch',
                  href: 'mailto:contact@agiworkforce.com',
                  body: "Email us and tell us what you're building. A real human reads it.",
                  external: true,
                },
              ]}
            />
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
