import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight,
  CheckCircle2,
  Key,
  Lock,
  Shield,
  AlertCircle,
  Monitor,
  Globe,
  Smartphone,
  Terminal,
  Code2,
  Layout,
} from 'lucide-react';

import { Header } from '@/components/layout/Header';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { MARKETING } from '@/lib/marketing-constants';

export const metadata: Metadata = {
  title: 'Bring Your Own Keys (BYOK) | AGI Workforce',
  description:
    'Paste your API key, pick your model, chat. Pay providers directly with no AGI Workforce markup. Keys encrypted with AES-256-GCM and ChaCha20-Poly1305. Local mode: keys never leave your device.',
  openGraph: {
    title: 'Your Keys. Your Data. Your Cost. | AGI Workforce',
    description:
      'BYOK across Desktop, Web, Mobile, CLI, VS Code, and Chrome. Keys encrypted at rest, never sent to our servers.',
    type: 'website',
    url: 'https://agiworkforce.com/byok',
  },
  alternates: { canonical: '/byok' },
};

const surfaces = [
  { icon: Monitor, name: 'Desktop', note: 'Full BYOK, local vault, offline option' },
  { icon: Globe, name: 'Web', note: 'BYOK Cloud mode, encrypted with master password' },
  { icon: Smartphone, name: 'Mobile', note: 'BYOK via secure enclave storage' },
  { icon: Terminal, name: 'CLI', note: 'BYOK via config file, AES-256 at rest' },
  { icon: Code2, name: 'VS Code', note: 'BYOK via extension settings, encrypted' },
  { icon: Layout, name: 'Chrome', note: 'BYOK via browser extension secure storage' },
];

const comparisonRows: CompareRow[] = [
  {
    feature: 'BYOK support',
    us: true,
    anthropic: false,
    openai: 'partial',
    chatgpt: false,
    usNote: 'All providers',
    anthropicNote: 'No BYOK',
    openaiNote: 'API only, not claude.ai-style chat',
    chatgptNote: 'No BYOK',
  },
  {
    feature: 'Keys leave your device',
    us: false,
    anthropic: 'na',
    openai: 'na',
    chatgpt: 'na',
    usNote: 'Never (Local mode)',
    anthropicNote: 'N/A',
    openaiNote: 'N/A',
    chatgptNote: 'N/A',
  },
  {
    feature: 'Pay provider directly',
    us: true,
    anthropic: false,
    openai: false,
    chatgpt: false,
    usNote: 'Yes, zero markup',
    anthropicNote: 'Via claude.ai subscription',
    openaiNote: 'Via ChatGPT subscription',
    chatgptNote: 'Via ChatGPT subscription',
  },
  {
    feature: 'Local encryption',
    us: true,
    anthropic: false,
    openai: false,
    chatgpt: false,
    usNote: 'AES-256-GCM + ChaCha20',
    anthropicNote: 'No client-side vault',
    openaiNote: 'No client-side vault',
    chatgptNote: 'No client-side vault',
  },
  {
    feature: 'Multi-provider BYOK',
    us: true,
    anthropic: false,
    openai: false,
    chatgpt: false,
    usNote: `${MARKETING.providers.display} providers`,
    anthropicNote: 'Claude only',
    openaiNote: 'OpenAI only',
    chatgptNote: 'OpenAI only',
  },
];

type CellValue = boolean | 'partial' | 'na';

interface CompareRow {
  feature: string;
  us: CellValue;
  anthropic: CellValue;
  openai: CellValue;
  chatgpt: CellValue;
  usNote: string;
  anthropicNote: string;
  openaiNote: string;
  chatgptNote: string;
}

function Cell({ value, note }: { value: CellValue; note: string }) {
  if (value === true) {
    return (
      <td className="py-4 px-4 text-sm">
        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> Yes
          </span>
          <span className="text-xs text-[#555150]">{note}</span>
        </div>
      </td>
    );
  }
  if (value === false) {
    return (
      <td className="py-4 px-4 text-sm">
        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-1.5 text-red-400/70">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" /> No
          </span>
          <span className="text-xs text-[#555150]">{note}</span>
        </div>
      </td>
    );
  }
  if (value === 'partial') {
    return (
      <td className="py-4 px-4 text-sm">
        <div className="flex flex-col gap-0.5">
          <span className="text-[#c8892a]">Partial</span>
          <span className="text-xs text-[#555150]">{note}</span>
        </div>
      </td>
    );
  }
  return (
    <td className="py-4 px-4 text-sm text-[#444240]">
      <span>{note}</span>
    </td>
  );
}

