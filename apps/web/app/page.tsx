import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Lock,
  MessageSquare,
  Monitor,
  Plug,
  Shield,
  Users,
  Wrench,
  Zap,
} from 'lucide-react';

import { Header } from '../components/layout/Header';
import { SurfaceShowcase } from '../components/SurfaceShowcase';
import { CtaSection } from '../components/marketing/CtaSection';
import { MarketingFooter } from '../components/marketing/MarketingFooter';
import { ScrollRevealInit } from '../components/marketing/ScrollRevealInit';
import { MARKETING } from '../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'AGI Workforce | AI Agent Automation Platform',
  description:
    'AGI Workforce is a privacy-first AI agent platform. Chat with AI, automate your browser, terminal, files, and code — across desktop, web, CLI, VS Code, and browser extension. Multi-provider LLM support with BYOK and full offline mode via Ollama.',
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
    title: 'AGI Workforce | AI Agent Automation Platform',
    description:
      'A team of AI agents that automates your browser, terminal, files, and code — across desktop, web, CLI, VS Code, and browser extension. Free to try.',
    type: 'website',
    url: 'https://agiworkforce.com',
    images: [{ url: '/app-preview.png', width: 1200, height: 630, alt: 'AGI Workforce' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AGI Workforce | AI Agent Automation Platform',
    description:
      'A team of AI agents that automates your browser, terminal, files, and code — across desktop, web, CLI, VS Code, and browser extension.',
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
    `AI skills across ${MARKETING.categories.display} categories`,
    `${MARKETING.tools.display} built-in IPC tools`,
    'Computer use with 6-layer security (Rust)',
    'Parallel AI agent orchestration',
    `${MARKETING.models.display} AI models across ${MARKETING.providers.display} providers`,
    `${MARKETING.appSize.display} native app (Rust/Tauri, not Electron)`,
    'Mobile companion with live agent dashboard',
    'Privacy-first: all processing happens locally',
    'Bring Your Own Keys (BYOK) — AES-256 encrypted',
    'Run fully offline with Ollama or LM Studio',
  ],
};

