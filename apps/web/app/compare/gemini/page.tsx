import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, CheckCircle2, AlertCircle, Minus } from 'lucide-react';

import { Header } from '@/components/layout/Header';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { MARKETING } from '@/lib/marketing-constants';

export const metadata: Metadata = {
  title: 'AGI Workforce vs Gemini | Honest Comparison',
  description:
    'AGI Workforce vs Google Gemini: multi-provider support, BYOK, local LLM, CLI, desktop app, mobile, computer use, browser extension, VS Code extension, and pricing compared.',
  openGraph: {
    title: 'AGI Workforce vs Gemini — An Honest Comparison',
    description:
      'Gemini 3 has impressive multimodal and long-context capabilities. AGI Workforce runs Gemini alongside Claude, GPT-5, and local models in one thread.',
    type: 'website',
    url: 'https://agiworkforce.com/compare/gemini',
  },
  alternates: { canonical: '/compare/gemini' },
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
    usNote: `${MARKETING.providers.display} providers (Gemini 3, Claude 4, GPT-5, Grok 4, and more)`,
    them: 'partial',
    themNote: 'Gemini family only',
  },
  {
    feature: 'BYOK support',
    us: 'yes',
    usNote: `All ${MARKETING.providers.display} cloud providers`,
    them: 'no',
    themNote: 'Subscription-only; no API key passthrough',
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
    themNote: 'Gemini models only',
  },
  {
    feature: 'CLI',
    us: 'yes',
    usNote: 'Rust CLI, 22 subcommands, TUI',
    them: 'partial',
    themNote: 'Gemini CLI (Node.js, in development)',
  },
  {
    feature: 'Desktop app',
    us: 'yes',
    usNote: 'Tauri, macOS / Windows / Linux',
    them: 'partial',
    themNote: 'Gemini web app only; no native desktop',
  },
  {
    feature: 'Mobile app',
    us: 'yes',
    usNote: 'iOS + Android (Expo)',
    them: 'yes',
    themNote: 'Google Gemini iOS and Android apps',
  },
  {
    feature: 'Computer use',
    us: 'partial',
    usNote: 'Desktop: browser, terminal, file I/O',
    them: 'partial',
    themNote: 'Project Astra features; limited GA',
  },
  {
    feature: 'Browser extension',
    us: 'yes',
    usNote: 'Chrome MV3, v1.2.0',
    them: 'partial',
    themNote: 'Google ships Gemini in Chrome sidebar',
  },
  {
    feature: 'VS Code extension',
    us: 'yes',
    usNote: 'v0.3.0, multi-provider',
    them: 'yes',
    themNote: 'Gemini Code Assist for VS Code',
  },
  {
    feature: 'Free tier',
    us: 'yes',
    usNote: 'Local mode: free forever. BYOK: free forever.',
    them: 'yes',
    themNote: 'Gemini free tier exists',
  },
  {
    feature: 'Pricing (paid)',
    us: 'partial',
    usNote: 'Hobby subscription + BYOK; Pro/Max on waitlist',
    them: 'partial',
    themNote: 'Gemini Advanced (Google One AI Premium)',
  },
];

function StatusIcon({ status }: { status: RowStatus }) {
  if (status === 'yes') return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />;
  if (status === 'no') return <AlertCircle className="h-4 w-4 shrink-0 text-red-400/70" />;
  return <Minus className="h-4 w-4 shrink-0 text-[#888480]" />;
}

export default function CompareGeminiPage() {
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
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/[0.06] px-3 py-1 text-sm text-blue-400">
                vs Google
              </div>
              <h1 className="font-heading text-4xl tracking-tight md:text-5xl lg:text-6xl">
                AGI Workforce vs Gemini
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-[#888480]">
                Gemini 3 is genuinely impressive for multimodal tasks and long-document analysis.
                AGI Workforce surfaces those capabilities alongside Claude, GPT-5, and local models
                in one thread.
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
                      Gemini
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
              Accurate as of May 2026. Google ships Gemini mobile apps, VS Code extension (Gemini
              Code Assist), and Chrome sidebar integration. We acknowledge all of these.
            </p>
          </div>
        </section>

        {/* When to use Gemini instead */}
        <section className="border-y border-white/[0.05] bg-[#0c0c0e] py-16 md:py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl">
              <h2 className="mb-6 font-heading text-2xl tracking-tight md:text-3xl">
                When to use Gemini instead
              </h2>
              <div className="space-y-3">
                {[
                  'You live in the Google Workspace ecosystem and want deep Docs/Sheets integration.',
                  'You need the native Gemini Advanced experience with Google One subscription.',
                  'You are already using Gemini Code Assist and it covers your IDE needs.',
                  "You rely on Google's native multimodal features (image, audio, video) with Gemini.",
                  'You prefer Google-managed privacy and compliance for enterprise data.',
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
                    title: 'Gemini 3 alongside every other provider',
                    desc: 'Use Gemini for long-document analysis, Claude 4 for reasoning, GPT-5 for code review. One thread, no context loss.',
                  },
                  {
                    title: 'BYOK: your Google API key, your cost',
                    desc: 'Bring your own Google AI API key. Pay Google directly at published rates. No Gemini Advanced subscription needed for API access.',
                  },
                  {
                    title: 'Native desktop app',
                    desc: 'Gemini has no native desktop app. AGI Workforce Desktop runs natively on macOS, Windows, and Linux with local storage and offline capability.',
                  },
                  {
                    title: 'Local fallback when offline',
                    desc: 'No internet? Ollama or LM Studio runs on your machine. Same AGI Workforce interface, zero cloud dependency.',
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
              Use Gemini in AGI Workforce.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-[#888480]">
              Bring your Google API key. Gemini 3 models, alongside Claude 4, GPT-5, and local AI.
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
