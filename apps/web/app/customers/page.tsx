import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, Users, Briefcase, Code2, TrendingUp, Building } from 'lucide-react';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { MARKETING } from '../../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'Customers | AGI Workforce',
  description:
    'AGI Workforce customer stories and use cases. Early access. We are looking for launch partners.',
  alternates: { canonical: 'https://agiworkforce.com/customers' },
};

const useCaseCards = [
  {
    icon: Briefcase,
    title: 'Consulting Teams',
    description:
      'Run analysis across multiple AI providers in parallel. Switch mid-conversation to the best model for the task without losing context.',
    href: '/use-cases/consulting',
  },
  {
    icon: Building,
    title: 'IT Providers',
    description:
      'Deploy {MARKETING.providers.display} providers on a single managed platform for your clients, with BYOK for cost control.',
    href: '/use-cases/it-providers',
  },
  {
    icon: TrendingUp,
    title: 'Sales Teams',
    description:
      'Research prospects with web-enabled models, draft outreach with the model that fits your voice, and keep it all in one thread.',
    href: '/use-cases/sales-teams',
  },
  {
    icon: Code2,
    title: 'Startups',
    description:
      'Start free with Local mode or BYOK. Upgrade to Hobby when you need managed cloud. No vendor lock-in from day one.',
    href: '/use-cases/startups',
  },
];

export default function CustomersPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#09090b] text-[#edebe8]">
      <Header />
      <main className="flex-1 pt-24">
        {/* Hero */}
        <section className="py-20 md:py-28">
          <div className="container mx-auto px-4 text-center">
            <div className="mb-4 inline-flex items-center rounded-md border border-[#555150]/40 bg-[#555150]/10 px-3 py-1 text-sm text-[#c8892a]">
              <Users className="mr-2 h-4 w-4" />
              Customers
            </div>
            <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-[#edebe8] md:text-5xl">
              Built for teams who refuse to lock in to one model.
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-lg text-[#888480]">
              {MARKETING.providers.display} providers. {MARKETING.surfaces.display} surfaces. One
              platform.
            </p>
          </div>
        </section>

        {/* Honest empty state */}
        <section className="pb-16">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-2xl rounded-xl border border-[#1a1917] bg-black/50 p-10 text-center">
              <Users className="mx-auto mb-4 h-10 w-10 text-[#c8892a]" />
              <h2 className="mb-3 text-xl font-bold text-[#edebe8]">We are in early access.</h2>
              <p className="mb-2 text-[#888480]">
                Customer stories are coming soon. We are onboarding our first cohort of teams now.
              </p>
              <p className="mb-6 text-[#888480]">
                Want to be a launch partner? We are looking for teams who need multi-provider AI on{' '}
                {MARKETING.surfaces.display} surfaces and are willing to share early feedback.
              </p>
              <Link
                href="/contact-sales"
                className="inline-flex items-center gap-2 rounded-md bg-[#c8892a] px-6 py-2.5 text-sm font-medium text-black transition-colors hover:bg-[#c8892a]/90"
              >
                Become a Launch Partner
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* Use Cases */}
        <section className="bg-black py-16">
          <div className="container mx-auto px-4">
            <h2 className="mb-10 text-center text-2xl font-bold text-[#edebe8]">
              Who we are built for
            </h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {useCaseCards.map((card) => (
                <Link
                  key={card.title}
                  href={card.href}
                  className="group rounded-xl border border-[#1a1917] bg-[#09090b] p-6 transition-colors hover:border-[#c8892a]/30"
                >
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-[#c8892a]/10 border border-[#c8892a]/20">
                    <card.icon className="h-5 w-5 text-[#c8892a]" />
                  </div>
                  <h3 className="mb-2 font-semibold text-[#edebe8] group-hover:text-[#c8892a]">
                    {card.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-[#888480]">{card.description}</p>
                  <div className="mt-4 flex items-center gap-1 text-xs text-[#c8892a] opacity-0 transition-opacity group-hover:opacity-100">
                    Learn more <ArrowRight className="h-3 w-3" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20">
          <div className="container mx-auto px-4 text-center">
            <h2 className="mb-4 text-2xl font-bold text-[#edebe8]">Shape the product with us.</h2>
            <p className="mb-8 text-[#888480]">
              Early partners get direct access to the team, priority feature requests, and input on
              our roadmap.
            </p>
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/contact-sales"
                className="inline-flex items-center gap-2 rounded-md bg-[#c8892a] px-8 py-3 text-sm font-medium text-black transition-colors hover:bg-[#c8892a]/90"
              >
                Talk to Us
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 rounded-md border border-[#1a1917] bg-black/50 px-8 py-3 text-sm font-medium text-[#888480] transition-colors hover:bg-[#1a1917] hover:text-[#edebe8]"
              >
                See Pricing
              </Link>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