const features = [
  {
    icon: Users,
    title: 'AI Skills',
    stat: `${MARKETING.categories.display} categories`,
    desc: 'Pre-built specialists across engineering, marketing, finance, legal, creative, and more.',
    href: '/features/ai-skills',
  },
  {
    icon: Plug,
    title: 'Unlimited MCP',
    stat: '3 transports',
    desc: 'Connect any MCP server — stdio, SSE, or HTTP. File systems, databases, APIs, browsers. No tool caps.',
    href: '/features/plugins',
  },
  {
    icon: Wrench,
    title: 'Computer Use',
    stat: `${MARKETING.tools.display} IPC tools`,
    desc: 'Browser automation, terminal, file I/O, screen capture, keyboard — all through ToolGuard safety tiers.',
    href: '/features/tools',
  },
  {
    icon: Bot,
    title: 'Parallel Agents',
    stat: 'Up to 100 concurrent',
    desc: 'Decompose complex tasks into parallel workstreams. Multiple agents execute simultaneously.',
    href: '/features/agents',
  },
  {
    icon: MessageSquare,
    title: 'Agentic Chat',
    stat: `${MARKETING.models.display} models`,
    desc: 'Inline tool execution with Claude Code-style status labels. Switch models mid-conversation.',
    href: '/features/ai-chat',
  },
  {
    icon: Lock,
    title: 'Local-First Privacy',
    stat: 'Zero data brokering',
    desc: 'API keys encrypted with Argon2id + AES-GCM. All processing on your machine. Run fully offline.',
    href: '/security',
  },
];

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ScrollRevealInit />

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
            {/* Secondary accent glow */}
            <div className="pointer-events-none absolute right-[12%] bottom-[15%] h-[280px] w-[400px] rounded-full bg-[#c8892a]/[0.04] blur-[100px]" />

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
                desktop, web, CLI, VS Code, and browser extension.
              </p>

              {/* CTAs */}
              <div className="animate-hero-5 mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                <Link
                  href="/download"
                  className="group inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#c8892a] px-8 text-sm font-semibold text-[#09090b] transition-all hover:bg-[#d4993a] focus:outline-none focus:ring-2 focus:ring-[#c8892a]/50 focus:ring-offset-2 focus:ring-offset-[#09090b]"
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

              {/* ── PROVIDER TRUST BAR (inline in hero) ── */}
              <div className="mt-16 -mx-4 border-y border-white/[0.05] bg-[#0c0c0e] py-8 overflow-hidden">
                <p className="mb-7 text-center text-[10px] font-semibold uppercase tracking-[0.25em] text-[#555150]">
                  Supports {MARKETING.providers.display} AI providers
                </p>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-28 bg-gradient-to-r from-[#0c0c0e] to-transparent" />
                  <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-28 bg-gradient-to-l from-[#0c0c0e] to-transparent" />
                  <div className="flex animate-marquee items-center gap-20 md:gap-28">
                    {[...Array(2)].map((_, i) => (
                      <div key={i} className="flex shrink-0 items-center gap-20 md:gap-28">
                        {/* OpenAI — official rosette from simple-icons */}
                        <svg
                          viewBox="0 0 24 24"
                          className="h-7 w-7 shrink-0 fill-white/60 transition-all hover:fill-white/90"
                          aria-label="OpenAI"
                        >
                          <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.998 5.998 0 0 0-3.998 2.9 6.042 6.042 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.602 1.5v3.003l-2.602 1.5-2.602-1.5z" />
                        </svg>
                        {/* Anthropic — official "A" mark */}
                        <svg
                          viewBox="0 0 24 24"
                          className="h-7 w-7 shrink-0 fill-white/60 transition-all hover:fill-white/90"
                          aria-label="Anthropic"
                        >
                          <path d="M13.827 3.52h3.603L24 20.48h-3.603l-6.57-16.96zm-7.258 0h3.767L16.906 20.48h-3.674l-1.343-3.461H5.017l-1.344 3.46H0L6.57 3.522zm4.132 10.86L8.453 7.687 6.205 14.38h4.496z" />
                        </svg>
                        {/* Google — official "G" multicolor */}
                        <svg
                          viewBox="0 0 24 24"
                          className="h-7 w-7 shrink-0 opacity-60 transition-opacity hover:opacity-90"
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
                        {/* xAI — official glyph */}
                        <svg
                          viewBox="0 0 24 24"
                          className="h-7 w-7 shrink-0 fill-white/60 transition-all hover:fill-white/90"
                          aria-label="xAI"
                        >
                          <path d="M3.005 6.3h3.2l5.59 8.24L6.36 22H3.005l5.735-7.735L3.005 6.3zm8.25 0h3.2L22 22h-3.2L11.255 6.3zm5.545 0H20l-3.5 4.7-1.6-2.35L16.8 6.3z" />
                        </svg>
                        {/* Mistral — official "M" mark from simple-icons */}
                        <svg
                          viewBox="0 0 24 24"
                          className="h-7 w-7 shrink-0 fill-white/60 transition-all hover:fill-white/90"
                          aria-label="Mistral"
                        >
                          <path d="M3.428 0h4.398v4.398H3.428zM16.174 0h4.398v4.398h-4.398zM3.428 6.6h4.398v4.399H3.428zM9.801 6.6H14.2v4.399H9.801zM16.174 6.6h4.398v4.399h-4.398zM3.428 13.201h4.398V17.6H3.428zM9.801 13.201H14.2V17.6H9.801zM16.174 13.201h4.398V17.6h-4.398zM3.428 19.602h4.398V24H3.428zM16.174 19.602h4.398V24h-4.398z" />
                        </svg>
                        {/* Ollama — official llama mark from simple-icons */}
                        <svg
                          viewBox="0 0 24 24"
                          className="h-7 w-7 shrink-0 fill-white/60 transition-all hover:fill-white/90"
                          aria-label="Ollama"
                        >
                          <path d="M15.832 3.076c-.247-.026-.498.063-.68.245-.29.29-.329.743-.093 1.078.014.02.143.235.27.569.127.332.254.784.3 1.308.057.657-.017 1.456-.386 2.282-.735 1.645-1.175 2.343-1.175 3.872 0 1.04.204 1.774.506 2.312a3.856 3.856 0 0 0 .908 1.073c-.07.06-.263.198-.652.38-.506.234-1.08.394-1.554.394-.473 0-1.047-.16-1.553-.395-.39-.181-.582-.319-.652-.379a3.856 3.856 0 0 0 .908-1.073c.302-.538.506-1.272.506-2.312 0-1.53-.44-2.227-1.175-3.872-.369-.826-.443-1.625-.385-2.282.046-.524.172-.976.299-1.308.127-.334.256-.548.27-.569.236-.335.197-.788-.093-1.078a.753.753 0 0 0-.68-.245c-.248.026-.473.17-.591.395 0 0-.465.891-.593 1.912-.128 1.02-.027 2.243.485 3.389.577 1.29.898 1.776.898 2.658 0 .674-.13 1.117-.314 1.445-.185.328-.416.543-.618.7-.201.157-.373.26-.472.378a.684.684 0 0 0-.168.452c0 .39.305.756.83 1.09.527.332 1.279.62 2.123.62.845 0 1.597-.288 2.124-.62.526-.334.83-.7.83-1.09a.684.684 0 0 0-.168-.452c-.099-.118-.27-.221-.472-.379a2.87 2.87 0 0 1-.618-.699c-.183-.328-.314-.771-.314-1.445 0-.882.321-1.369.898-2.658.512-1.146.613-2.37.485-3.39-.128-1.02-.593-1.911-.593-1.911a.77.77 0 0 0-.591-.395zm-2.556 8.08a.4.4 0 0 1 .4.399.4.4 0 0 1-.4.4.4.4 0 0 1-.399-.4.4.4 0 0 1 .4-.4zm-2.552 0a.4.4 0 0 1 .4.399.4.4 0 0 1-.4.4.4.4 0 0 1-.4-.4.4.4 0 0 1 .4-.4z" />
                        </svg>
                        {/* Groq — text wordmark */}
                        <svg
                          viewBox="0 0 24 24"
                          className="h-5 w-auto shrink-0 fill-white/60 transition-all hover:fill-white/90"
                          aria-label="Groq"
                        >
                          <path d="M4.092 7.174a4.826 4.826 0 1 0 0 9.652 4.826 4.826 0 1 0 0-9.652zm0 7.347a2.52 2.52 0 1 1 0-5.042 2.52 2.52 0 0 1 0 5.042zm7.073-3.413v5.357h-2.31V7.316h2.158l.12.773a3.388 3.388 0 0 1 2.489-1.022v2.312a3.086 3.086 0 0 0-2.457.729zm4.786-.521a4.826 4.826 0 1 1 4.826 4.826h-1.714v3.052h-2.305V12.28a.63.63 0 0 1 .185-.447.63.63 0 0 1 .447-.185h3.387a2.521 2.521 0 1 0-2.521-2.521v1.46h-2.305v-1.46z" />
                        </svg>
                        {/* DeepSeek — official whale mark from simple-icons */}
                        <svg
                          viewBox="0 0 24 24"
                          className="h-7 w-7 shrink-0 fill-white/60 transition-all hover:fill-white/90"
                          aria-label="DeepSeek"
                        >
                          <path d="M9.143 0C4.093 0 0 4.093 0 9.143c0 2.414.943 4.608 2.478 6.238.058-.067.117-.13.179-.192a8.08 8.08 0 0 1 1.601-1.27c-.72-1.399-1.115-2.96-1.115-4.586C3.143 5.66 5.702 2.572 9.143 2.143V0zm5.714 0v2.143c3.441.429 6 3.517 6 7.19 0 1.626-.395 3.187-1.115 4.586a8.08 8.08 0 0 1 1.601 1.27c.062.062.121.125.179.192A9.098 9.098 0 0 0 24 9.143C24 4.093 19.907 0 14.857 0zM12 3.429a5.71 5.71 0 0 0-5.714 5.714c0 2.005 1.038 3.768 2.604 4.779C7.27 14.896 6 16.557 6 18.514c0 .293.03.583.086.871C7.614 21.857 9.67 24 12 24s4.386-2.143 5.914-4.615c.057-.288.086-.578.086-.87 0-1.958-1.27-3.619-2.89-4.593A5.705 5.705 0 0 0 17.714 9.143 5.71 5.71 0 0 0 12 3.429zm0 2.142a3.572 3.572 0 1 1 0 7.143 3.572 3.572 0 0 1 0-7.143z" />
                        </svg>
                        {/* Perplexity — official mark from simple-icons */}
                        <svg
                          viewBox="0 0 24 24"
                          className="h-7 w-7 shrink-0 fill-white/60 transition-all hover:fill-white/90"
                          aria-label="Perplexity"
                        >
                          <path d="M8.854 2v6.257L3.804 3.75v6.886H1.5v4.728h2.304v6.886l5.05-4.507V24h6.292v-6.257l5.05 4.507v-6.886H22.5v-4.728h-2.304V3.75l-5.05 4.507V2H8.854zm1.273 1.509v5.813l-4.78 4.266h4.78v5.403H9.89L5.077 14.94v4.05H2.773v-2.182h3.93L5.077 15.37v-2.74h6.677V8.257L5.077 3.563v4.051l4.813 4.051H5.077V9.483h3.93l-3.93-3.508v-2.19l5.05 4.507V1.51zm4.746 0v6.783l5.05-4.507v2.19l-3.93 3.508h3.93v2.182H15.11l4.813-4.051v-4.05l-6.677 4.374V12.63h6.677v2.74l-1.626 1.437h3.93v2.182h-2.304v-4.05L15.11 19.01h-1.237v-5.403h4.78l-4.78-4.266z" />
                        </svg>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <SurfaceShowcase />
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

              <div className="mt-14 grid gap-px bg-[#1a1917] md:grid-cols-2 lg:grid-cols-3">
                {features.map((feature) => {
                  const inner = (
                    <div className="group relative flex h-full flex-col bg-[#09090b] p-8 transition-colors hover:bg-[#0f0e0c]">
                      <div className="mb-6 flex items-center justify-between">
                        <feature.icon className="h-6 w-6 text-[#c8892a]" />
                        <span className="font-mono text-xs text-[#555150]">{feature.stat}</span>
                      </div>
                      <h3 className="mb-2 text-lg font-semibold text-[#edebe8]">{feature.title}</h3>
                      <p className="font-body flex-1 text-sm leading-relaxed text-[#888480]">
                        {feature.desc}
                      </p>
                      <div className="mt-5 flex items-center gap-1.5 text-xs font-medium text-[#555150] transition-colors group-hover:text-[#c8892a]">
                        Learn more <ArrowRight className="h-3 w-3" />
                      </div>
                    </div>
                  );
                  return (
                    <Link key={feature.title} href={feature.href}>
                      {inner}
                    </Link>
                  );
                })}
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
                  { icon: Shield, text: 'Memory-safe by default — no buffer overflows' },
                  { icon: Zap, text: 'Zero-cost abstractions — pays only for what it uses' },
                  {
                    icon: Lock,
                    text: 'Capability-based IPC — every tool call is permission-gated',
                  },
                  {
                    icon: Monitor,
                    text: 'Direct access to OS APIs — GPU, camera, files, clipboard',
                  },
                ].map(({ icon: Icon, text }) => (
                  <div
                    key={text}
                    className="flex items-center gap-2 rounded-full border border-white/[0.06] bg-[#0f0f11] px-4 py-2 text-xs text-[#666260]"
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-[#c8892a]" />
                    {text}
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
