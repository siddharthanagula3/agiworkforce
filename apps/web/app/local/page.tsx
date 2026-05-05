import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  Lock,
  Wifi,
  WifiOff,
  Cpu,
  Clock,
  Shield,
} from 'lucide-react';

import { Header } from '@/components/layout/Header';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Local AI Mode | AGI Workforce - Run AI Offline, Free Forever',
  description:
    'Run Ollama and LM Studio through AGI Workforce Desktop. 100% offline, free forever. No API key, no per-token cost, no rate limits. Your data never leaves your machine.',
  openGraph: {
    title: 'Run AI Offline. Free Forever. | AGI Workforce',
    description:
      'Ollama and LM Studio, integrated. Local mode runs entirely offline. SQLite storage, no cloud, no subscription.',
    type: 'website',
    url: 'https://agiworkforce.com/local',
  },
  alternates: { canonical: '/local' },
};

const setupSteps = [
  {
    step: '01',
    title: 'Install Ollama or LM Studio',
    desc: 'Download Ollama (ollama.com) or LM Studio (lmstudio.ai). Both are free and run on macOS, Windows, and Linux. Ollama is CLI-first; LM Studio has a GUI model browser.',
    note: 'Ollama: brew install ollama or download the installer. LM Studio: download from lmstudio.ai.',
  },
  {
    step: '02',
    title: 'Pull a model',
    desc: 'With Ollama, run `ollama pull llama3` (or gemma3, qwen3, mistral, phi4, and many more). With LM Studio, browse and download GGUF models from the in-app catalog.',
    note: 'Smaller quantized models (4-bit, 8-bit) run on laptops. Larger models benefit from a dedicated GPU.',
  },
  {
    step: '03',
    title: 'Open AGI Workforce Desktop',
    desc: 'In Settings, select Local mode. AGI Workforce will auto-detect Ollama at localhost:11434 and LM Studio at localhost:1234. No API key required.',
    note: 'Desktop only. Local mode requires macOS, Windows, or Linux desktop installation.',
  },
  {
    step: '04',
    title: 'Chat offline',
    desc: 'All requests go to your local server. No internet required. No per-token cost. No rate limits. Conversations stored in SQLite on your machine.',
    note: 'Disconnect your network any time. Local mode keeps working.',
  },
];

const modelFamilies = [
  { name: 'Llama 3 family', origin: 'Meta', via: 'Ollama', notes: 'General-purpose, strong base' },
  {
    name: 'Mistral family',
    origin: 'Mistral AI',
    via: 'Ollama / LM Studio',
    notes: 'Efficient, good for code',
  },
  {
    name: 'Qwen family',
    origin: 'Alibaba',
    via: 'Ollama / LM Studio',
    notes: 'Multilingual, math-strong',
  },
  {
    name: 'Phi family',
    origin: 'Microsoft',
    via: 'Ollama / LM Studio',
    notes: 'Small, fast, instruction-tuned',
  },
  { name: 'Gemma family', origin: 'Google', via: 'Ollama', notes: 'Lightweight, open-weight' },
  {
    name: 'DeepSeek family',
    origin: 'DeepSeek',
    via: 'Ollama / LM Studio',
    notes: 'Code and reasoning specialist',
  },
];

