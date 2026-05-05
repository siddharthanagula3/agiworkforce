import Link from 'next/link';
import type { Metadata } from 'next';
import { GitBranch, Share2, MessageSquare, Mail, ArrowRight, Users } from 'lucide-react';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Community | AGI Workforce',
  description:
    'Join the AGI Workforce community. GitHub, Discord, Twitter/X, and newsletter. Build with us.',
  alternates: { canonical: 'https://agiworkforce.com/community' },
};

const channels = [
  {
    icon: GitBranch,
    title: 'GitHub',
    description:
      'Follow development, report bugs, and track issues. AGI Workforce is proprietary software, but we welcome bug reports and feature requests via GitHub Issues.',
    cta: 'View on GitHub',
    href: 'https://github.com/siddharthanagula3/agiworkforce',
    status: 'live' as const,
    note: 'Proprietary license. External code contributions are not currently accepted, but issue reports are welcome.',
  },
  {
    icon: MessageSquare,
    title: 'Discord',
    description:
      'Chat with other AGI Workforce users, get help, and share workflows. Server launching with early access.',
    cta: 'Join Discord',
    href: '#',
    status: 'soon' as const,
    note: 'Coming soon when early access opens.',
  },
  {
    icon: Share2,
    title: 'Twitter / X',
    description: 'Follow @agiworkforce for product updates, tips, and announcements.',
    cta: 'Follow @agiworkforce',
    href: 'https://twitter.com/agiworkforce',
    status: 'live' as const,
    note: null,
  },
  {
    icon: Mail,
    title: 'Newsletter',
    description:
      'Get product updates, changelog highlights, and early access invites delivered to your inbox.',
    cta: 'Subscribe',
    href: null,
    status: 'form' as const,
    note: null,
  },
];

export default function CommunityPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#09090b] text-[#edebe8]">
      <Header />
      <main className="flex-1 pt-24">
        {/* Hero */}
        <section className="py-20 md:py-28">
          <div className="container mx-auto px-4 text-center">
            <div className="mb-4 inline-flex items-center rounded-md border border-[#555150]/40 bg-[#555150]/10 px-3 py-1 text-sm text-[#c8892a]">
              <Users className="mr-2 h-4 w-4" />
              Community
            </div>
            <h1 className="mx-auto max-w-2xl text-4xl font-bold tracking-tight text-[#edebe8] md:text-5xl">
              Build with us.
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-lg text-[#888480]">
              We are building in public. Follow along, report issues, and help shape the product.
            </p>
          </div>
        </section>

        {/* Channels */}
        <section className="pb-20">
          <div className="container mx-auto px-4">
            <div className="grid gap-6 md:grid-cols-2">
              {channels.map((ch) => (
                <div key={ch.title} className="rounded-xl border border-[#1a1917] bg-black/50 p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#c8892a]/10 border border-[#c8892a]/20">
                        <ch.icon className="h-5 w-5 text-[#c8892a]" />
                      </div>
                      <h2 className="text-lg font-semibold text-[#edebe8]">{ch.title}</h2>
                    </div>
                    {ch.status === 'soon' && (
                      <span className="rounded-full border border-[#555150]/40 px-2 py-0.5 text-xs text-[#888480]">
                        Coming soon
                      </span>
                    )}
                  </div>
                  <p className="mb-4 text-sm text-[#888480]">{ch.description}</p>
                  {ch.note && <p className="mb-4 text-xs text-[#555150] italic">{ch.note}</p>}
                  {ch.status === 'form' ? (
                    <form className="flex gap-2" onSubmit={(e) => e.preventDefault()}>
                      <input
                        type="email"
                        placeholder="you@example.com"
                        className="flex-1 rounded-md border border-[#1a1917] bg-black px-3 py-2 text-sm text-[#edebe8] placeholder:text-[#555150] focus:border-[#c8892a]/50 focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="rounded-md bg-[#c8892a] px-4 py-2 text-sm font-medium text-black hover:bg-[#c8892a]/90"
                      >
                        Subscribe
                      </button>
                    </form>
                  ) : ch.status === 'soon' ? (
                    <span className="inline-flex items-center gap-2 text-sm text-[#555150]">
                      {ch.cta}
                    </span>
                  ) : (
                    <a
                      href={ch.href!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-md border border-[#1a1917] px-4 py-2 text-sm font-medium text-[#888480] transition-colors hover:bg-[#1a1917] hover:text-[#edebe8]"
                    >
                      {ch.cta}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Contributing note */}
        <section className="bg-black py-16">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-2xl rounded-xl border border-[#1a1917] bg-[#09090b] p-8">
              <h2 className="mb-3 text-lg font-bold text-[#edebe8]">About contributing</h2>
              <p className="mb-3 text-sm text-[#888480] leading-relaxed">
                AGI Workforce is proprietary software (AGI Automation LLC). We do not accept
                external code pull requests at this time.
              </p>
              <p className="text-sm text-[#888480] leading-relaxed">
                The best way to contribute is to file detailed bug reports and feature requests on
                GitHub Issues. We read and triage every one. Become a launch partner for direct
                product input.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <a
                  href="https://github.com/siddharthanagula3/agiworkforce"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-md border border-[#1a1917] px-4 py-2 text-sm font-medium text-[#888480] transition-colors hover:bg-[#1a1917] hover:text-[#edebe8]"
                >
                  <GitBranch className="h-4 w-4" />
                  File an issue
                </a>
                <Link
                  href="/contact-sales"
                  className="inline-flex items-center gap-2 rounded-md bg-[#c8892a] px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-[#c8892a]/90"
                >
                  Become a launch partner
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
