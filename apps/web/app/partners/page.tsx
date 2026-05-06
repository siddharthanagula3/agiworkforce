import Link from 'next/link';
import type { Metadata } from 'next';
import { Plug, Building2, Users, ArrowRight, Handshake } from 'lucide-react';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { MARKETING } from '../../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'Partners | AGI Workforce',
  description: 'Partner with AGI Workforce. Technology, channel, and integration partner programs.',
  alternates: { canonical: 'https://agiworkforce.com/partners' },
};

const partnerTypes = [
  {
    icon: Plug,
    title: 'Technology Partners',
    description:
      'MCP server builders, model providers, and tool vendors whose integrations extend the AGI Workforce platform. We promote and co-market your server to our user base.',
    examples: ['MCP server publishers', 'AI model providers', 'Productivity tool vendors'],
  },
  {
    icon: Building2,
    title: 'Channel Partners',
    description:
      'Resellers, agencies, and managed service providers who deploy and support AGI Workforce for their clients. Volume pricing and white-label options available.',
    examples: ['IT resellers', 'Managed AI service providers', 'Enterprise consultancies'],
  },
  {
    icon: Users,
    title: 'Integration Partners',
    description:
      'Companies building native integrations with AGI Workforce via our API or MCP protocol. We co-invest in joint solutions for mutual customer value.',
    examples: ['SaaS platforms', 'Workflow automation tools', 'Business intelligence vendors'],
  },
];

const benefits = [
  'Listed in our integrations directory (/integrations)',
  'Co-marketing opportunities and joint announcements',
  'Early access to new API features and roadmap',
  'Direct access to the AGI Workforce engineering team',
  'Volume pricing for channel and reseller partners',
  'Technical support and onboarding assistance',
];

export default function PartnersPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#09090b] text-[#edebe8]">
      <Header />
      <main className="flex-1 pt-24">
        {/* Hero */}
        <section className="py-20 md:py-28">
          <div className="container mx-auto px-4 text-center">
            <div className="mb-4 inline-flex items-center rounded-md border border-[#555150]/40 bg-[#555150]/10 px-3 py-1 text-sm text-[#c8892a]">
              <Handshake className="mr-2 h-4 w-4" />
              Partners
            </div>
            <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-[#edebe8] md:text-5xl">
              Partner with AGI Workforce.
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-lg text-[#888480]">
              {MARKETING.providers.display} providers. {MARKETING.surfaces.display} surfaces. Bring
              your tools, your channels, or your integrations to a growing platform.
            </p>
          </div>
        </section>

        {/* Partner types */}
        <section className="bg-black py-16">
          <div className="container mx-auto px-4">
            <div className="grid gap-6 md:grid-cols-3">
              {partnerTypes.map((type) => (
                <div
                  key={type.title}
                  className="rounded-xl border border-[#1a1917] bg-[#09090b] p-6"
                >
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-[#c8892a]/10 border border-[#c8892a]/20">
                    <type.icon className="h-5 w-5 text-[#c8892a]" />
                  </div>
                  <h2 className="mb-3 text-lg font-semibold text-[#edebe8]">{type.title}</h2>
                  <p className="mb-4 text-sm text-[#888480] leading-relaxed">{type.description}</p>
                  <ul className="space-y-1.5">
                    {type.examples.map((ex) => (
                      <li key={ex} className="flex items-center gap-2 text-xs text-[#555150]">
                        <span className="h-1 w-1 rounded-full bg-[#c8892a]" />
                        {ex}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Benefits */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-2xl">
              <h2 className="mb-8 text-center text-2xl font-bold text-[#edebe8]">
                Partner benefits
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {benefits.map((benefit) => (
                  <div
                    key={benefit}
                    className="flex items-start gap-3 rounded-lg border border-[#1a1917] bg-black/50 px-4 py-3 text-sm text-[#888480]"
                  >
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c8892a]" />
                    {benefit}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-black py-16">
          <div className="container mx-auto px-4 text-center">
            <h2 className="mb-3 text-2xl font-bold text-[#edebe8]">Apply to partner</h2>
            <p className="mb-8 text-[#888480]">
              Tell us about your company, your product, and how you see the partnership working. We
              review every application.
            </p>
            <Link
              href="/contact-sales"
              className="inline-flex items-center gap-2 rounded-md bg-[#c8892a] px-8 py-3 text-sm font-medium text-black transition-colors hover:bg-[#c8892a]/90"
            >
              Apply via contact form
              <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="mt-4 text-xs text-[#555150]">
              Partner program is in early formation. We will follow up within 3 business days.
            </p>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
