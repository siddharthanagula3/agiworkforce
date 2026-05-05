import Link from 'next/link';
import type { Metadata } from 'next';
import { Map } from 'lucide-react';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Sitemap | AGI Workforce',
  description: 'Complete index of all public pages on AGI Workforce.',
  alternates: { canonical: 'https://agiworkforce.com/sitemap-page' },
};

type SitemapGroup = {
  title: string;
  links: { label: string; href: string }[];
};

const sections: SitemapGroup[] = [
  {
    title: 'Product',
    links: [
      { label: 'Home', href: '/' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Providers', href: '/providers' },
      { label: 'BYOK', href: '/byok' },
      { label: 'Local AI', href: '/local' },
      { label: 'Desktop', href: '/desktop' },
      { label: 'Mobile', href: '/mobile' },
      { label: 'CLI', href: '/cli' },
      { label: 'Chrome Extension', href: '/chrome-extension' },
      { label: 'VS Code Extension', href: '/vscode-extension' },
      { label: 'Integrations (MCP)', href: '/integrations' },
      { label: 'Features: Agents', href: '/features/agents' },
      { label: 'Features: AI Chat', href: '/features/ai-chat' },
      { label: 'Features: AI Skills', href: '/features/ai-skills' },
      { label: 'Features: Plugins', href: '/features/plugins' },
      { label: 'Features: Tools', href: '/features/tools' },
      { label: 'Compare: ChatGPT', href: '/compare/chatgpt' },
      { label: 'Compare: Claude', href: '/compare/claude' },
      { label: 'Compare: Gemini', href: '/compare/gemini' },
      { label: 'Compare: Perplexity', href: '/compare/perplexity' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Docs', href: '/docs' },
      { label: 'API Docs', href: '/api-docs' },
      { label: 'FAQ', href: '/faq' },
      { label: 'Changelog', href: '/changelog' },
      { label: 'Resources', href: '/resources' },
      { label: 'Gallery', href: '/gallery' },
      { label: 'Blog', href: '/blog' },
      { label: 'Use Cases: Consulting', href: '/use-cases/consulting' },
      { label: 'Use Cases: IT Providers', href: '/use-cases/it-providers' },
      { label: 'Use Cases: Sales Teams', href: '/use-cases/sales-teams' },
      { label: 'Use Cases: Startups', href: '/use-cases/startups' },
    ],
  },
  {
    title: 'Trust and Legal',
    links: [
      { label: 'Security', href: '/security' },
      { label: 'Trust Center', href: '/trust' },
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Terms of Service', href: '/terms' },
      { label: 'Sub-processors', href: '/subprocessors' },
      { label: 'DPA', href: '/dpa' },
      { label: 'SLA', href: '/sla' },
      { label: 'Accessibility', href: '/accessibility' },
      { label: 'Refund Policy', href: '/refund-policy' },
      { label: 'Cookie Policy', href: '/cookies' },
      { label: 'Legal', href: '/legal' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Careers', href: '/careers' },
      { label: 'Contact', href: '/contact' },
      { label: 'Contact Sales', href: '/contact-sales' },
      { label: 'Enterprise', href: '/enterprise' },
      { label: 'Customers', href: '/customers' },
      { label: 'Partners', href: '/partners' },
      { label: 'Press', href: '/press' },
      { label: 'Community', href: '/community' },
      { label: 'System Status', href: '/status' },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'Log In', href: '/login' },
      { label: 'Sign Up', href: '/signup' },
      { label: 'Forgot Password', href: '/forgot-password' },
      { label: 'Billing', href: '/billing' },
      { label: 'Verify Email', href: '/verify' },
      { label: 'Device Auth', href: '/device-auth' },
    ],
  },
];

export default function SitemapPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#09090b] text-[#edebe8]">
      <Header />
      <main className="flex-1 pt-24">
        <section className="py-16 md:py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-5xl">
              {/* Header */}
              <div className="mb-10 flex items-center gap-3">
                <Map className="h-6 w-6 text-[#c8892a]" />
                <h1 className="text-3xl font-bold text-[#edebe8]">Sitemap</h1>
              </div>
              <p className="mb-12 text-[#888480]">
                Complete index of public pages on AGI Workforce. For the XML sitemap (for crawlers),
                see{' '}
                <a href="/sitemap.xml" className="text-[#c8892a] hover:underline">
                  /sitemap.xml
                </a>
                .
              </p>

              {/* Grid of sections */}
              <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
                {sections.map((section) => (
                  <div key={section.title}>
                    <h2 className="mb-4 border-b border-[#1a1917] pb-2 text-sm font-bold uppercase tracking-widest text-[#c8892a]">
                      {section.title}
                    </h2>
                    <ul className="space-y-2">
                      {section.links.map((link) => (
                        <li key={link.href}>
                          <Link
                            href={link.href}
                            className="text-sm text-[#888480] transition-colors hover:text-[#edebe8]"
                          >
                            {link.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <p className="mt-16 text-xs text-[#555150]">
                Last updated: 2026-05-05. Some pages may be behind authentication or available only
                on specific surfaces.
              </p>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
