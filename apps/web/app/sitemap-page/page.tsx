import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Sitemap | AGI Workforce',
  description: 'Every public page on AGI Workforce, organized.',
  alternates: { canonical: 'https://agiworkforce.com/sitemap-page' },
};

const SECTIONS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: 'Product',
    links: [
      { href: '/', label: 'Home' },
      { href: '/providers', label: 'Providers' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/byok', label: 'BYOK' },
      { href: '/local', label: 'Local mode' },
      { href: '/compare', label: 'Compare' },
    ],
  },
  {
    title: 'Surfaces',
    links: [
      { href: '/desktop', label: 'Desktop' },
      { href: '/mobile', label: 'Mobile' },
      { href: '/cli', label: 'CLI' },
      { href: '/chrome-extension', label: 'Chrome extension' },
      { href: '/vscode-extension', label: 'VS Code extension' },
      { href: '/download', label: 'Download' },
    ],
  },
  {
    title: 'Compare',
    links: [
      { href: '/compare/claude', label: 'vs Claude' },
      { href: '/compare/chatgpt', label: 'vs ChatGPT' },
      { href: '/compare/gemini', label: 'vs Gemini' },
      { href: '/compare/perplexity', label: 'vs Perplexity' },
    ],
  },
  {
    title: 'Use cases',
    links: [
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
      { href: '/api-docs', label: 'API docs' },
      { href: '/integrations', label: 'Integrations' },
      { href: '/help', label: 'Help' },
      { href: '/support', label: 'Support' },
      { href: '/faq', label: 'FAQ' },
      { href: '/get-started', label: 'Get started' },
      { href: '/status', label: 'Status' },
    ],
  },
  {
    title: 'Legal & trust',
    links: [
      { href: '/legal', label: 'Legal index' },
      { href: '/terms', label: 'Terms' },
      { href: '/privacy', label: 'Privacy' },
      { href: '/cookies', label: 'Cookies' },
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
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Sitemap.</h1>
          <p className="agi-page-lede">Every public page, in one place.</p>
        </section>
        <section className="agi-section">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 32,
            }}
          >
            {SECTIONS.map((s) => (
              <div key={s.title}>
                <p className="agi-section-eyebrow">{s.title}</p>
                <ul
                  style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  {s.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className="agi-footer-link">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
