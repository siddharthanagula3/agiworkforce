import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Section, Stack } from '@/features/marketing/components/system';
import { FactLine, PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { LinkGrid } from '@/features/marketing/components/pages/features/shared';
import { contactMailto } from '@/lib/legal-constants';
import '@/features/marketing/components/pages/company/company.css';

export const metadata = buildMetadata({
  title: 'Careers: founder-led, no open roles',
  description: 'AGI Automation LLC is small and intentional. We do not have open roles right now.',
  path: '/careers',
});

const CAREERS_SUBJECT = 'Careers';

const HERO_FACTS = [
  'Open roles: 0',
  'Structure: founder-led',
  'Ownership: independent and privately held',
];

export default function CareersPage() {
  return (
    <div data-design="agi" className="agi-ds-page agi-co">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-careers-title"
          eyebrow="Careers"
          title="Founder-led, no open roles."
          em="no open roles."
          lede="AGI Automation LLC is small and intentional. We do not have open roles right now. If that changes, we will list them here, no ghost listings."
          ctas={[
            { href: contactMailto(CAREERS_SUBJECT), label: 'Email us about working here' },
            { href: '/release-notes', label: 'Follow the release notes', variant: 'secondary' },
          ]}
        />

        <FactLine facts={HERO_FACTS} />

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
                  href: '/get-started',
                  body: 'The best way to get on our radar is to ship something real with AGI: agents, MCP connectors, downstream tooling.',
                },
                {
                  meta: 'Follow',
                  title: 'Follow the release notes',
                  href: '/release-notes',
                  body: 'A dated archive of what shipped, the clearest signal of where the product is going.',
                },
                {
                  meta: 'Write',
                  title: 'Stay in touch',
                  href: contactMailto(CAREERS_SUBJECT),
                  body: "Email us and tell us what you're building. This is an open contact channel, not a response-time promise.",
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
