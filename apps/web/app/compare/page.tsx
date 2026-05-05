import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';

import { Header } from '@/components/layout/Header';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { MARKETING } from '@/lib/marketing-constants';

export const metadata: Metadata = {
  title: 'How AGI Workforce Compares | AGI Workforce',
  description:
    'Honest comparison of AGI Workforce vs Claude.ai, ChatGPT, Gemini, and Perplexity. Multi-provider, BYOK, local LLM, and cross-provider continuity explained.',
  openGraph: {
    title: 'AGI Workforce vs the Competition — An Honest Look',
    description:
      'We run all the providers. See how we compare to single-provider platforms side by side.',
    type: 'website',
    url: 'https://agiworkforce.com/compare',
  },
  alternates: { canonical: '/compare' },
};

const comparisons = [
  {
    slug: 'claude',
    competitor: 'Claude.ai',
    tagline: 'Anthropic locks you to Claude only.',
    summary:
      'Claude.ai is the best single-model interface for Claude. If you need Claude plus any other provider in the same thread, AGI Workforce is the only option.',
    winFor: 'Multi-provider users who also love Claude',
    badge: 'Anthropic',
    color: 'text-[#c8892a] border-[#c8892a]/20 bg-[#c8892a]/[0.05]',
  },
  {
    slug: 'chatgpt',
    competitor: 'ChatGPT',
    tagline: 'OpenAI locks you to GPT models only.',
    summary:
      'ChatGPT is polished and widely used. AGI Workforce adds Claude, Gemini, local models, and BYOK alongside GPT — all in the same conversation.',
    winFor: 'Power users who want GPT and everything else',
    badge: 'OpenAI',
    color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/[0.05]',
  },
  {
    slug: 'gemini',
    competitor: 'Gemini',
    tagline: "Google's models. Google's interface.",
    summary:
      'Gemini 3 has impressive multimodal and long-context capabilities. AGI Workforce surfaces those same models alongside Claude, GPT, and local options.',
    winFor: 'Teams who need Gemini without giving up other providers',
    badge: 'Google',
    color: 'text-blue-400 border-blue-500/20 bg-blue-500/[0.05]',
  },
  {
    slug: 'perplexity',
    competitor: 'Perplexity',
    tagline: 'Search-first, single-product.',
    summary:
      'Perplexity excels at cited web research. AGI Workforce includes Perplexity Sonar models via BYOK, plus every other provider for tasks that do not need live search.',
    winFor: 'Users who want Perplexity plus coding, writing, and local AI',
    badge: 'Perplexity',
    color: 'text-purple-400 border-purple-500/20 bg-purple-500/[0.05]',
  },
];

export default function ComparePage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-[#edebe8]">
      <Header />

      <main className="pt-24">
        {/* Hero */}
        <section className="relative overflow-hidden pt-20 pb-24 md:pt-28 md:pb-32">
          <div className="pointer-events-none absolute inset-0 [background-image:radial-gradient(rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:28px_28px]" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[400px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#c8892a]/[0.05] blur-[150px]" />

          <div className="container relative mx-auto px-4 text-center">
            <h1 className="font-heading leading-[0.92] tracking-tight">
              <span className="block text-5xl md:text-7xl lg:text-[5rem]">How AGI Workforce</span>
              <span className="block bg-gradient-to-r from-[#c8892a] via-[#e8af50] to-[#c8892a] bg-clip-text text-5xl text-transparent md:text-7xl lg:text-[5rem]">
                compares
              </span>
            </h1>

            <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-[#888480] md:text-xl">
              We are not perfect at any one provider&apos;s product, but we run all of them in one
              place. {MARKETING.providers.display} providers, {MARKETING.surfaces.display} surfaces,
              zero lock-in.
            </p>
          </div>
        </section>

        {/* Comparison cards */}
        <section className="border-t border-white/[0.05] py-20 md:py-28">
          <div className="container mx-auto px-4">
            <div className="grid gap-6 md:grid-cols-2">
              {comparisons.map(({ slug, competitor, tagline, summary, winFor, badge, color }) => (
                <Link
                  key={slug}
                  href={`/compare/${slug}`}
                  className="group relative flex flex-col rounded-2xl border border-white/[0.07] bg-[#0f0f11] p-8 transition-all hover:border-white/[0.14] hover:bg-[#111113]"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <span
                      className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-wide ${color}`}
                    >
                      vs {badge}
                    </span>
                    <ArrowRight className="h-4 w-4 text-[#444240] transition-transform group-hover:translate-x-1 group-hover:text-[#c8892a]" />
                  </div>

                  <h2 className="mb-1 text-xl font-semibold text-[#edebe8]">
                    AGI Workforce vs {competitor}
                  </h2>
                  <p className="mb-4 text-sm font-medium text-[#666260]">{tagline}</p>
                  <p className="flex-1 text-sm leading-relaxed text-[#888480]">{summary}</p>

                  <div className="mt-6 flex items-center gap-2 text-xs text-[#555150]">
                    <span className="font-semibold text-[#c8892a]">Best for:</span>
                    {winFor}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* What we are and are not */}
        <section className="border-y border-white/[0.05] bg-[#0c0c0e] py-20 md:py-28">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl">
              <h2 className="mb-8 font-heading text-3xl tracking-tight md:text-4xl">
                Where AGI Workforce wins
              </h2>
              <div className="space-y-4">
                {[
                  {
                    title: 'Multi-provider in one thread',
                    desc: `${MARKETING.providers.display} providers. Start a conversation with Claude, hand off to GPT-5, verify with Gemini. Context carries across every switch.`,
                  },
                  {
                    title: 'BYOK across all providers',
                    desc: 'Bring your own API keys for any provider. Pay providers directly at their rates. No markup.',
                  },
                  {
                    title: 'Local LLM (Ollama and LM Studio)',
                    desc: 'Run open-weight models completely offline. Free forever. No API key needed.',
                  },
                  {
                    title: 'Cross-provider session continuity',
                    desc: 'One thread. Multiple models. Switch mid-conversation without losing context.',
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

              <h2 className="mb-6 mt-14 font-heading text-3xl tracking-tight md:text-4xl">
                Where single-provider products win
              </h2>
              <div className="space-y-4">
                {[
                  {
                    title: 'Deepest integration with one model',
                    desc: "If you exclusively use Claude, Claude.ai has the tightest integration with Anthropic's features: Projects, Memory, and Artifacts.",
                  },
                  {
                    title: 'Web search (Perplexity)',
                    desc: 'Perplexity is purpose-built for live, cited web search. AGI Workforce supports Perplexity Sonar via BYOK, but the native Perplexity UI is optimized for that specific workflow.',
                  },
                  {
                    title: 'Simplicity for a single task',
                    desc: 'If you only ever want one model for one thing, a single-provider product is simpler.',
                  },
                ].map(({ title, desc }) => (
                  <div
                    key={title}
                    className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5"
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
        <section className="py-20 md:py-28">
          <div className="container mx-auto px-4 text-center">
            <h2 className="font-heading text-3xl tracking-tight md:text-4xl">
              Try it free. Judge for yourself.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-[#888480]">
              Download in under a minute. Local mode requires no account.
            </p>
            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/download"
                className="group inline-flex h-12 items-center gap-2 rounded-md bg-[#c8892a] px-8 text-sm font-semibold text-[#09090b] transition-all hover:bg-[#d4993a]"
              >
                Download Free
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/providers"
                className="inline-flex h-12 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-8 text-sm font-medium text-[#a8a4a0] transition-all hover:border-white/20 hover:text-[#edebe8]"
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
