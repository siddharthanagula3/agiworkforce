import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight,
  CheckCircle2,
  Globe,
  HardDrive,
  Key,
  Server,
  Zap,
  AlertCircle,
} from 'lucide-react';

import { Header } from '@/components/layout/Header';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { MARKETING } from '@/lib/marketing-constants';

export const metadata: Metadata = {
  title: `${MARKETING.providers.display} AI Providers | AGI Workforce`,
  description:
    'Switch between Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Qwen, Moonshot, Zhipu, Ollama, LM Studio, and custom endpoints — all in one conversation thread.',
  openGraph: {
    title: `${MARKETING.providers.display} Providers. One Conversation. | AGI Workforce`,
    description:
      'The only AI platform that lets you switch providers mid-thread. 12 named registrations + unlimited custom OpenAI-compatible BYO endpoints, zero lock-in.',
    type: 'website',
    url: 'https://agiworkforce.com/providers',
  },
  alternates: { canonical: '/providers' },
};

const providers = [
  {
    name: 'Anthropic',
    models: 'Claude 4 family',
    desc: 'State-of-the-art reasoning, extended thinking, and long context.',
    badge: 'Cloud',
    byok: true,
    oauth: true,
    local: false,
  },
  {
    name: 'OpenAI',
    models: 'GPT-5 family',
    desc: 'Flagship general intelligence and coding models.',
    badge: 'Cloud',
    byok: true,
    oauth: false,
    local: false,
  },
  {
    name: 'Google',
    models: 'Gemini 3 family',
    desc: 'Multimodal models with massive context windows.',
    badge: 'Cloud',
    byok: true,
    oauth: false,
    local: false,
  },
  {
    name: 'xAI',
    models: 'Grok 4',
    desc: 'Real-time web access and unfiltered reasoning.',
    badge: 'Cloud',
    byok: true,
    oauth: false,
    local: false,
  },
  {
    name: 'DeepSeek',
    models: 'DeepSeek family',
    desc: 'Open-weight models strong at math and code.',
    badge: 'Cloud',
    byok: true,
    oauth: false,
    local: false,
  },
  {
    name: 'Perplexity',
    models: 'Sonar family',
    desc: 'Search-augmented models with live citations.',
    badge: 'Cloud',
    byok: true,
    oauth: false,
    local: false,
  },
  {
    name: 'Qwen',
    models: 'Qwen family',
    desc: 'Alibaba Cloud multilingual and coding models.',
    badge: 'Cloud',
    byok: true,
    oauth: false,
    local: false,
  },
  {
    name: 'Moonshot (Kimi)',
    models: 'Kimi family',
    desc: 'Long-context and multimodal reasoning from China.',
    badge: 'Cloud',
    byok: true,
    oauth: false,
    local: false,
  },
  {
    name: 'Zhipu (GLM)',
    models: 'GLM family',
    desc: 'Chinese-language specialist models with tool calling.',
    badge: 'Cloud',
    byok: true,
    oauth: false,
    local: false,
  },
  {
    name: 'Ollama',
    models: 'Llama, Mistral, Phi, Qwen, Gemma, and more',
    desc: 'Run any open-weight model locally. No API key needed.',
    badge: 'Local',
    byok: false,
    oauth: false,
    local: true,
  },
  {
    name: 'LM Studio',
    models: 'GGUF models',
    desc: 'Desktop app for running quantized models locally.',
    badge: 'Local',
    byok: false,
    oauth: false,
    local: true,
  },
  {
    name: 'Custom Endpoint',
    models: 'Any OpenAI-compatible API',
    desc: 'Point at any OpenAI-compatible server: local, private, or hosted.',
    badge: 'BYOK',
    byok: true,
    oauth: false,
    local: false,
  },
] as const;

const badgeColors: Record<string, string> = {
  Cloud: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  Local: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  BYOK: 'bg-[#c8892a]/10 text-[#c8892a] border border-[#c8892a]/20',
};

