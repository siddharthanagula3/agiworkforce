import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Code2,
  Globe,
  Lock,
  MessageSquare,
  Monitor,
  Plug,
  Shield,
  Smartphone,
  Terminal,
  Users,
  Wrench,
  Zap,
} from 'lucide-react';

import { Header } from '../components/layout/Header';
import { SurfaceShowcase } from '../components/SurfaceShowcase';
import { CtaSection } from '../components/marketing/CtaSection';
import { MarketingFooter } from '../components/marketing/MarketingFooter';
import { AnimatedStats } from '../components/marketing/AnimatedStats';

export const metadata: Metadata = {
  title: 'AGI Workforce | AI Desktop Assistant',
  description:
    'AGI Workforce is a privacy-first native desktop AI assistant. Chat with AI, automate your browser, manage files, and run code — all locally. Multi-provider LLM support with BYOK and full offline mode via Ollama.',
  keywords: [
    'AI agent',
    'AI automation',
    'desktop AI app',
    'privacy-first AI',
    'local AI',
    'BYOK AI',
    'offline AI',
    'browser automation',
    'Tauri desktop app',
    'Ollama',
    'OpenAI',
    'Anthropic',
    'Gemini',
    'Claude',
    'data privacy',
  ],
  openGraph: {
    title: 'AGI Workforce | AI Desktop Assistant',
    description:
      'Chat with AI, automate your browser, manage files, and run code — all from one native desktop app. Free to try.',
    type: 'website',
    url: 'https://agiworkforce.com',
    images: [{ url: '/app-preview.png', width: 1200, height: 630, alt: 'AGI Workforce' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AGI Workforce | AI Desktop Assistant',
    description:
      'Chat with AI, automate your browser, manage files, and run code — all from one native desktop app.',
    images: ['/app-preview.png'],
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'AGI Workforce',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'macOS, Windows, Linux',
  featureList: [
    '20+ AI skills across 9 industries',
    '1,300+ built-in IPC tools',
    'Computer use with 6-layer security (Rust)',
    'Parallel AI agent orchestration',
    '70+ AI models across 25 providers',
    '45MB native app (Rust/Tauri, not Electron)',
    'Mobile companion with live agent dashboard',
    'Privacy-first: all processing happens locally',
    'Bring Your Own Keys (BYOK) — AES-256 encrypted',
    'Run fully offline with Ollama or LM Studio',
  ],
};

const features = [
  {
    icon: Users,
    title: '20+ AI Skills',
    desc: 'Pre-built AI specialists for healthcare, legal, finance, creative, education, and more. Start working in seconds — no setup, no prompt engineering.',
    href: '/features/ai-skills',
  },
  {
    icon: Plug,
    title: 'Unlimited MCP Plugins',
    desc: 'Connect any MCP tool — file systems, databases, APIs, browsers, and cloud services. No artificial tool limits, ever.',
    href: '/features/plugins',
  },
  {
    icon: Wrench,
    title: 'Computer Use & Full Terminal',
    desc: 'Control your browser, run any terminal command, read and write files, and capture your screen — with configurable autonomy.',
    href: '/features/tools',
  },
  {
    icon: Bot,
    title: 'Parallel AI Agents',
    desc: 'Break big tasks into parallel workstreams. Multiple agents work simultaneously and combine results — faster than any single AI conversation.',
    href: '/features/agents',
  },
  {
    icon: MessageSquare,
    title: 'Agentic Chat',
    desc: 'A chat interface that shows exactly what AI is doing: tool calls, file edits, web searches, and code execution — all visible in real time.',
    href: '/features/ai-chat',
  },
  {
    icon: Lock,
    title: 'Transparency at Every Step',
    desc: 'Every action is visible before it runs. Configurable autonomy from full approval to auto-pilot. Your files and API keys never leave your machine.',
    href: '/security',
  },
];

const stats = [
  { value: 70, suffix: '+', label: 'AI Models', description: 'across 25 providers' },
  { value: 20, suffix: '+', label: 'AI Skills', description: '9 industries covered' },
  { value: 45, suffix: 'MB', label: 'App size', description: 'native Rust binary' },
  { value: 1300, suffix: '+', label: 'Built-in tools', description: 'IPC-registered' },
];

const surfaces = [
  { Icon: Monitor, label: 'Desktop', sub: 'Tauri v2 · macOS · Windows · Linux' },
  { Icon: Globe, label: 'Web', sub: 'Next.js 16 SPA' },
  { Icon: Terminal, label: 'CLI', sub: 'Rust binary · agiworkforce' },
  { Icon: Code2, label: 'VS Code', sub: '@agi chat participant' },
  { Icon: Plug, label: 'Browser', sub: 'Chrome MV3 extension' },
  { Icon: Smartphone, label: 'Mobile', sub: 'Expo · iOS + Android' },
];

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `
            document.addEventListener('DOMContentLoaded', () => {
              const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                  if (entry.isIntersecting) {
                    entry.target.classList.add('opacity-100', 'translate-y-0');
                    entry.target.classList.remove('opacity-0', 'translate-y-8');
                  }
                });
              }, { threshold: 0.12 });
              document.querySelectorAll('.scroll-reveal').forEach(el => observer.observe(el));
            });
          `,
        }}
      />

      <div className="flex min-h-screen flex-col bg-[#09090b] text-[#edebe8] overflow-x-hidden">
        <Header />

        <main className="flex-1">
          {/* ── HERO ── */}
          <section className="relative overflow-hidden pt-36 pb-24 md:pt-48 md:pb-36">
            {/* Dot grid */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage: 'radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)',
                backgroundSize: '28px 28px',
              }}
            />
            {/* Warm amber glow */}
            <div className="pointer-events-none absolute left-1/2 top-[38%] h-[500px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#c8892a]/[0.07] blur-[140px]" />
            {/* Blue accent glow */}
            <div className="pointer-events-none absolute right-[12%] bottom-[15%] h-[280px] w-[400px] rounded-full bg-blue-700/[0.05] blur-[100px]" />

            <div className="container relative mx-auto px-4 text-center">
              {/* Badge */}
              <div className="animate-hero-1 mb-10 inline-flex items-center gap-2.5 rounded-full border border-[#c8892a]/25 bg-[#c8892a]/[0.07] px-4 py-1.5 text-sm font-medium text-[#c8892a]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#c8892a]" />
                Early Access — Free to try
              </div>

              {/* Headline */}
              <h1 className="font-heading leading-[0.9] tracking-tight">
                <span className="animate-hero-2 block text-5xl md:text-7xl lg:text-[5.5rem]">
                  One app.
                </span>
                <span className="animate-hero-3 block bg-gradient-to-r from-[#c8892a] via-[#e8af50] to-[#c8892a] bg-clip-text text-5xl text-transparent md:text-7xl lg:text-[5.5rem]">
                  Every AI.
                </span>
                <span className="animate-hero-3 block text-5xl md:text-7xl lg:text-[5.5rem]">
                  Total control.
                </span>
              </h1>

              {/* Subtitle */}
              <p className="animate-hero-4 font-body mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-[#888480] md:text-xl">
                A team of AI agents that automates your browser, terminal, files, and code — across
                desktop, web, CLI, VS Code, and browser.{' '}
                <span className="text-[#aaa8a4]">Your data never leaves your machine.</span>
              </p>

              {/* CTAs */}
              <div className="animate-hero-5 mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                <Link
                  href="/download"
                  className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-blue-600 px-8 text-sm font-semibold text-white transition-all hover:bg-blue-500 hover:shadow-[0_0_30px_rgba(37,99,235,0.35)] focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-[#09090b]"
                >
                  Download Free
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/docs"
                  className="inline-flex h-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] px-8 text-sm font-medium text-[#a8a4a0] transition-all hover:border-white/20 hover:bg-white/[0.06] hover:text-[#edebe8]"
                >
                  Read Documentation
                </Link>
              </div>

              {/* Trust items */}
              <div className="animate-hero-5 mt-12 flex flex-col items-center gap-3 md:flex-row md:flex-wrap md:justify-center md:gap-x-8">
                {[
                  'No training on your data. Ever.',
                  'Multi-model — best LLM for every task',
                  'BYOK or Managed Cloud subscription',
                  'macOS · Windows · Linux · Web · CLI',
                ].map((text) => (
                  <div key={text} className="flex items-center gap-2 text-sm text-[#666260]">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    <span>{text}</span>
                  </div>
                ))}
              </div>

              <SurfaceShowcase />
            </div>
          </section>

          {/* ── PROVIDER TRUST BAR ── */}
          <section className="border-y border-white/[0.05] bg-[#0c0c0e] py-10 overflow-hidden">
            <p className="mb-7 text-center text-[10px] font-semibold uppercase tracking-[0.25em] text-[#555150]">
              Supports 25+ AI providers
            </p>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-28 bg-gradient-to-r from-[#0c0c0e] to-transparent" />
              <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-28 bg-gradient-to-l from-[#0c0c0e] to-transparent" />
              <div className="flex animate-marquee items-center gap-20 md:gap-28">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="flex shrink-0 items-center gap-20 md:gap-28">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-7 w-7 shrink-0 fill-[#555150] transition-colors hover:fill-[#888480]"
                      aria-label="OpenAI"
                    >
                      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.998 5.998 0 0 0-3.998 2.9 6.042 6.042 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.602 1.5v3.003l-2.602 1.5-2.602-1.5z" />
                    </svg>
                    <svg
                      viewBox="0 0 24 24"
                      className="h-7 w-7 shrink-0 fill-[#555150] transition-colors hover:fill-[#888480]"
                      aria-label="Anthropic"
                    >
                      <path d="M17.304 3.541l-5.17 14.27h3.164l5.17-14.27h-3.164zM6.696 3.541l5.17 14.27H8.702L3.532 3.541h3.164z" />
                    </svg>
                    <svg
                      viewBox="0 0 24 24"
                      className="h-7 w-7 shrink-0 opacity-50 transition-opacity hover:opacity-80"
                      aria-label="Google"
                    >
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    <svg
                      viewBox="0 0 24 24"
                      className="h-7 w-7 shrink-0 fill-[#555150] transition-colors hover:fill-[#888480]"
                      aria-label="xAI"
                    >
                      <path d="M3.005 6.3h3.2l5.59 8.24L6.36 22H3.005l5.735-7.735L3.005 6.3zm8.25 0h3.2L22 22h-3.2L11.255 6.3zm5.545 0H20l-3.5 4.7-1.6-2.35L16.8 6.3z" />
                    </svg>
                    <svg
                      viewBox="0 0 24 24"
                      className="h-7 w-7 shrink-0 opacity-50 transition-opacity hover:opacity-80"
                      aria-label="Mistral"
                    >
                      <rect x="1" y="3" width="5" height="5" fill="#F7D046" />
                      <rect x="18" y="3" width="5" height="5" fill="#F7D046" />
                      <rect x="1" y="9" width="5" height="5" fill="#F2A73B" />
                      <rect x="7" y="9" width="5" height="5" fill="#F2A73B" />
                      <rect x="18" y="9" width="5" height="5" fill="#F2A73B" />
                      <rect x="1" y="16" width="5" height="5" fill="#EE792F" />
                      <rect x="7" y="16" width="5" height="5" fill="#EE792F" />
                      <rect x="12" y="16" width="5" height="5" fill="#EE792F" />
                      <rect x="18" y="16" width="5" height="5" fill="#EE792F" />
                    </svg>
                    <svg
                      viewBox="0 0 24 24"
                      className="h-7 w-7 shrink-0 fill-[#555150] transition-colors hover:fill-[#888480]"
                      aria-label="Ollama"
                    >
                      <circle cx="12" cy="8" r="4" />
                      <ellipse cx="12" cy="16" rx="6" ry="4" />
                      <circle cx="10" cy="7.5" r="0.8" fill="#09090b" />
                      <circle cx="14" cy="7.5" r="0.8" fill="#09090b" />
                    </svg>
                    <svg
                      viewBox="0 0 24 24"
                      className="h-7 w-7 shrink-0 fill-[#555150] transition-colors hover:fill-[#888480]"
                      aria-label="Groq"
                    >
                      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6z" />
                    </svg>
                    <svg
                      viewBox="0 0 24 24"
                      className="h-7 w-7 shrink-0 fill-[#555150] transition-colors hover:fill-[#888480]"
                      aria-label="DeepSeek"
                    >
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm3.5 14.5L12 14l-3.5 2.5 1-4L6 10l4.1-.35L12 6l1.9 3.65L18 10l-3.5 2.5 1 4z" />
                    </svg>
                    <svg
                      viewBox="0 0 24 24"
                      className="h-7 w-7 shrink-0 fill-[#555150] transition-colors hover:fill-[#888480]"
                      aria-label="Perplexity"
                    >
                      <path d="M12 2L3 7v10l9 5 9-5V7l-9-5zm0 2.18l7 3.89v7.86l-7 3.89-7-3.89V8.07l7-3.89z" />
                    </svg>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── FEATURES ── */}
          <section
            id="features"
            className="scroll-reveal opacity-0 translate-y-8 transition-all duration-1000 ease-out py-24 md:py-36"
          >
            <div className="container mx-auto px-4">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#c8892a]">
                Capabilities
              </p>
              <h2 className="font-heading text-4xl tracking-tight md:text-5xl lg:text-6xl">
                What you can do
              </h2>
              <p className="font-body mt-5 max-w-xl text-lg leading-relaxed text-[#888480]">
                One app that handles the full range of AI-assisted work — from quick questions to
                long-running automations.
              </p>

              <div className="mt-14 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {features.map((feature, i) => {
                  const isWide = i === 0;
                  const card = (
                    <div className="group relative flex h-full flex-col rounded-2xl border border-white/[0.06] bg-[#0f0f11] p-8 transition-all duration-300 hover:border-[#c8892a]/20 hover:bg-[#111114] hover:shadow-[0_0_50px_rgba(200,137,42,0.06)]">
                      <feature.icon className="mb-5 h-9 w-9 text-[#c8892a] transition-all duration-300 group-hover:drop-shadow-[0_0_10px_rgba(200,137,42,0.5)]" />
                      <h3 className="mb-2.5 text-xl font-semibold text-[#edebe8]">
                        {feature.title}
                      </h3>
                      <p className="font-body flex-1 leading-relaxed text-[#888480]">
                        {feature.desc}
                      </p>
                      {feature.href && (
                        <div className="mt-5 flex translate-x-0 items-center gap-1.5 text-sm font-medium text-[#c8892a] opacity-0 transition-all duration-200 group-hover:opacity-100">
                          Learn more <ArrowRight className="h-3.5 w-3.5" />
                        </div>
                      )}
                    </div>
                  );
                  return feature.href ? (
                    <Link
                      key={feature.title}
                      href={feature.href}
                      className={`block ${isWide ? 'lg:col-span-2' : ''}`}
                    >
                      {card}
                    </Link>
                  ) : (
                    <div key={feature.title} className={isWide ? 'lg:col-span-2' : ''}>
                      {card}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ── STATS ── */}
          <section className="border-y border-white/[0.05] bg-[#0c0c0e] py-20 md:py-28">
            <AnimatedStats stats={stats} />
          </section>

          {/* ── SURFACE STRIP ── */}
          <section className="scroll-reveal opacity-0 translate-y-8 transition-all duration-1000 ease-out py-16 md:py-20">
            <div className="container mx-auto px-4 text-center">
              <p className="mb-8 text-[10px] font-semibold uppercase tracking-[0.25em] text-[#555150]">
                Available on every surface
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                {surfaces.map(({ Icon, label, sub }) => (
                  <div
                    key={label}
                    className="group flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#0f0f11] px-5 py-3.5 transition-all duration-200 hover:border-white/[0.1] hover:bg-[#111114]"
                  >
                    <Icon className="h-5 w-5 shrink-0 text-[#c8892a]" />
                    <div className="text-left">
                      <div className="text-sm font-semibold text-[#edebe8]">{label}</div>
                      <div className="text-xs text-[#555150]">{sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── RUST VS ELECTRON ── */}
          <section className="scroll-reveal opacity-0 translate-y-8 transition-all duration-1000 ease-out border-y border-white/[0.05] bg-[#0c0c0e] py-24 md:py-32">
            <div className="container mx-auto px-4">
              <div className="mb-14 text-center">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#c8892a]/20 bg-[#c8892a]/[0.06] px-3 py-1 text-sm text-[#c8892a]">
                  <Zap className="h-3.5 w-3.5" />
                  Built on Rust
                </div>
                <h2 className="font-heading text-3xl tracking-tight md:text-5xl">
                  Native performance.
                  <br />
                  Not a browser in a box.
                </h2>
                <p className="font-body mx-auto mt-5 max-w-2xl text-[#888480]">
                  Most AI desktop apps bundle a 150MB Chromium browser before writing a single line
                  of product code. AGI Workforce compiles to a true native binary.
                </p>
              </div>

              <div className="mx-auto grid max-w-4xl grid-cols-1 gap-4 md:grid-cols-2">
                {/* AGI Workforce */}
                <div className="relative rounded-2xl border border-[#c8892a]/20 bg-[#111114] p-8">
                  <div className="absolute inset-x-0 top-0 h-px rounded-t-2xl bg-gradient-to-r from-transparent via-[#c8892a]/40 to-transparent" />
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#c8892a]">
                    AGI Workforce
                  </div>
                  <div className="mb-6 font-heading text-2xl text-[#edebe8]">Rust + Tauri</div>
                  <div className="space-y-4">
                    {[
                      { label: 'App size', value: '~35 MB', sub: 'native binary' },
                      { label: 'RAM on startup', value: '~80 MB', sub: 'no Chromium overhead' },
                      { label: 'Cold start', value: '<1 sec', sub: 'direct OS launch' },
                      {
                        label: 'Memory safety',
                        value: 'Compile-time',
                        sub: 'zero-cost, no GC pauses',
                      },
                      { label: 'OS access', value: 'Native APIs', sub: 'file, USB, camera, GPU' },
                      {
                        label: 'Security model',
                        value: 'Process isolation',
                        sub: 'capability-based',
                      },
                    ].map(({ label, value, sub }) => (
                      <div
                        key={label}
                        className="flex items-center justify-between border-b border-white/[0.05] pb-3.5 last:border-0 last:pb-0"
                      >
                        <span className="text-sm text-[#666260]">{label}</span>
                        <div className="text-right">
                          <div className="font-mono text-sm font-semibold text-emerald-400">
                            {value}
                          </div>
                          <div className="text-xs text-[#444240]">{sub}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Electron */}
                <div className="relative rounded-2xl border border-white/[0.05] bg-[#0f0f11] p-8">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#444240]">
                    Typical AI Desktop App
                  </div>
                  <div className="mb-6 font-heading text-2xl text-[#555150]">Electron</div>
                  <div className="space-y-4">
                    {[
                      { label: 'App size', value: '~550 MB', sub: 'bundled Chromium + Node' },
                      {
                        label: 'RAM on startup',
                        value: '~400 MB',
                        sub: 'full browser process tree',
                      },
                      { label: 'Cold start', value: '3–5 sec', sub: 'browser engine boot' },
                      {
                        label: 'Memory safety',
                        value: 'Runtime GC',
                        sub: 'pauses and leaks possible',
                      },
                      {
                        label: 'OS access',
                        value: 'Via Node bridge',
                        sub: 'sandboxed, limited GPU',
                      },
                      {
                        label: 'Security model',
                        value: 'Web sandbox',
                        sub: 'renderer access risk',
                      },
                    ].map(({ label, value, sub }) => (
                      <div
                        key={label}
                        className="flex items-center justify-between border-b border-white/[0.04] pb-3.5 last:border-0 last:pb-0"
                      >
                        <span className="text-sm text-[#444240]">{label}</span>
                        <div className="text-right">
                          <div className="font-mono text-sm font-semibold text-[#555150]">
                            {value}
                          </div>
                          <div className="text-xs text-[#333130]">{sub}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-10 flex flex-wrap justify-center gap-3">
                {[
                  '🦀 Memory-safe by default — no buffer overflows',
                  '⚡ Zero-cost abstractions — pays only for what it uses',
                  '🔒 Capability-based IPC — every tool call is permission-gated',
                  '🖥️ Direct access to OS APIs — GPU, camera, files, clipboard',
                ].map((badge) => (
                  <div
                    key={badge}
                    className="rounded-full border border-white/[0.06] bg-[#0f0f11] px-4 py-2 text-xs text-[#666260]"
                  >
                    {badge}
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── SECURITY ── */}
          <section
            id="security"
            className="scroll-reveal opacity-0 translate-y-8 transition-all duration-1000 ease-out py-24 md:py-32"
          >
            <div className="container mx-auto px-4">
              <div className="flex flex-col items-start gap-16 md:flex-row md:items-center">
                <div className="flex-1 space-y-8">
                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-1 text-sm text-emerald-400">
                    <Lock className="h-3.5 w-3.5" />
                    Privacy-First Architecture
                  </div>
                  <h2 className="font-heading text-3xl tracking-tight md:text-5xl">
                    Your code never
                    <br />
                    leaves your machine.
                  </h2>
                  <div className="space-y-7">
                    {[
                      {
                        icon: Lock,
                        title: 'Local Processing Only',
                        desc: 'Every conversation is processed on your machine using your own API keys. Zero data passes through AGI Workforce servers.',
                      },
                      {
                        icon: Shield,
                        title: 'Bring Your Own Keys',
                        desc: 'API keys are encrypted locally with AES-256. You own your API relationships and control every token.',
                      },
                      {
                        icon: CheckCircle2,
                        title: 'Run Fully Offline',
                        desc: 'Connect Ollama or LM Studio for 100% offline operation. Zero internet required for local models.',
                      },
                    ].map(({ icon: Icon, title, desc }) => (
                      <div key={title} className="flex gap-4">
                        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                        <div>
                          <h3 className="mb-1.5 font-semibold text-[#edebe8]">{title}</h3>
                          <p className="font-body text-sm leading-relaxed text-[#888480]">{desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="w-full flex-1 md:max-w-md">
                  <div className="relative rounded-2xl border border-white/[0.06] bg-[#0f0f11] p-8">
                    <div className="absolute inset-0 -z-10 rounded-2xl bg-emerald-500/[0.03] blur-3xl" />
                    <h4 className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-[#555150]">
                      Where Your Data Lives
                    </h4>
                    <div className="space-y-3.5">
                      {[
                        { item: 'Conversations', location: 'Your machine only' },
                        { item: 'API Keys', location: 'Encrypted locally (AES-256)' },
                        { item: 'Files & Documents', location: 'Your machine only' },
                        { item: 'Model Calls', location: 'Direct to provider API' },
                        { item: 'AGI Workforce servers', location: 'None' },
                      ].map(({ item, location }) => (
                        <div key={item} className="flex items-center justify-between text-sm">
                          <span className="text-[#666260]">{item}</span>
                          <span
                            className={
                              location === 'None'
                                ? 'font-semibold text-emerald-400'
                                : 'text-[#aaa8a4]'
                            }
                          >
                            {location}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="scroll-reveal opacity-0 translate-y-8 transition-all duration-1000 ease-out pb-12">
            <CtaSection
              headline="Try it free — no credit card needed"
              body="Download in under a minute. Connect your preferred AI provider and start working. Uninstall anytime."
            />
          </div>
        </main>

        <MarketingFooter />
      </div>
    </>
  );
}
