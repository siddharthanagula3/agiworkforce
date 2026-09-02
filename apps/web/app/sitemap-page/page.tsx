import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Eyebrow, Section, Stack } from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';

export const metadata = buildMetadata({
  title: 'Sitemap',
  description: 'Every public page on AGI, organized.',
  path: '/sitemap-page',
});

const SECTIONS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: 'Product',
    links: [
      { href: '/', label: 'Home' },
      { href: '/business', label: 'Business' },
      { href: '/teams', label: 'Teams' },
      { href: '/solutions', label: 'Solutions' },
      { href: '/apps', label: 'Apps and connectors' },
      { href: '/agi-code', label: 'AGI Code' },
      { href: '/agi-work', label: 'AGI Work' },
      { href: '/providers', label: 'Providers' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/byok', label: 'BYOK' },
      { href: '/local', label: 'Local mode' },
    ],
  },
  {
    title: 'Surfaces',
    links: [
      { href: '/desktop', label: 'Desktop' },
      { href: '/mobile', label: 'Mobile' },
      { href: '/mobile/legal', label: 'Mobile legal' },
      { href: '/cli', label: 'CLI' },
      { href: '/chrome-extension', label: 'Chrome extension' },
      { href: '/vscode-extension', label: 'VS Code extension' },
      { href: '/download', label: 'Downloads and release status' },
    ],
  },
  {
    title: 'Use cases',
    links: [
      { href: '/use-cases', label: 'Use cases' },
      { href: '/use-cases/consulting', label: 'Consulting firms' },
      { href: '/use-cases/it-providers', label: 'IT service providers' },
      { href: '/use-cases/sales-teams', label: 'Sales teams' },
      { href: '/use-cases/startups', label: 'Startups' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/enterprise', label: 'Enterprise' },
      { href: '/customers', label: 'Customers' },
      { href: '/partners', label: 'Partners' },
      { href: '/press', label: 'Press' },
      { href: '/community', label: 'Community' },
      { href: '/careers', label: 'Careers' },
      { href: '/changelog', label: 'Changelog' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { href: '/docs', label: 'Documentation' },
      { href: '/docs/byok-env', label: 'BYOK env docs' },
      { href: '/api-docs', label: 'API docs' },
      { href: '/integrations', label: 'Integrations' },
      { href: '/features/artifacts', label: 'Artifacts' },
      { href: '/features/deep-research', label: 'Deep research' },
      { href: '/features/projects', label: 'Projects' },
      { href: '/features/memory', label: 'Memory' },
      { href: '/help', label: 'Help' },
      { href: '/support', label: 'Support' },
      { href: '/faq', label: 'FAQ' },
      { href: '/get-started', label: 'Get started' },
      { href: '/status', label: 'Status' },
    ],
  },
  {
    title: 'Legal and trust',
    links: [
      { href: '/legal', label: 'Legal index' },
      { href: '/legal/eu-representative', label: 'EU representative' },
      { href: '/terms', label: 'Terms' },
      { href: '/acceptable-use', label: 'Acceptable use' },
      { href: '/agent-permissions', label: 'Agent permissions' },
      { href: '/privacy', label: 'Privacy' },
      { href: '/cookies', label: 'Cookies' },
      { href: '/copyright', label: 'Copyright' },
      { href: '/model-licenses', label: 'Model licences' },
      { href: '/dpa', label: 'DPA' },
      { href: '/sla', label: 'SLA' },
      { href: '/subprocessors', label: 'Subprocessors' },
      { href: '/refund-policy', label: 'Refunds' },
      { href: '/accessibility', label: 'Accessibility' },
      { href: '/trust', label: 'Trust' },
      { href: '/security', label: 'Security' },
    ],
  },
];

export default function SitemapPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-sitemap-title"
          eyebrow="Sitemap"
          title="Sitemap."
          lede="Every public page, in one place."
          ctas={[]}
        />

        <Section id="index" rule>
          <div className="agi-ds-grid-2">
            {SECTIONS.map((s) => (
              <Stack key={s.title}>
                <Eyebrow>{s.title}</Eyebrow>
                <Stack gap="tight">
                  {s.links.map((l) => (
                    <Link href={l.href} className="agi-ds-link" key={l.href}>
                      {l.label}
                    </Link>
                  ))}
                </Stack>
              </Stack>
            ))}
          </div>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