export default function ProvidersPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-[#edebe8]">
      <Header />

      <main className="pt-24">
        {/* Hero */}
        <section className="relative overflow-hidden pt-20 pb-24 md:pt-28 md:pb-32">
          <div className="pointer-events-none absolute inset-0 [background-image:radial-gradient(rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:28px_28px]" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[500px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#c8892a]/[0.06] blur-[160px]" />

          <div className="container relative mx-auto px-4 text-center">
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-[#c8892a]/25 bg-[#c8892a]/[0.07] px-4 py-1.5 text-sm font-medium text-[#c8892a]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#c8892a]" />
              {MARKETING.providers.display} Providers wired in
            </div>

            <h1 className="font-heading leading-[0.92] tracking-tight">
              <span className="block text-5xl md:text-7xl lg:text-[5.5rem]">
                {MARKETING.providers.display} providers.
              </span>
              <span className="block bg-gradient-to-r from-[#c8892a] via-[#e8af50] to-[#c8892a] bg-clip-text text-5xl text-transparent md:text-7xl lg:text-[5.5rem]">
                One conversation.
              </span>
            </h1>

            <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-[#888480] md:text-xl">
              Switch models mid-thread without losing context. Start with Claude, hand off to GPT,
              verify with Gemini. Zero lock-in.
            </p>

            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/download"
                className="group inline-flex h-12 items-center gap-2 rounded-md bg-[#c8892a] px-8 text-sm font-semibold text-[#09090b] transition-all hover:bg-[#d4993a]"
              >
                Download Free
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/chat"
                className="inline-flex h-12 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-8 text-sm font-medium text-[#a8a4a0] transition-all hover:border-white/20 hover:bg-white/[0.06] hover:text-[#edebe8]"
              >
                Try Web Chat
              </Link>
            </div>
          </div>
        </section>

        {/* Provider Grid */}
        <section className="border-y border-white/[0.05] bg-[#0c0c0e] py-20 md:py-28">
          <div className="container mx-auto px-4">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#c8892a]">
              All providers
            </p>
            <h2 className="font-heading text-3xl tracking-tight md:text-4xl">
              Every major model family, in one place
            </h2>
            <p className="mt-4 max-w-xl text-[#888480]">
              12 named provider registrations plus unlimited custom OpenAI-compatible BYO endpoints
              in our open Rust CLI at{' '}
              <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs text-[#c8892a]">
                apps/cli/src/models.rs
              </code>
              . Cloud, local, and custom endpoints all supported.
            </p>

            <div className="mt-12 grid gap-px bg-[#1a1917] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {providers.map((p) => (
                <div
                  key={p.name}
                  className="group flex flex-col bg-[#09090b] p-6 transition-colors hover:bg-[#0f0e0c]"
                >
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-[#edebe8]">{p.name}</div>
                      <div className="mt-0.5 font-mono text-xs text-[#555150]">{p.models}</div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badgeColors[p.badge]}`}
                    >
                      {p.badge}
                    </span>
                  </div>
                  <p className="flex-1 text-sm leading-relaxed text-[#888480]">{p.desc}</p>
                  <div className="mt-4 flex items-center gap-3">
                    {p.byok && (
                      <span className="flex items-center gap-1 text-[10px] text-[#555150]">
                        <Key className="h-3 w-3" /> BYOK
                      </span>
                    )}
                    {p.local && (
                      <span className="flex items-center gap-1 text-[10px] text-[#555150]">
                        <HardDrive className="h-3 w-3" /> Local
                      </span>
                    )}
                    {p.oauth && (
                      <span className="flex items-center gap-1 text-[10px] text-[#555150]">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" /> OAuth
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Mid-conversation switching demo (visual mock) */}
        <section className="py-20 md:py-28">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl">
              <p className="mb-3 text-center text-[10px] font-semibold uppercase tracking-[0.22em] text-[#c8892a]">
                How it works
              </p>
              <h2 className="text-center font-heading text-3xl tracking-tight md:text-4xl">
                Switch providers mid-conversation
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-center text-[#888480]">
                One thread. Multiple models. Context carries across every switch.
              </p>

              <div className="mt-10 rounded-2xl border border-white/[0.08] bg-[#0f0f11] p-6">
                {/* Mock conversation */}
                <div className="space-y-4">
                  {/* Model switch indicator */}
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-white/[0.06]" />
                    <span className="rounded-full bg-white/[0.04] px-3 py-1 font-mono text-[10px] text-[#555150]">
                      Model: Claude 4 Sonnet
                    </span>
                    <div className="h-px flex-1 bg-white/[0.06]" />
                  </div>
                  <div className="flex gap-3">
                    <div className="mt-1 h-7 w-7 shrink-0 rounded-full bg-[#c8892a]/20 flex items-center justify-center">
                      <span className="font-mono text-[9px] font-bold text-[#c8892a]">A</span>
                    </div>
                    <div className="rounded-xl rounded-tl-sm bg-[#1a1917] px-4 py-3 text-sm text-[#a8a4a0]">
                      Here is the architecture diagram for your microservices proposal...
                    </div>
                  </div>

                  {/* Model switch indicator */}
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-white/[0.06]" />
                    <span className="rounded-full border border-[#c8892a]/20 bg-[#c8892a]/[0.07] px-3 py-1 font-mono text-[10px] text-[#c8892a]">
                      Switched to GPT-5 ↓
                    </span>
                    <div className="h-px flex-1 bg-white/[0.06]" />
                  </div>
                  <div className="flex gap-3">
                    <div className="mt-1 h-7 w-7 shrink-0 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <span className="font-mono text-[9px] font-bold text-emerald-400">O</span>
                    </div>
                    <div className="rounded-xl rounded-tl-sm bg-[#1a1917] px-4 py-3 text-sm text-[#a8a4a0]">
                      Building on that diagram: the API gateway pattern looks right, but consider
                      adding a circuit breaker at the payment service boundary...
                    </div>
                  </div>

                  {/* Model switch indicator */}
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-white/[0.06]" />
                    <span className="rounded-full border border-blue-500/20 bg-blue-500/[0.07] px-3 py-1 font-mono text-[10px] text-blue-400">
                      Switched to Gemini 3 ↓
                    </span>
                    <div className="h-px flex-1 bg-white/[0.06]" />
                  </div>
                  <div className="flex gap-3">
                    <div className="mt-1 h-7 w-7 shrink-0 rounded-full bg-blue-500/20 flex items-center justify-center">
                      <span className="font-mono text-[9px] font-bold text-blue-400">G</span>
                    </div>
                    <div className="rounded-xl rounded-tl-sm bg-[#1a1917] px-4 py-3 text-sm text-[#a8a4a0]">
                      Agreed on the circuit breaker. Here is a cost estimate for each pattern across
                      GCP, AWS, and Azure...
                    </div>
                  </div>
                </div>

                <p className="mt-5 text-center text-xs text-[#444240]">
                  Visual mock. All three responses share the same thread context.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Lock-in comparison */}
        <section className="border-y border-white/[0.05] bg-[#0c0c0e] py-20 md:py-28">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl">
              <h2 className="text-center font-heading text-3xl tracking-tight md:text-4xl">
                Anthropic locks you to Claude only. We don&apos;t.
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-center text-[#888480]">
                Claude.ai is a great product. But if you want Claude and GPT and Gemini and local
                models in the same thread, AGI Workforce is the only option.
              </p>

              <div className="mt-10 grid gap-4 sm:grid-cols-2">
                <div className="relative rounded-2xl border border-[#c8892a]/20 bg-[#111114] p-6">
                  <div className="absolute inset-x-0 top-0 h-px rounded-t-2xl bg-gradient-to-r from-transparent via-[#c8892a]/40 to-transparent" />
                  <div className="mb-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#c8892a]">
                    AGI Workforce
                  </div>
                  <ul className="space-y-3">
                    {[
                      `${MARKETING.providers.display} providers in one thread`,
                      'Switch models at any message',
                      'Context carries across switches',
                      'BYOK for any provider',
                      'Local Ollama and LM Studio',
                      'Custom OpenAI-compatible endpoints',
                    ].map((item) => (
                      <li key={item} className="flex items-center gap-2.5 text-sm text-[#a8a4a0]">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-2xl border border-white/[0.06] bg-[#0f0f11] p-6">
                  <div className="mb-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#444240]">
                    Single-provider products
                  </div>
                  <ul className="space-y-3">
                    {[
                      'One model family only',
                      'No mid-thread switching',
                      'Context resets on provider change',
                      'No BYOK (or your account only)',
                      'No local LLM support',
                      'No custom endpoints',
                    ].map((item) => (
                      <li key={item} className="flex items-center gap-2.5 text-sm text-[#555150]">
                        <AlertCircle className="h-4 w-4 shrink-0 text-red-500/60" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Coming soon */}
        <section className="py-16">
          <div className="container mx-auto px-4 text-center">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm text-[#555150]">
              <Server className="h-4 w-4" />
              Azure OpenAI and AWS Bedrock are coming soon.
            </div>
            <p className="mt-4 text-sm text-[#444240]">
              Enterprise-managed cloud routing. Tracked in our public roadmap.
            </p>
          </div>
        </section>

        {/* Why it matters */}
        <section className="border-t border-white/[0.05] bg-[#0c0c0e] py-20 md:py-28">
          <div className="container mx-auto px-4">
            <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-3">
              {[
                {
                  icon: Zap,
                  title: 'Best model for each task',
                  desc: 'Claude for writing. GPT-5 for code. Gemini for long documents. Use the right tool.',
                },
                {
                  icon: Globe,
                  title: 'No single-vendor dependency',
                  desc: 'Outages, price hikes, and model deprecations hit less hard when you can route around them.',
                },
                {
                  icon: Key,
                  title: 'Your keys, your cost',
                  desc: 'Pay providers directly. No AGI Workforce markup. BYOK on every cloud provider.',
                },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex flex-col gap-3">
                  <Icon className="h-5 w-5 text-[#c8892a]" />
                  <h3 className="font-semibold text-[#edebe8]">{title}</h3>
                  <p className="text-sm leading-relaxed text-[#888480]">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 md:py-28">
          <div className="container mx-auto px-4 text-center">
            <h2 className="font-heading text-3xl tracking-tight md:text-4xl">
              Stop picking favorites.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-[#888480]">
              Use every provider you pay for, from one interface, in one thread.
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
                href="/compare"
                className="inline-flex h-12 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-8 text-sm font-medium text-[#a8a4a0] transition-all hover:border-white/20 hover:text-[#edebe8]"
              >
                See comparisons
              </Link>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
