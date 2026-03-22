import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight,
  Bot,
  Lock,
  Shield,
  CheckCircle2,
  Users,
  Plug,
  Wrench,
  MessageSquare,
} from 'lucide-react';

import { Header } from '../components/layout/Header';
import { ApplicationPreview } from '../components/ApplicationPreview';
import { CtaSection } from '../components/marketing/CtaSection';
import { MarketingFooter } from '../components/marketing/MarketingFooter';

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
    images: [
      {
        url: '/app-preview.png',
        width: 1200,
        height: 630,
        alt: 'AGI Workforce — AI desktop assistant',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AGI Workforce | AI Desktop Assistant',
    description:
      'Chat with AI, automate your browser, manage files, and run code — all from one native desktop app. Free to try.',
    images: ['/app-preview.png'],
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'AGI Workforce',
  description:
    'AGI Workforce is a native desktop AI assistant with chat, browser automation, multi-provider LLM support, and tool execution.',
  url: 'https://agiworkforce.com',
  mainEntity: {
    '@type': 'SoftwareApplication',
    name: 'AGI Workforce',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'macOS, Windows, Linux',
    featureList: [
      '140+ AI skills across 9 industries',
      '50+ built-in tools',
      'Desktop automation and computer use',
      'Parallel AI agent orchestration',
      '9+ LLM providers including local models',
      'Mobile companion with live agent dashboard',
      'Privacy-first: all processing happens locally',
      'Bring Your Own Keys (BYOK) — AES-256 encrypted',
      'Run fully offline with Ollama or LM Studio',
    ],
  },
};

const features = [
  {
    icon: Users,
    title: '140+ AI Skills',
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
    title: 'Desktop Automation',
    desc: 'Control your browser, run terminal commands, read and write files, and capture your screen — with approval controls so you stay in charge.',
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
    title: 'You Stay in Control',
    desc: 'Every action is reversible. Every tool call is visible before it runs. Your files and API keys never leave your machine.',
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
      <div className="flex min-h-screen flex-col bg-black text-white">
        <Header />

        <main className="flex-1 pt-24">
          {/* Hero */}
          <section className="relative overflow-hidden py-20 md:py-32 lg:py-40">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-black to-black" />
            <div className="container relative mx-auto px-4 text-center">
              <div className="mb-8 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-blue-400 backdrop-blur-xs">
                <span className="mr-2 flex h-2 w-2 rounded-full bg-blue-500" />
                Early Access — Free to try
              </div>

              <h1 className="mx-auto max-w-4xl text-4xl font-bold tracking-tight md:text-6xl lg:text-7xl">
                <span className="bg-gradient-to-b from-white to-zinc-500 bg-clip-text text-transparent">
                  Your AI desktop assistant that actually does the work
                </span>
              </h1>

              <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400 md:text-xl">
                Chat with AI, automate your browser, manage files, and run code — all from one
                native desktop app.{' '}
                <span className="text-zinc-300">
                  Everything runs locally. Every action is reversible.
                </span>
              </p>

              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  href="/download"
                  className="inline-flex h-12 items-center justify-center rounded-full bg-blue-600 px-8 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-black"
                >
                  Download Free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
                <Link
                  href="/docs"
                  className="inline-flex h-12 items-center justify-center rounded-full border border-zinc-800 bg-black px-8 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white"
                >
                  Read Documentation
                </Link>
              </div>

              <div className="mt-12 flex flex-col items-center gap-4 md:flex-row md:flex-wrap md:justify-center">
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>Your data stays on your machine</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>Every action is reversible with one click</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>Works with OpenAI, Anthropic, Google, and local models</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>macOS, Windows, and Linux</span>
                </div>
              </div>

              <ApplicationPreview />
            </div>
          </section>

          {/* Provider Trust Bar — infinite horizontal scroll with real logos */}
          <section className="border-y border-zinc-800/50 bg-zinc-950/50 py-16 overflow-hidden">
            <div className="container mx-auto px-4">
              <p className="mb-10 text-center text-sm font-medium uppercase tracking-widest text-zinc-500">
                Works with every major AI provider
              </p>
            </div>
            <div className="relative">
              {/* Gradient masks */}
              <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-zinc-950 to-transparent" />
              <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-zinc-950 to-transparent" />
              {/* Scrolling track — duplicated for seamless loop */}
              <div className="flex animate-marquee items-center gap-16">
                {[...Array(2)].map((_, setIndex) => (
                  <div key={setIndex} className="flex shrink-0 items-center gap-16">
                    {/* Anthropic */}
                    <div className="flex shrink-0 items-center gap-3 opacity-70 transition-opacity hover:opacity-100">
                      <svg viewBox="0 0 24 24" className="h-6 w-6 fill-orange-400">
                        <path d="M17.304 3.541l-5.17 14.27h3.164l5.17-14.27h-3.164zM6.696 3.541l5.17 14.27H8.702L3.532 3.541h3.164z" />
                      </svg>
                      <span className="text-lg font-semibold text-zinc-300">Anthropic</span>
                    </div>
                    {/* OpenAI */}
                    <div className="flex shrink-0 items-center gap-3 opacity-70 transition-opacity hover:opacity-100">
                      <svg viewBox="0 0 24 24" className="h-6 w-6 fill-emerald-400">
                        <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.998 5.998 0 0 0-3.998 2.9 6.042 6.042 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.602 1.5v3.003l-2.602 1.5-2.602-1.5z" />
                      </svg>
                      <span className="text-lg font-semibold text-zinc-300">OpenAI</span>
                    </div>
                    {/* Google */}
                    <div className="flex shrink-0 items-center gap-3 opacity-70 transition-opacity hover:opacity-100">
                      <svg viewBox="0 0 24 24" className="h-6 w-6">
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
                      <span className="text-lg font-semibold text-zinc-300">Google</span>
                    </div>
                    {/* xAI */}
                    <div className="flex shrink-0 items-center gap-3 opacity-70 transition-opacity hover:opacity-100">
                      <svg viewBox="0 0 24 24" className="h-6 w-6 fill-zinc-200">
                        <path d="M3.005 6.3h3.2l5.59 8.24L6.36 22H3.005l5.735-7.735L3.005 6.3zm8.25 0h3.2L22 22h-3.2L11.255 6.3zm5.545 0H20l-3.5 4.7-1.6-2.35L16.8 6.3z" />
                      </svg>
                      <span className="text-lg font-semibold text-zinc-300">xAI</span>
                    </div>
                    {/* DeepSeek */}
                    <div className="flex shrink-0 items-center gap-3 opacity-70 transition-opacity hover:opacity-100">
                      <svg viewBox="0 0 24 24" className="h-6 w-6 fill-cyan-400">
                        <circle cx="12" cy="12" r="10" />
                        <text
                          x="12"
                          y="16"
                          textAnchor="middle"
                          fill="#0a0a0a"
                          fontSize="10"
                          fontWeight="bold"
                          fontFamily="system-ui"
                        >
                          DS
                        </text>
                      </svg>
                      <span className="text-lg font-semibold text-zinc-300">DeepSeek</span>
                    </div>
                    {/* Ollama */}
                    <div className="flex shrink-0 items-center gap-3 opacity-70 transition-opacity hover:opacity-100">
                      <svg viewBox="0 0 24 24" className="h-6 w-6 fill-zinc-200">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l7 4.5-7 4.5z" />
                      </svg>
                      <span className="text-lg font-semibold text-zinc-300">Ollama</span>
                    </div>
                    {/* Mistral */}
                    <div className="flex shrink-0 items-center gap-3 opacity-70 transition-opacity hover:opacity-100">
                      <svg viewBox="0 0 24 24" className="h-6 w-6">
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
                      <span className="text-lg font-semibold text-zinc-300">Mistral</span>
                    </div>
                    {/* Perplexity */}
                    <div className="flex shrink-0 items-center gap-3 opacity-70 transition-opacity hover:opacity-100">
                      <svg viewBox="0 0 24 24" className="h-6 w-6 fill-teal-400">
                        <path d="M12 1L4 5v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V5l-8-4zm0 2.18l6 3v5.82c0 4.53-3.13 8.72-6 9.82-2.87-1.1-6-5.29-6-9.82V6.18l6-3z" />
                        <path d="M12 6l-4 2v4c0 2.76 1.56 5.34 4 6.47 2.44-1.13 4-3.71 4-6.47V8l-4-2z" />
                      </svg>
                      <span className="text-lg font-semibold text-zinc-300">Perplexity</span>
                    </div>
                    {/* Groq */}
                    <div className="flex shrink-0 items-center gap-3 opacity-70 transition-opacity hover:opacity-100">
                      <svg viewBox="0 0 24 24" className="h-6 w-6 fill-purple-400">
                        <circle cx="12" cy="12" r="10" />
                        <text
                          x="12"
                          y="16"
                          textAnchor="middle"
                          fill="#0a0a0a"
                          fontSize="8"
                          fontWeight="bold"
                          fontFamily="system-ui"
                        >
                          GQ
                        </text>
                      </svg>
                      <span className="text-lg font-semibold text-zinc-300">Groq</span>
                    </div>
                    {/* Together */}
                    <div className="flex shrink-0 items-center gap-3 opacity-70 transition-opacity hover:opacity-100">
                      <svg viewBox="0 0 24 24" className="h-6 w-6 fill-blue-400">
                        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                      </svg>
                      <span className="text-lg font-semibold text-zinc-300">Together</span>
                    </div>
                    {/* Qwen */}
                    <div className="flex shrink-0 items-center gap-3 opacity-70 transition-opacity hover:opacity-100">
                      <svg viewBox="0 0 24 24" className="h-6 w-6 fill-violet-400">
                        <circle cx="12" cy="12" r="10" />
                        <text
                          x="12"
                          y="16"
                          textAnchor="middle"
                          fill="#0a0a0a"
                          fontSize="8"
                          fontWeight="bold"
                          fontFamily="system-ui"
                        >
                          QW
                        </text>
                      </svg>
                      <span className="text-lg font-semibold text-zinc-300">Qwen</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-10 text-center text-sm text-zinc-500">
              No vendor lock-in. Switch models anytime. Your keys, your data.
            </p>
          </section>

          {/* Features */}
          <section id="features" className="bg-zinc-950 py-24">
            <div className="container mx-auto px-4">
              <div className="mb-16 text-center">
                <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">
                  What you can do
                </h2>
                <p className="mx-auto max-w-2xl text-zinc-400">
                  One app that handles the full range of AI-assisted work — from quick questions to
                  long-running automations.
                </p>
              </div>
              <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                {features.map((feature) => {
                  const card = (
                    <div className="rounded-2xl border border-zinc-800 bg-black/50 p-8 transition-colors hover:border-blue-500/50">
                      <feature.icon className="mb-4 h-10 w-10 text-blue-500" />
                      <h3 className="mb-2 text-xl font-semibold">{feature.title}</h3>
                      <p className="leading-relaxed text-zinc-400">{feature.desc}</p>
                      {feature.href && (
                        <div className="mt-4 flex items-center gap-1 text-sm font-medium text-blue-400">
                          Learn more <ArrowRight className="h-3 w-3" />
                        </div>
                      )}
                    </div>
                  );
                  return feature.href ? (
                    <Link key={feature.title} href={feature.href} className="block">
                      {card}
                    </Link>
                  ) : (
                    <div key={feature.title}>{card}</div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Social Proof */}
          <section className="border-t border-zinc-800/50 bg-zinc-950 py-16">
            <div className="container mx-auto px-4 text-center">
              <p className="mb-8 text-sm font-medium uppercase tracking-widest text-zinc-500">
                Trusted by developers worldwide
              </p>
              <div className="flex flex-wrap justify-center gap-6 mb-12 md:gap-10">
                {[
                  'OpenAI',
                  'Anthropic',
                  'Google AI',
                  'Meta AI',
                  'Mistral',
                  'Ollama',
                  'DeepSeek',
                ].map((name) => (
                  <span
                    key={name}
                    className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-300"
                  >
                    {name}
                  </span>
                ))}
              </div>
              <div className="mx-auto grid max-w-2xl grid-cols-2 gap-8 md:grid-cols-4">
                <div>
                  <div className="text-2xl font-bold text-white">9+</div>
                  <div className="mt-1 text-xs text-zinc-500">AI Providers</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">140+</div>
                  <div className="mt-1 text-xs text-zinc-500">AI Skills</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">&#8734;</div>
                  <div className="mt-1 text-xs text-zinc-500">MCP Tools</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">100%</div>
                  <div className="mt-1 text-xs text-zinc-500">Local-First</div>
                </div>
              </div>
            </div>
          </section>

          {/* Stats */}
          <section className="bg-black py-24">
            <div className="container mx-auto px-4">
              <div className="grid gap-8 text-center md:grid-cols-4">
                <div className="p-8">
                  <div className="mb-2 text-5xl font-bold text-blue-500">140+</div>
                  <div className="text-lg text-zinc-400">AI Skills</div>
                  <p className="mt-2 text-sm text-zinc-600">
                    Healthcare, legal, finance, creative, and more
                  </p>
                </div>
                <div className="p-8">
                  <div className="mb-2 text-5xl font-bold text-blue-500">9+</div>
                  <div className="text-lg text-zinc-400">AI Providers</div>
                  <p className="mt-2 text-sm text-zinc-600">
                    OpenAI, Anthropic, Google, xAI, DeepSeek, Ollama
                  </p>
                </div>
                <div className="p-8">
                  <div className="mb-2 text-5xl font-bold text-blue-500">50+</div>
                  <div className="text-lg text-zinc-400">Built-in Tools</div>
                  <p className="mt-2 text-sm text-zinc-600">
                    Browser, terminal, files, search, and more
                  </p>
                </div>
                <div className="p-8">
                  <div className="mb-2 text-5xl font-bold text-blue-500">3</div>
                  <div className="text-lg text-zinc-400">Platforms</div>
                  <p className="mt-2 text-sm text-zinc-600">
                    macOS, Windows, and Linux desktop + mobile
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Security */}
          <section id="security" className="bg-zinc-950 py-24">
            <div className="container mx-auto px-4">
              <div className="flex flex-col items-center gap-16 md:flex-row">
                <div className="flex-1 space-y-8">
                  <div className="mb-2 inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-400">
                    <Lock className="mr-2 h-4 w-4" />
                    Privacy-First Architecture
                  </div>
                  <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                    Your Code Never Leaves Your Machine
                  </h2>
                  <div className="space-y-6">
                    <div className="flex gap-4">
                      <Lock className="h-6 w-6 shrink-0 text-emerald-500" />
                      <div>
                        <h3 className="mb-2 text-xl font-semibold">Local Processing Only</h3>
                        <p className="text-zinc-400">
                          Every conversation is processed on your machine using your own API keys.
                          Zero data passes through AGI Workforce servers.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <Shield className="h-6 w-6 shrink-0 text-emerald-500" />
                      <div>
                        <h3 className="mb-2 text-xl font-semibold">Bring Your Own Keys</h3>
                        <p className="text-zinc-400">
                          API keys are encrypted locally with AES-256. You own your API
                          relationships and control every token.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" />
                      <div>
                        <h3 className="mb-2 text-xl font-semibold">Run Fully Offline</h3>
                        <p className="text-zinc-400">
                          Connect Ollama or LM Studio for 100% offline operation. Zero internet
                          required for local models.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex-1">
                  <div className="relative rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-xs">
                    <div className="absolute inset-0 -z-10 bg-emerald-500/10 blur-3xl" />
                    <div className="rounded-xl border border-white/10 bg-white/5 p-6">
                      <h4 className="mb-4 text-sm font-semibold text-white">
                        Where Your Data Lives
                      </h4>
                      <div className="space-y-3">
                        {[
                          { item: 'Conversations', location: 'Your machine only' },
                          { item: 'API Keys', location: 'Encrypted locally (AES-256)' },
                          { item: 'Files & Documents', location: 'Your machine only' },
                          { item: 'Model Calls', location: 'Direct to provider API' },
                          { item: 'AGI Workforce servers', location: 'None' },
                        ].map(({ item, location }) => (
                          <div key={item} className="flex items-center justify-between text-sm">
                            <span className="text-white/60">{item}</span>
                            <span
                              className={
                                location === 'None'
                                  ? 'font-medium text-emerald-400'
                                  : 'text-white/80'
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
            </div>
          </section>

          <CtaSection
            headline="Try it free — no credit card needed"
            body="Download in under a minute. Connect your preferred AI provider and start working. Uninstall anytime."
          />
        </main>

        <MarketingFooter />
      </div>
    </>
  );
}
