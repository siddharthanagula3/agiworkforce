import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, CheckCircle2, AlertCircle, Minus } from 'lucide-react';

import { Header } from '@/components/layout/Header';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { MARKETING } from '@/lib/marketing-constants';

export const metadata: Metadata = {
  title: 'AGI Workforce vs Perplexity | Honest Comparison',
  description:
    'AGI Workforce vs Perplexity: web search, multi-provider support, BYOK, local LLM, CLI, desktop app, mobile, browser extension, VS Code extension, and pricing compared.',
  openGraph: {
    title: 'AGI Workforce vs Perplexity — An Honest Comparison',
    description:
      'Perplexity is the best live-search AI product. AGI Workforce includes Perplexity Sonar via BYOK plus every other provider for tasks that do not need live search.',
    type: 'website',
    url: 'https://agiworkforce.com/compare/perplexity',
  },
  alternates: { canonical: '/compare/perplexity' },
};

type RowStatus = 'yes' | 'no' | 'partial' | 'waitlist';

interface CompareRow {
  feature: string;
  us: RowStatus;
  usNote: string;
  them: RowStatus;
  themNote: string;
}

const rows: CompareRow[] = [
  {
    feature: 'Models available',
    us: 'yes',
    usNote: `${MARKETING.providers.display} providers (Perplexity Sonar, Claude 4, GPT-5, Gemini 3, and more)`,
    them: 'partial',
    themNote: 'Perplexity Sonar models with web search',
  },
  {
    feature: 'Live web search',
    us: 'partial',
    usNote: 'Via Perplexity Sonar (BYOK). Not built-in for other providers.',
    them: 'yes',
    themNote: 'Core product; real-time citations',
  },
  {
    feature: 'BYOK support',
    us: 'yes',
    usNote: `All ${MARKETING.providers.display} cloud providers including Perplexity`,
    them: 'no',
    themNote: 'Subscription-only; no API key passthrough in chat',
  },
  {
    feature: 'Local LLM (Ollama / LM Studio)',
    us: 'yes',
    usNote: 'Desktop only, free forever',
    them: 'no',
    themNote: 'Not supported',
  },
  {
    feature: 'Cross-provider switching',
    us: 'yes',
    usNote: 'Mid-conversation, context preserved',
    them: 'no',
    themNote: 'Sonar models only; no cross-provider',
  },
  {
    feature: 'CLI',
    us: 'yes',
    usNote: 'Rust CLI, 22 subcommands, TUI',
    them: 'no',
    themNote: 'No CLI product',
  },
  {
    feature: 'Desktop app',
    us: 'yes',
    usNote: 'Tauri, macOS / Windows / Linux',
    them: 'yes',
    themNote: 'Perplexity desktop app (Electron)',
  },
  {
    feature: 'Mobile app',
    us: 'yes',
    usNote: 'iOS + Android (Expo)',
    them: 'yes',
    themNote: 'Perplexity iOS and Android apps',
  },
  {
    feature: 'Computer use',
    us: 'partial',
    usNote: 'Desktop: browser, terminal, file I/O',
    them: 'no',
    themNote: 'Not a computer-use product',
  },
  {
    feature: 'Browser extension',
    us: 'yes',
    usNote: 'Chrome MV3, v1.2.0',
    them: 'yes',
    themNote: 'Perplexity Chrome extension',
  },
  {
    feature: 'VS Code extension',
    us: 'yes',
    usNote: 'v0.3.0, multi-provider',
    them: 'no',
    themNote: 'No VS Code extension',
  },
  {
    feature: 'Free tier',
    us: 'yes',
    usNote: 'Local mode: free forever. BYOK: free forever.',
    them: 'yes',
    themNote: 'Free tier with limited searches',
  },
  {
    feature: 'Pricing (paid)',
    us: 'partial',
    usNote: 'Hobby subscription + BYOK; Pro/Max on waitlist',
    them: 'partial',
    themNote: 'Perplexity Pro subscription',
  },
];

function StatusIcon({ status }: { status: RowStatus }) {
  if (status === 'yes') return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />;
  if (status === 'no') return <AlertCircle className="h-4 w-4 shrink-0 text-red-400/70" />;
  return <Minus className="h-4 w-4 shrink-0 text-[#888480]" />;
}

