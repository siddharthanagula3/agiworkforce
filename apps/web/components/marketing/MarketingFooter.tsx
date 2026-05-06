import Link from 'next/link';

interface FooterLink {
  label: string;
  href: string;
  subtitle?: string;
}

const productLinks: FooterLink[] = [
  { label: 'Features', href: '/features/ai-chat' },
  { label: 'AI Skills', href: '/features/ai-skills' },
  { label: 'Plugins & MCP', href: '/features/plugins' },
  { label: 'Integrations', href: '/integrations' },
  { label: 'Marketplace', href: '/marketplace' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Download', href: '/download' },
  { label: 'Changelog', href: '/changelog' },
];

const whyLinks: FooterLink[] = [
  { label: '10+ Providers', href: '/providers' },
  { label: 'BYOK', href: '/byok' },
  { label: 'Local LLM', href: '/local' },
  { label: 'vs Claude', href: '/compare/claude' },
  { label: 'vs ChatGPT', href: '/compare/chatgpt' },
  { label: 'vs Gemini', href: '/compare/gemini' },
  { label: 'vs Perplexity', href: '/compare/perplexity' },
];

const platformLinks: FooterLink[] = [
  { label: 'Desktop', href: '/desktop' },
  { label: 'Mobile', href: '/mobile' },
  { label: 'CLI', href: '/cli' },
  { label: 'Chrome extension', href: '/chrome-extension' },
  { label: 'VS Code extension', href: '/vscode-extension' },
];

const resourcesLinks: FooterLink[] = [
  { label: 'Documentation', href: '/docs' },
  { label: 'API docs', href: '/api-docs' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Help center', href: '/help' },
  { label: 'Resources', href: '/resources' },
  { label: 'Gallery', href: '/gallery' },
  { label: 'Blog', href: '/blog' },
  { label: 'Status', href: '/status' },
];

const companyLinks: FooterLink[] = [
  { label: 'About', href: '/about' },
  { label: 'Customers', href: '/customers' },
  { label: 'Enterprise', href: '/enterprise' },
  { label: 'Partners', href: '/partners' },
  { label: 'Press', href: '/press' },
  { label: 'Community', href: '/community' },
  { label: 'Careers', href: '/careers' },
  { label: 'Contact', href: '/contact' },
  { label: 'Contact sales', href: '/contact-sales' },
];

const trustLinks: FooterLink[] = [
  { label: 'Trust center', href: '/trust' },
  { label: 'Security', href: '/security' },
  { label: 'Privacy', href: '/privacy', subtitle: 'Effective 2026-05-04' },
  { label: 'Terms', href: '/terms' },
  { label: 'DPA', href: '/dpa' },
  { label: 'SLA', href: '/sla' },
  { label: 'Sub-processors', href: '/subprocessors' },
  { label: 'Accessibility', href: '/accessibility' },
  { label: 'Refund policy', href: '/refund-policy' },
  { label: 'Cookies', href: '/cookies' },
];

interface ColumnProps {
  title: string;
  links: FooterLink[];
}

function Column({ title, links }: ColumnProps) {
  return (
    <div>
      <h3 className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-rule)] mb-4">
        {title}
      </h3>
      <ul className="flex flex-col gap-3">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="text-sm text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-cream-on-graphite)] hover:underline hover:decoration-[var(--color-rule)] hover:underline-offset-2"
            >
              {link.label}
            </Link>
            {link.subtitle ? (
              <div className="mt-0.5 text-[11px] text-[var(--color-fg-faint)]">{link.subtitle}</div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MarketingFooter() {
  return (
    <footer className="bg-[var(--color-graphite)] py-16">
      {/* Double-rule masthead separator: thick amber + hairline soft */}
      <div className="border-t border-[var(--color-rule)]" />
      <div className="mt-2 border-t border-[var(--color-rule-soft)]" />

      <div className="container mx-auto px-4 mt-12">
        <div className="grid gap-10 md:grid-cols-3 lg:grid-cols-6">
          {/* Brand column */}
          <div className="lg:col-span-1 md:col-span-3">
            <div className="mb-4">
              <span className="font-display italic font-bold text-2xl text-[var(--color-cream-on-graphite)]">
                AGI Workforce
              </span>
            </div>
            <p className="text-sm font-display italic text-[var(--color-fg-muted)] leading-relaxed">
              Beyond one model. Beyond one surface. AGI in your hands.
            </p>
            <p className="mt-4 font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-fg-quiet)] leading-relaxed">
              Built by AGI Automation LLC in Austin, TX.
            </p>
          </div>

          <Column title="Product" links={productLinks} />
          <Column title="Why us" links={whyLinks} />
          <Column title="Platforms" links={platformLinks} />
          <Column title="Resources" links={resourcesLinks} />
          <Column title="Company" links={companyLinks} />
        </div>

        <div className="mt-12 grid gap-10 md:grid-cols-3 lg:grid-cols-6">
          <div className="lg:col-span-1 md:col-span-3 hidden lg:block" />
          <div className="md:col-span-3 lg:col-span-5">
            <Column title="Trust & legal" links={trustLinks} />
          </div>
        </div>

        <div className="mt-12 border-t border-[var(--color-rule-soft)] pt-8 flex flex-col items-center gap-2 text-center sm:flex-row sm:justify-between sm:text-left">
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-fg-quiet)]">
              &copy; {new Date().getFullYear()} AGI Automation LLC. All rights reserved.
            </div>
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-fg-quiet)] mt-1">
              Proprietary. License: see /terms.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-fg-quiet)]">
            <Link
              href="/sitemap-page"
              className="hover:text-[var(--color-cream-on-graphite)] hover:underline hover:decoration-[var(--color-rule)] hover:underline-offset-2 transition-colors"
            >
              Sitemap
            </Link>
            <span className="text-[var(--color-fg-faint)]" aria-hidden="true">
              ·
            </span>
            <Link
              href="/legal"
              className="hover:text-[var(--color-cream-on-graphite)] hover:underline hover:decoration-[var(--color-rule)] hover:underline-offset-2 transition-colors"
            >
              Legal index
            </Link>
            <span className="text-[var(--color-fg-faint)]" aria-hidden="true">
              ·
            </span>
            <Link
              href="/status"
              className="hover:text-[var(--color-cream-on-graphite)] hover:underline hover:decoration-[var(--color-rule)] hover:underline-offset-2 transition-colors"
            >
              System status
            </Link>
          </div>
        </div>

        <div className="mt-6 text-center font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--color-fg-faint)]">
          Coming soon: Azure OpenAI, AWS Bedrock provider integrations.
        </div>
      </div>
    </footer>
  );
}
