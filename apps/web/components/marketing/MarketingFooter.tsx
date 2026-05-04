import { Bot } from 'lucide-react';
import Link from 'next/link';

const productLinks = [
  { label: 'Features', href: '/features/ai-chat' },
  { label: 'AI Skills', href: '/features/ai-skills' },
  { label: 'Plugins & MCP', href: '/features/plugins' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Download', href: '/download' },
  { label: 'Changelog', href: '/changelog' },
];

const companyLinks = [
  { label: 'About', href: '/about' },
  { label: 'Documentation', href: '/docs' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Contact', href: '/contact' },
];

const legalLinks = [
  { label: 'Privacy', href: '/privacy', subtitle: 'Effective 2026-05-04' },
  { label: 'Terms', href: '/terms' },
  { label: 'Security', href: '/security' },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-white/10 bg-black py-16">
      <div className="container mx-auto px-4">
        <div className="grid gap-10 md:grid-cols-4">
          {/* Brand column */}
          <div className="md:col-span-1">
            <div className="flex items-center gap-2 font-bold mb-4">
              <Bot className="h-5 w-5 text-[#c8892a]" />
              <span className="text-white">AGI Workforce</span>
            </div>
            <p className="text-sm text-zinc-500 leading-relaxed">
              AI automation for your desktop. Built by AGI Automation LLC in Austin, TX.
            </p>
          </div>

          {/* Product column */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-4">
              Product
            </h3>
            <ul className="flex flex-col gap-3">
              {productLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-zinc-500 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company column */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-4">
              Company
            </h3>
            <ul className="flex flex-col gap-3">
              {companyLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-zinc-500 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal column */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-4">
              Legal
            </h3>
            <ul className="flex flex-col gap-3">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-zinc-500 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                  {link.subtitle ? (
                    <div className="mt-0.5 text-[11px] text-zinc-600">{link.subtitle}</div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-white/10 pt-8 text-center text-sm text-zinc-600 space-y-1">
          <div>&copy; {new Date().getFullYear()} AGI Automation LLC. All rights reserved.</div>
          <div>&copy; 2026 AGI Workforce. Proprietary.</div>
          <div className="text-xs text-zinc-700">
            Coming soon: Azure OpenAI, AWS Bedrock provider integrations.
          </div>
        </div>
      </div>
    </footer>
  );
}