export default function ComparePerplexityPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-[#edebe8]">
      <Header />

      <main className="pt-24">
        {/* Hero */}
        <section className="relative overflow-hidden pt-20 pb-16 md:pt-28 md:pb-20">
          <div className="pointer-events-none absolute inset-0 [background-image:radial-gradient(rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:28px_28px]" />
          <div className="container relative mx-auto px-4">
            <Link
              href="/compare"
              className="mb-8 inline-flex items-center gap-1.5 text-sm text-[#555150] hover:text-[#888480]"
            >
              <ArrowRight className="h-3.5 w-3.5 rotate-180" /> All comparisons
            </Link>
            <div className="max-w-3xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-purple-500/20 bg-purple-500/[0.06] px-3 py-1 text-sm text-purple-400">
                vs Perplexity
              </div>
              <h1 className="font-heading text-4xl tracking-tight md:text-5xl lg:text-6xl">
                AGI Workforce vs Perplexity
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-[#888480]">
                Perplexity is the best purpose-built live-search AI product. AGI Workforce is not
                trying to compete on that. We include Perplexity Sonar via BYOK and add every other
                provider for tasks that do not need live web results.
              </p>
            </div>
          </div>
        </section>

        {/* Comparison table */}
        <section className="border-t border-white/[0.05] py-16 md:py-20">
          <div className="container mx-auto px-4">
            <div className="overflow-x-auto rounded-2xl border border-white/[0.06]">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="py-4 px-5 text-left text-xs font-semibold uppercase tracking-widest text-[#555150]">
                      Feature
                    </th>
                    <th className="py-4 px-5 text-left text-xs font-semibold uppercase tracking-widest text-[#c8892a]">
                      AGI Workforce
                    </th>
                    <th className="py-4 px-5 text-left text-xs font-semibold uppercase tracking-widest text-[#444240]">
                      Perplexity
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={row.feature}
                      className={`border-b border-white/[0.04] ${i % 2 === 0 ? 'bg-white/[0.01]' : ''}`}
                    >
                      <td className="py-4 px-5 text-sm font-medium text-[#a8a4a0]">
                        {row.feature}
                      </td>
                      <td className="py-4 px-5 text-sm">
                        <div className="flex items-start gap-2">
                          <StatusIcon status={row.us} />
                          <span className="text-[#888480]">{row.usNote}</span>
                        </div>
                      </td>
                      <td className="py-4 px-5 text-sm">
                        <div className="flex items-start gap-2">
                          <StatusIcon status={row.them} />
                          <span className="text-[#666260]">{row.themNote}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-[#444240]">
              Accurate as of May 2026. Perplexity ships desktop app, mobile apps, and Chrome
              extension. We acknowledge all of these. Live search with real-time citations is
              Perplexity&apos;s core strength.
            </p>
          </div>
        </section>

        {/* When to use Perplexity instead */}
        <section className="border-y border-white/[0.05] bg-[#0c0c0e] py-16 md:py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl">
              <h2 className="mb-6 font-heading text-2xl tracking-tight md:text-3xl">
                When to use Perplexity instead
              </h2>
              <div className="space-y-3">
                {[
                  'Live web search with real-time citations is your primary use case.',
                  'You need Perplexity Pro Search features (deeper research, more sources).',
                  'You want the most polished search-first interface optimized for Sonar.',
                  'Academic or factual research where source attribution is critical.',
                  'You do not need coding, local AI, or cross-provider switching.',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3 text-sm text-[#888480]">
                    <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#444240]" />
                    {item}
                  </div>
                ))}
              </div>

              {/* Honest callout */}
              <div className="mt-8 rounded-xl border border-purple-500/15 bg-purple-500/[0.04] p-5">
                <p className="text-sm leading-relaxed text-[#888480]">
                  <span className="font-semibold text-[#edebe8]">Honest note:</span> For live search
                  with citations, Perplexity is the purpose-built tool and currently does it better
                  than any generalist platform. If that is your main workflow, use Perplexity
                  directly. AGI Workforce is the right choice when you need web search as one tool
                  among many, not the entire product.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* When AGI Workforce wins */}
        <section className="py-16 md:py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl">
              <h2 className="mb-6 font-heading text-2xl tracking-tight md:text-3xl">
                When AGI Workforce wins
              </h2>
              <div className="space-y-4">
                {[
                  {
                    title: 'Perplexity Sonar plus everything else',
                    desc: 'Bring your Perplexity API key. Use Sonar for web research, then switch to Claude 4 for writing, GPT-5 for code. One thread, full context.',
                  },
                  {
                    title: 'Coding and development workflows',
                    desc: 'Perplexity has no CLI, no VS Code extension, no local model support. AGI Workforce covers the full developer surface.',
                  },
                  {
                    title: 'Offline operation',
                    desc: 'Live search requires internet by definition. When you need AI offline, Ollama and LM Studio run locally in AGI Workforce Desktop.',
                  },
                  {
                    title: 'Multi-provider strategy',
                    desc: `Use the right model for each task. ${MARKETING.providers.display} providers in one thread. Perplexity is one of them.`,
                  },
                ].map(({ title, desc }) => (
                  <div
                    key={title}
                    className="rounded-xl border border-[#c8892a]/15 bg-[#c8892a]/[0.03] p-5"
                  >
                    <h3 className="mb-1.5 font-semibold text-[#edebe8]">{title}</h3>
                    <p className="text-sm leading-relaxed text-[#888480]">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-white/[0.05] bg-[#0c0c0e] py-16 md:py-20">
          <div className="container mx-auto px-4 text-center">
            <h2 className="font-heading text-2xl tracking-tight md:text-3xl">
              Use Perplexity Sonar in AGI Workforce.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-[#888480]">
              Bring your Perplexity API key. Sonar search, alongside coding models, writing models,
              and local AI in one thread.
            </p>
            <div className="mt-6 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/download"
                className="group inline-flex h-11 items-center gap-2 rounded-md bg-[#c8892a] px-7 text-sm font-semibold text-[#09090b] transition-all hover:bg-[#d4993a]"
              >
                Download Free
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/providers"
                className="inline-flex h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-7 text-sm font-medium text-[#a8a4a0] hover:border-white/20 hover:text-[#edebe8]"
              >
                See all providers
              </Link>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
