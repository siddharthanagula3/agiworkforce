import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Eyebrow, Section, Stack } from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/Shared';

export const metadata = buildMetadata({
  title: 'Sitemap',
  description: 'Public pages of AGI, grouped by section.',
  path: '/sitemap-page',
});

const SECTIONS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: 'Product',
    links: [
      { href: '/', label: 'Home' },
      { href: '/features', label: 'Features' },
      { href: '/web', label: 'Web app' },
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
      { href: '/skills', label: 'Skills' },
      { href: '/plugins', label: 'Plugins' },
      { href: '/connectors', label: 'Connectors' },
      { href: '/connectors/mcp-directory', label: 'MCP directory' },
      { href: '/gallery', label: 'Gallery' },
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
      { href: '/founder', label: 'Founder' },
      { href: '/enterprise', label: 'Enterprise' },
      { href: '/customers', label: 'Customers' },
      { href: '/partners', label: 'Partners' },
      { href: '/press', label: 'Press' },
      { href: '/community', label: 'Community' },
      { href: '/careers', label: 'Careers' },
      { href: '/release-notes', label: 'Release notes' },
      { href: '/blog', label: 'Blog' },
      { href: '/contact', label: 'Contact' },
      { href: '/contact-sales', label: 'Contact sales' },
      { href: '/waitlist', label: 'Discuss Enterprise access' },
      { href: '/beta', label: 'Beta programme' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { href: '/docs', label: 'Documentation' },
      { href: '/docs/byok-env', label: 'BYOK env docs' },
      { href: '/api-docs', label: 'API docs' },
      { href: '/integrations', label: 'Integrations' },
      { href: '/features/ai-chat', label: 'AI chat' },
      { href: '/features/agents', label: 'Agents' },
      { href: '/features/artifacts', label: 'Artifacts' },
      { href: '/features/deep-research', label: 'Deep research' },
      { href: '/features/projects', label: 'Projects' },
      { href: '/features/memory', label: 'Memory' },
      { href: '/features/tools', label: 'Tools and connectors' },
      { href: '/features/plugins', label: 'Plugins feature' },
      { href: '/features/images', label: 'Image generation' },
      { href: '/features/video', label: 'Video generation' },
      { href: '/features/voice', label: 'Voice' },
      { href: '/help', label: 'Help' },
      { href: '/support', label: 'Support' },
      { href: '/recover', label: 'Account recovery' },
      { href: '/appeal', label: 'Appeal a suspension' },
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
      { href: '/legal/government-requests', label: 'Government requests' },
      { href: '/legal/open-source', label: 'Open source licenses' },
      { href: '/supported-countries', label: 'Supported countries' },
      { href: '/terms', label: 'Terms' },
      { href: '/acceptable-use', label: 'Acceptable use' },
      { href: '/agent-permissions', label: 'Approvals' },
      { href: '/privacy', label: 'Privacy' },
      { href: '/privacy/requests', label: 'Privacy requests' },
      { href: '/privacy/india', label: 'Privacy for India' },
      { href: '/data-use', label: 'Data use' },
      { href: '/cookies', label: 'Cookies' },
      { href: '/copyright', label: 'Copyright' },
      { href: '/copyright/report', label: 'Report a copyright issue' },
      { href: '/disclaimer', label: 'Disclaimer' },
      { href: '/model-licenses', label: 'Model licences' },
      { href: '/dpa', label: 'DPA' },
      { href: '/sla', label: 'SLA' },
      { href: '/subprocessors', label: 'Subprocessors' },
      { href: '/refund-policy', label: 'Refunds' },
      { href: '/referral-terms', label: 'Referral program terms' },
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
          lede="Public pages of this site, grouped by section."
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