export default function LocalPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-[#edebe8]">
      <Header />

      <main className="pt-24">
        {/* Hero */}
        <section className="relative overflow-hidden pt-20 pb-24 md:pt-28 md:pb-32">
          <div className="pointer-events-none absolute inset-0 [background-image:radial-gradient(rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:28px_28px]" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[500px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/[0.04] blur-[160px]" />

          <div className="container relative mx-auto px-4 text-center">
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.07] px-4 py-1.5 text-sm font-medium text-emerald-400">
              <WifiOff className="h-3.5 w-3.5" />
              No internet required
            </div>

            <h1 className="font-heading leading-[0.92] tracking-tight">
              <span className="block text-5xl md:text-7xl lg:text-[5.5rem]">Run AI offline.</span>
              <span className="block bg-gradient-to-r from-emerald-400 via-emerald-300 to-emerald-400 bg-clip-text text-5xl text-transparent md:text-7xl lg:text-[5.5rem]">
                Free forever.
              </span>
            </h1>

            <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-[#888480] md:text-xl">
              Ollama and LM Studio, integrated directly into AGI Workforce Desktop. No API key. No
              per-token cost. No rate limits. Your data never leaves your machine.
            </p>

            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/download"
                className="group inline-flex h-12 items-center gap-2 rounded-md bg-white px-8 text-sm font-semibold text-black transition-all hover:bg-zinc-200"
              >
                Download Desktop
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/byok"
                className="inline-flex h-12 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-8 text-sm font-medium text-[#a8a4a0] transition-all hover:border-white/20 hover:text-[#edebe8]"
              >
                Or use BYOK cloud models
              </Link>
            </div>

            {/* Trust items */}
            <div className="mt-10 flex flex-wrap justify-center gap-x-8 gap-y-3">
              {[
                'Zero API keys required',
                'No per-token cost',
                'No rate limits',
                'No internet needed',
              ].map((text) => (
                <div key={text} className="flex items-center gap-2 text-sm text-[#666260]">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  {text}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Why local */}
        <section className="border-y border-white/[0.05] bg-[#0c0c0e] py-20 md:py-28">
          <div className="container mx-auto px-4">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#c8892a]">
              Why local
            </p>
            <h2 className="font-heading text-3xl tracking-tight md:text-4xl">
              Four reasons to run locally
            </h2>

            <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  icon: Shield,
                  title: 'Complete privacy',
                  desc: 'Prompts, responses, and documents never touch a remote server. Suitable for sensitive code, legal drafts, and private data.',
                },
                {
                  icon: Clock,
                  title: 'Low latency',
                  desc: 'LAN latency instead of cloud round-trips. Smaller models on fast hardware often respond faster than cloud APIs.',
                },
                {
                  icon: HardDrive,
                  title: 'No per-token cost',
                  desc: 'After downloading the model once, inference is free. Ideal for high-volume workflows that would burn through API credits.',
                },
                {
                  icon: WifiOff,
                  title: 'Offline operation',
                  desc: 'Works on a plane, in a Faraday cage, on an airgapped machine. No internet dependency for any part of the workflow.',
                },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex flex-col gap-3">
                  <div className="rounded-lg bg-emerald-500/10 p-2.5 w-fit">
                    <Icon className="h-5 w-5 text-emerald-400" />
                  </div>
                  <h3 className="font-semibold text-[#edebe8]">{title}</h3>
                  <p className="text-sm leading-relaxed text-[#888480]">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Setup steps */}
        <section className="py-20 md:py-28">
          <div className="container mx-auto px-4">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#c8892a]">
              Setup
            </p>
            <h2 className="font-heading text-3xl tracking-tight md:text-4xl">
              Up and running in four steps
            </h2>

            <div className="mt-12 space-y-6 max-w-3xl">
              {setupSteps.map(({ step, title, desc, note }) => (
                <div
                  key={step}
                  className="flex gap-6 rounded-2xl border border-white/[0.06] bg-[#0f0f11] p-6"
                >
                  <div className="font-mono text-4xl font-bold text-[#1e1c1a] shrink-0 leading-none mt-1">
                    {step}
                  </div>
                  <div>
                    <h3 className="mb-2 font-semibold text-[#edebe8]">{title}</h3>
                    <p className="text-sm leading-relaxed text-[#888480]">{desc}</p>
                    <p className="mt-2 text-xs text-[#555150]">{note}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Model families */}
        <section className="border-y border-white/[0.05] bg-[#0c0c0e] py-20 md:py-28">
          <div className="container mx-auto px-4">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#c8892a]">
              Compatible models
            </p>
            <h2 className="mb-2 font-heading text-3xl tracking-tight md:text-4xl">
              Which models can I run?
            </h2>
            <p className="mb-10 max-w-xl text-[#888480]">
              Any model supported by Ollama or LM Studio. A few popular families to start:
            </p>

            <div className="overflow-x-auto rounded-2xl border border-white/[0.06]">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {['Model family', 'Made by', 'Via', 'Notes'].map((h) => (
                      <th
                        key={h}
                        className="py-3.5 px-5 text-left text-xs font-semibold uppercase tracking-widest text-[#555150]"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {modelFamilies.map((m, i) => (
                    <tr
                      key={m.name}
                      className={`border-b border-white/[0.04] ${i % 2 === 0 ? 'bg-white/[0.01]' : ''}`}
                    >
                      <td className="py-3.5 px-5 text-sm font-medium text-[#edebe8]">{m.name}</td>
                      <td className="py-3.5 px-5 text-sm text-[#888480]">{m.origin}</td>
                      <td className="py-3.5 px-5 font-mono text-xs text-[#c8892a]">{m.via}</td>
                      <td className="py-3.5 px-5 text-sm text-[#666260]">{m.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-xs text-[#444240]">
              This is a small sample. Ollama hosts hundreds of models. LM Studio supports any GGUF
              file. Model versions are not listed here because they change frequently.
            </p>
          </div>
        </section>

        {/* Honest tradeoffs */}
        <section className="py-20 md:py-28">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#c8892a]">
                Honest tradeoffs
              </p>
              <h2 className="font-heading text-3xl tracking-tight md:text-4xl">
                What local mode cannot do (yet)
              </h2>
              <p className="mt-4 text-[#888480]">
                We believe in honest marketing. Local models are great, but frontier cloud models
                are still ahead on most benchmarks.
              </p>

              <div className="mt-10 space-y-4">
                {[
                  {
                    icon: Cpu,
                    title: 'Smaller parameter count',
                    desc: 'A 7B or 13B local model is not as capable as Claude 4 Opus or GPT-5. For complex reasoning, cloud APIs still win.',
                  },
                  {
                    icon: Clock,
                    title: 'Slower without a GPU',
                    desc: 'CPU inference on large models is slow. A dedicated GPU (NVIDIA or Apple Silicon with unified memory) makes a major difference.',
                  },
                  {
                    icon: WifiOff,
                    title: 'Desktop only',
                    desc: 'Local mode requires the Desktop app (macOS, Windows, or Linux). Web, Mobile, CLI, and extensions require a cloud provider or BYOK.',
                  },
                  {
                    icon: Lock,
                    title: 'No Dispatch, no cross-device sync',
                    desc: 'Local mode uses SQLite on your machine. No Supabase, no cross-device session continuity. Cloud mode unlocks those features.',
                  },
                ].map(({ title, desc }) => (
                  <div
                    key={title}
                    className="flex gap-4 rounded-xl border border-white/[0.06] bg-[#0f0f11] p-5"
                  >
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#c8892a]" />
                    <div>
                      <h3 className="mb-1 font-semibold text-[#edebe8]">{title}</h3>
                      <p className="text-sm leading-relaxed text-[#888480]">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Local vs Cloud */}
        <section className="border-y border-white/[0.05] bg-[#0c0c0e] py-16">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl">
              <h2 className="mb-8 text-center font-heading text-2xl tracking-tight">
                Local mode vs Cloud mode
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-emerald-500/20 bg-[#0f0f11] p-5">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-400">
                    <WifiOff className="h-4 w-4" /> Local mode
                  </div>
                  <ul className="space-y-2 text-sm text-[#888480]">
                    {[
                      'Free forever',
                      'Completely offline',
                      'SQLite storage on device',
                      'No Supabase, no sync',
                      'No Dispatch',
                      'Desktop only',
                    ].map((item) => (
                      <li key={item} className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-2xl border border-[#c8892a]/20 bg-[#0f0f11] p-5">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#c8892a]">
                    <Wifi className="h-4 w-4" /> Cloud mode
                  </div>
                  <ul className="space-y-2 text-sm text-[#888480]">
                    {[
                      'BYOK or Hobby subscription',
                      'Cross-device sync',
                      'Supabase storage',
                      'Dispatch (mobile agent dashboard)',
                      'Web, Mobile, CLI, extensions',
                      'Frontier cloud models',
                    ].map((item) => (
                      <li key={item} className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#c8892a]" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <p className="mt-4 text-center text-xs text-[#444240]">
                You can switch between modes any time from Desktop Settings.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 md:py-28">
          <div className="container mx-auto px-4 text-center">
            <h2 className="font-heading text-3xl tracking-tight md:text-4xl">
              Download free. Run offline immediately.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-[#888480]">
              AGI Workforce Desktop, plus Ollama or LM Studio. No account required for local mode.
            </p>
            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/download"
                className="group inline-flex h-12 items-center gap-2 rounded-md bg-white px-8 text-sm font-semibold text-black transition-all hover:bg-zinc-200"
              >
                Download Desktop
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/byok"
                className="inline-flex h-12 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-8 text-sm font-medium text-[#a8a4a0] transition-all hover:border-white/20 hover:text-[#edebe8]"
              >
                Use BYOK instead
              </Link>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
