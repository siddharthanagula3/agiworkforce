import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, CheckCircle2, AlertCircle, Minus } from 'lucide-react';

import { Header } from '@/components/layout/Header';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { MARKETING } from '@/lib/marketing-constants';

export const metadata: Metadata = {
  title: 'AGI Workforce vs Claude.ai | Honest Comparison',
  description:
    'AGI Workforce vs Claude.ai: honest comparison of multi-provider support, BYOK, local LLM, CLI, desktop app, mobile, computer use, browser extensions, and pricing.',
  openGraph: {
    title: 'AGI Workforce vs Claude.ai — An Honest Comparison',
    description:
      'Both ship great products. The difference: AGI Workforce runs 10+ providers in one thread. Claude.ai runs Claude only.',
    type: 'website',
    url: 'https://agiworkforce.com/compare/claude',
  },
  alternates: { canonical: '/compare/claude' },
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
    usNote: `${MARKETING.providers.display} providers (Claude 4, GPT-5, Gemini 3, Grok 4, DeepSeek, and more)`,
    them: 'partial',
    themNote: 'Claude family only',
  },
  {
    feature: 'BYOK support',
    us: 'yes',
    usNote: `All ${MARKETING.providers.display} cloud providers`,
    them: 'no',
    themNote: 'No BYOK; subscription-only',
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
    themNote: 'Claude only; no switching',
  },
  {
    feature: 'CLI',
    us: 'yes',
    usNote: 'Rust CLI, 22 subcommands, TUI',
    them: 'yes',
    themNote: 'Claude Code (Rust, agentic)',
  },
  {
    feature: 'Desktop app',
    us: 'yes',
    usNote: 'Tauri, macOS / Windows / Linux',
    them: 'yes',
    themNote: 'Claude Desktop, macOS / Windows',
  },
  {
    feature: 'Mobile app',
    us: 'yes',
    usNote: 'iOS + Android (Expo)',
    them: 'yes',
    themNote: 'Claude iOS and Android apps',
  },
  {
    feature: 'Computer use',
    us: 'partial',
    usNote: 'Desktop: browser, terminal, file I/O',
    them: 'yes',
    themNote: 'Claude Cowork (GA April 2026)',
  },
  {
    feature: 'Browser extension',
    us: 'yes',
    usNote: 'Chrome MV3, v1.2.0',
    them: 'yes',
    themNote: 'Anthropic ships Chrome extension',
  },
  {
    feature: 'VS Code extension',
    us: 'yes',
    usNote: 'v0.3.0, multi-provider',
    them: 'yes',
    themNote: 'Anthropic ships VS Code extension',
  },
  {
    feature: 'Free tier',
    us: 'yes',
    usNote: 'Local mode: free forever. BYOK: free forever.',
    them: 'partial',
    themNote: 'Free tier exists, limited',
  },
  {
    feature: 'Pricing (paid)',
    us: 'partial',
    usNote: 'Hobby subscription + BYOK; Pro/Max on waitlist',
    them: 'partial',
    themNote: 'Claude.ai Pro subscription',
  },
];

function StatusIcon({ status }: { status: RowStatus }) {
  if (status === 'yes') return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />;
  if (status === 'no') return <AlertCircle className="h-4 w-4 shrink-0 text-red-400/70" />;
  if (status === 'waitlist') return <Minus className="h-4 w-4 shrink-0 text-[#c8892a]" />;
  return <Minus className="h-4 w-4 shrink-0 text-[#888480]" />;
}

export default function CompareClaudePage() {
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
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#c8892a]/20 bg-[#c8892a]/[0.06] px-3 py-1 text-sm text-[#c8892a]">
                vs Anthropic
              </div>
              <h1 className="font-heading text-4xl tracking-tight md:text-5xl lg:text-6xl">
                AGI Workforce vs Claude.ai
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-[#888480]">
                Claude.ai is one of the best AI products available. AGI Workforce is not trying to
                beat it at Claude. We run Claude and every other provider in the same thread.
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
                      Claude.ai
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
              Accurate as of May 2026. Anthropic ships desktop, mobile, CLI (Claude Code), Chrome
              extension, VS Code extension, and computer use (Claude Cowork). We acknowledge all of
              these.
            </p>
          </div>
        </section>

        {/* When to use Claude.ai instead */}
        <section className="border-y border-white/[0.05] bg-[#0c0c0e] py-16 md:py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl">
              <h2 className="mb-6 font-heading text-2xl tracking-tight md:text-3xl">
                When to use Claude.ai instead
              </h2>
              <div className="space-y-3">
                {[
                  'You exclusively use Claude models and never want to switch.',
                  "You need deep integration with Anthropic's Projects and Memory features.",
                  'You rely on Claude Cowork for full computer-use automation.',
                  'You prefer the Claude.ai UI or have existing claude.ai workflows.',
                  'Simplicity matters more than multi-provider flexibility.',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3 text-sm text-[#888480]">
                    <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#444240]" />
                    {item}
                  </div>
                ))}
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
                    title: `${MARKETING.providers.display} providers in one thread`,
                    desc: 'Start with Claude 4 for planning, switch to GPT-5 for code, use Gemini for document analysis. Context carries across every switch.',
                  },
                  {
                    title: 'BYOK without limits',
                    desc: 'Bring your own Anthropic key and your own OpenAI key and your own Google key. Pay providers directly.',
                  },
                  {
                    title: 'Local LLM, free forever',
                    desc: 'Ollama or LM Studio, integrated. Run Llama, Mistral, Phi, or any open-weight model completely offline.',
                  },
                  {
                    title: 'Six surfaces, one conversation',
                    desc: `Desktop, Web, Mobile, CLI, VS Code, Chrome. ${MARKETING.surfaces.display} surfaces, one thread.`,
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
              Use Claude in AGI Workforce.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-[#888480]">
              Bring your Anthropic API key. Claude 4 models, in the same thread as every other
              provider.
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
                href="/byok"
                className="inline-flex h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-7 text-sm font-medium text-[#a8a4a0] hover:border-white/20 hover:text-[#edebe8]"
              >
                Learn about BYOK
              </Link>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