export default function ByokPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-[#edebe8]">
      <Header />

      <main className="pt-24">
        {/* Hero */}
        <section className="relative overflow-hidden pt-20 pb-24 md:pt-28 md:pb-32">
          <div className="pointer-events-none absolute inset-0 [background-image:radial-gradient(rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:28px_28px]" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[500px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#c8892a]/[0.06] blur-[160px]" />

          <div className="container relative mx-auto px-4 text-center">
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-[#c8892a]/25 bg-[#c8892a]/[0.07] px-4 py-1.5 text-sm font-medium text-[#c8892a]">
              <Key className="h-3.5 w-3.5" />
              Bring Your Own Keys
            </div>

            <h1 className="font-heading leading-[0.92] tracking-tight">
              <span className="block text-5xl md:text-7xl lg:text-[5.5rem]">Your keys.</span>
              <span className="block bg-gradient-to-r from-[#c8892a] via-[#e8af50] to-[#c8892a] bg-clip-text text-5xl text-transparent md:text-7xl lg:text-[5.5rem]">
                Your data.
              </span>
              <span className="block text-5xl md:text-7xl lg:text-[5.5rem]">Your cost.</span>
            </h1>

            <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-[#888480] md:text-xl">
              Paste your API key, pick your model, start chatting. Pay providers directly at their
              published rates. No AGI Workforce markup. No data brokering.
            </p>

            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/download"
                className="group inline-flex h-12 items-center gap-2 rounded-md bg-[#c8892a] px-8 text-sm font-semibold text-[#09090b] transition-all hover:bg-[#d4993a]"
              >
                Download Desktop
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/chat"
                className="inline-flex h-12 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-8 text-sm font-medium text-[#a8a4a0] transition-all hover:border-white/20 hover:text-[#edebe8]"
              >
                Try web chat with BYOK
              </Link>
            </div>
          </div>
        </section>

        {/* How BYOK works */}
        <section className="border-y border-white/[0.05] bg-[#0c0c0e] py-20 md:py-28">
          <div className="container mx-auto px-4">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#c8892a]">
              How it works
            </p>
            <h2 className="font-heading text-3xl tracking-tight md:text-4xl">
              Three steps. That&apos;s it.
            </h2>

            <div className="mt-12 grid gap-8 md:grid-cols-3">
              {[
                {
                  step: '01',
                  icon: Key,
                  title: 'Paste your key',
                  desc: 'Open Settings, select your provider (Anthropic, OpenAI, Google, or any of the others), and paste your API key. It is encrypted immediately on your device before being stored.',
                },
                {
                  step: '02',
                  icon: Monitor,
                  title: 'Pick your model',
                  desc: 'Choose from any model your key unlocks. Claude 4, GPT-5, Gemini 3, Grok 4, DeepSeek, Qwen, and more. Switch providers any time mid-conversation.',
                },
                {
                  step: '03',
                  icon: CheckCircle2,
                  title: 'Chat',
                  desc: 'Requests go directly from AGI Workforce to the provider API. AGI Workforce never sees your prompts or responses unless you explicitly enable Cloud sync.',
                },
              ].map(({ step, icon: Icon, title, desc }) => (
                <div key={step} className="relative">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="font-mono text-3xl font-bold text-[#1e1c1a]">{step}</span>
                    <Icon className="h-5 w-5 text-[#c8892a]" />
                  </div>
                  <h3 className="mb-2 font-semibold text-[#edebe8]">{title}</h3>
                  <p className="text-sm leading-relaxed text-[#888480]">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Security */}
        <section className="py-20 md:py-28">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-4xl">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#c8892a]">
                Security
              </p>
              <h2 className="font-heading text-3xl tracking-tight md:text-4xl">
                Encryption at every layer
              </h2>
              <p className="mt-4 max-w-xl text-[#888480]">
                We use the same primitives as password managers: derive a master key with Argon2id,
                then encrypt secrets with AES-256-GCM and ChaCha20-Poly1305.
              </p>

              <div className="mt-10 grid gap-6 md:grid-cols-2">
                <div className="rounded-2xl border border-emerald-500/20 bg-[#0f0f11] p-6">
                  <Lock className="mb-3 h-5 w-5 text-emerald-400" />
                  <h3 className="mb-2 font-semibold text-[#edebe8]">Local mode (Desktop)</h3>
                  <ul className="space-y-2 text-sm text-[#888480]">
                    {[
                      'Keys stored in your OS keychain or encrypted vault',
                      'Master password derived with Argon2id',
                      'AES-256-GCM + ChaCha20-Poly1305 dual encryption',
                      'Keys never transmitted to any server',
                      'No internet required after setup',
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-2xl border border-[#c8892a]/20 bg-[#0f0f11] p-6">
                  <Shield className="mb-3 h-5 w-5 text-[#c8892a]" />
                  <h3 className="mb-2 font-semibold text-[#edebe8]">Cloud mode (Web, Mobile)</h3>
                  <ul className="space-y-2 text-sm text-[#888480]">
                    {[
                      'Keys encrypted with your master password client-side',
                      'Encrypted blob stored in Supabase, not raw keys',
                      'AGI Workforce servers cannot decrypt your keys',
                      'Master password is never sent to our servers',
                      'BYOK optional: use managed Hobby credits instead',
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#c8892a]" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Comparison table */}
        <section className="border-y border-white/[0.05] bg-[#0c0c0e] py-20 md:py-28">
          <div className="container mx-auto px-4">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#c8892a]">
              Comparison
            </p>
            <h2 className="mb-10 font-heading text-3xl tracking-tight md:text-4xl">
              BYOK across platforms
            </h2>

            <div className="overflow-x-auto rounded-2xl border border-white/[0.06]">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="py-4 px-4 text-left text-xs font-semibold uppercase tracking-widest text-[#555150]">
                      Feature
                    </th>
                    <th className="py-4 px-4 text-left text-xs font-semibold uppercase tracking-widest text-[#c8892a]">
                      AGI Workforce
                    </th>
                    <th className="py-4 px-4 text-left text-xs font-semibold uppercase tracking-widest text-[#444240]">
                      Claude.ai
                    </th>
                    <th className="py-4 px-4 text-left text-xs font-semibold uppercase tracking-widest text-[#444240]">
                      OpenAI API
                    </th>
                    <th className="py-4 px-4 text-left text-xs font-semibold uppercase tracking-widest text-[#444240]">
                      ChatGPT
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((row, i) => (
                    <tr
                      key={row.feature}
                      className={`border-b border-white/[0.04] ${i % 2 === 0 ? 'bg-white/[0.01]' : ''}`}
                    >
                      <td className="py-4 px-4 text-sm font-medium text-[#a8a4a0]">
                        {row.feature}
                      </td>
                      <Cell value={row.us} note={row.usNote} />
                      <Cell value={row.anthropic} note={row.anthropicNote} />
                      <Cell value={row.openai} note={row.openaiNote} />
                      <Cell value={row.chatgpt} note={row.chatgptNote} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Surfaces */}
        <section className="py-20 md:py-28">
          <div className="container mx-auto px-4">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#c8892a]">
              Where BYOK works
            </p>
            <h2 className="mb-10 font-heading text-3xl tracking-tight md:text-4xl">
              All {MARKETING.surfaces.display} surfaces support your keys
            </h2>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {surfaces.map(({ icon: Icon, name, note }) => (
                <div
                  key={name}
                  className="flex items-start gap-4 rounded-xl border border-white/[0.06] bg-[#0f0f11] p-5"
                >
                  <div className="rounded-lg bg-[#c8892a]/10 p-2.5">
                    <Icon className="h-5 w-5 text-[#c8892a]" />
                  </div>
                  <div>
                    <div className="font-semibold text-[#edebe8]">{name}</div>
                    <div className="mt-0.5 text-sm text-[#666260]">{note}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-white/[0.05] bg-[#0c0c0e] py-20 md:py-28">
          <div className="container mx-auto px-4 text-center">
            <h2 className="font-heading text-3xl tracking-tight md:text-4xl">
              Your keys. Your terms.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-[#888480]">
              Start with the Desktop app for full local encryption, or use the web chat for
              immediate access.
            </p>
            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/download"
                className="group inline-flex h-12 items-center gap-2 rounded-md bg-[#c8892a] px-8 text-sm font-semibold text-[#09090b] transition-all hover:bg-[#d4993a]"
              >
                Download Desktop
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/chat"
                className="inline-flex h-12 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-8 text-sm font-medium text-[#a8a4a0] transition-all hover:border-white/20 hover:text-[#edebe8]"
              >
                Try web chat with BYOK
              </Link>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
