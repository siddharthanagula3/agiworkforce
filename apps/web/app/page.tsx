import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, Bot, Cpu, Globe, Shield, Zap, Sparkles, CheckCircle2 } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { ApplicationPreview } from '../components/ApplicationPreview';

export const metadata: Metadata = {
  title: 'AGI Workforce | AI Agent for Desktop',
  description:
    'AGI Workforce is a native desktop AI agent with chat, browser automation, multi-provider LLM support, and tool execution — available on macOS, Windows, and Linux.',
  keywords: [
    'AI agent',
    'AI automation',
    'desktop AI app',
    'browser automation',
    'Tauri desktop app',
    'Ollama',
    'OpenAI',
    'Anthropic',
    'Gemini',
    'Claude',
  ],
  openGraph: {
    title: 'AGI Workforce | AI Agent for Desktop',
    description:
      'A native AI agent desktop app with chat, browser automation, and multi-provider model support. Now in Public Beta.',
    type: 'website',
    url: 'https://agiworkforce.com',
    images: [
      {
        url: '/og-image.svg',
        width: 1200,
        height: 630,
        alt: 'AGI Workforce — AI agent desktop app',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AGI Workforce | AI Agent for Desktop',
    description:
      'Native AI agent desktop app with chat, browser automation, and multi-provider LLM support. Now in Public Beta.',
    images: ['/og-image.svg'],
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'AGI Workforce',
  description:
    'AGI Workforce is a native desktop AI agent with chat, browser automation, multi-provider LLM support, and tool execution — now in public beta.',
  url: 'https://agiworkforce.com',
  mainEntity: {
    '@type': 'SoftwareApplication',
    name: 'AGI Workforce',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'macOS, Windows, Linux',
    featureList: [
      'Desktop application (Tauri)',
      'Web application',
      'Browser automation tools',
      'Multiple LLM provider configuration',
      'Local model support via Ollama',
      'Chat interface',
    ],
  },
};

const features = [
  {
    icon: Cpu,
    title: 'Desktop App (Tauri + Rust)',
    desc: 'Native desktop shell with a React UI and Tauri backend for local tools, system integrations, and packaged releases.',
  },
  {
    icon: Globe,
    title: 'Web App + API Routes',
    desc: 'Next.js web app with authenticated pages and API routes for chat, downloads, device linking, billing, and release checks.',
  },
  {
    icon: Bot,
    title: 'Multi-Provider Models',
    desc: 'Model/provider configuration includes cloud providers and local Ollama support, with provider switching in desktop settings and tests.',
  },
  {
    icon: Zap,
    title: 'Browser Automation Flows',
    desc: 'Desktop codebase includes browser automation hooks, stores, and end-to-end tests for automation workflows.',
  },
  {
    icon: Shield,
    title: 'Undo and Safety Controls',
    desc: 'Desktop app exposes undo APIs and approval-related hooks/components for controlled execution flows.',
  },
  {
    icon: Sparkles,
    title: 'Chat-First Interface',
    desc: 'Primary product surface is a chat-driven UI with attachments, inline tool results, and settings panels.',
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
          <section className="relative overflow-hidden py-20 md:py-32 lg:py-40">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-black to-black" />
            <div className="container relative mx-auto px-4 text-center">
              <div className="mb-8 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-blue-400 backdrop-blur-xs">
                <span className="mr-2 flex h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                Now in Public Beta
              </div>
              <h1 className="mx-auto max-w-4xl bg-gradient-to-b from-white to-white/50 bg-clip-text text-5xl font-bold tracking-tight text-transparent md:text-7xl lg:text-8xl">
                AGI for Everyone
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400 md:text-xl">
                A native desktop AI agent with chat, browser automation, multi-provider model
                support, and tool execution — available on macOS, Windows, and Linux.
              </p>
              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  href="/download"
                  className="inline-flex h-12 items-center justify-center rounded-full bg-blue-600 px-8 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-black"
                >
                  Download Desktop App
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
                <Link
                  href="/docs"
                  className="inline-flex h-12 items-center justify-center rounded-full border border-zinc-800 bg-black px-8 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white"
                >
                  Read Documentation
                </Link>
              </div>

              <div className="mt-12 flex flex-col items-center gap-4 md:flex-row md:justify-center">
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>Available on macOS, Windows, and Linux</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>Claude, GPT-4o, Gemini, Grok, DeepSeek, and Ollama</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>Browser automation, file management, and terminal tools</span>
                </div>
              </div>

              <ApplicationPreview />
            </div>
          </section>

          <section id="features" className="bg-zinc-950 py-24">
            <div className="container mx-auto px-4">
              <div className="mb-16 text-center">
                <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">
                  Everything You Need
                </h2>
                <p className="mx-auto max-w-2xl text-zinc-400">
                  AGI Workforce ships a complete set of AI automation tools out of the box.
                </p>
              </div>
              <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                {features.map((feature) => (
                  <div
                    key={feature.title}
                    className="group rounded-2xl border border-zinc-800 bg-black/50 p-8 transition-all hover:scale-105 hover:border-blue-500/50"
                  >
                    <feature.icon className="mb-4 h-10 w-10 text-blue-500" />
                    <h3 className="mb-2 text-xl font-semibold">{feature.title}</h3>
                    <p className="leading-relaxed text-zinc-400">{feature.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="bg-black py-24">
            <div className="container mx-auto px-4">
              <div className="grid gap-8 text-center md:grid-cols-3">
                <div className="p-8">
                  <div className="mb-2 text-5xl font-bold text-blue-500">6+</div>
                  <div className="text-lg text-zinc-400">AI Providers</div>
                  <p className="mt-2 text-sm text-zinc-600">
                    Claude, GPT-4o, Gemini, Grok, DeepSeek, Ollama
                  </p>
                </div>
                <div className="p-8">
                  <div className="mb-2 text-5xl font-bold text-blue-500">3</div>
                  <div className="text-lg text-zinc-400">Platforms</div>
                  <p className="mt-2 text-sm text-zinc-600">
                    macOS, Windows, and Linux desktop downloads
                  </p>
                </div>
                <div className="p-8">
                  <div className="mb-2 text-5xl font-bold text-blue-500">∞</div>
                  <div className="text-lg text-zinc-400">Automatable Tasks</div>
                  <p className="mt-2 text-sm text-zinc-600">
                    Browser, file system, terminal, and custom MCP tools
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section id="security" className="bg-zinc-950 py-24">
            <div className="container mx-auto px-4">
              <div className="flex flex-col items-center gap-16 md:flex-row">
                <div className="flex-1 space-y-8">
                  <div className="mb-2 inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-sm text-blue-400">
                    <Shield className="mr-2 h-4 w-4" />
                    Security and Safety Features in Code
                  </div>
                  <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                    Built-In Protections and Controls
                  </h2>
                  <div className="space-y-6">
                    <div className="flex gap-4">
                      <Shield className="h-6 w-6 shrink-0 text-blue-500" />
                      <div>
                        <h3 className="mb-2 text-xl font-semibold">
                          Encrypted Local Secrets Code Paths
                        </h3>
                        <p className="text-zinc-400">
                          The desktop Rust backend includes keyring and encryption dependencies
                          (`keyring`, `aes-gcm`, `argon2`) for local credential handling.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <Shield className="h-6 w-6 shrink-0 text-blue-500" />
                      <div>
                        <h3 className="mb-2 text-xl font-semibold">Undo Operations API</h3>
                        <p className="text-zinc-400">
                          Desktop TypeScript APIs expose undo summary, change listing, and undo
                          execution commands backed by Tauri invokes.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <Shield className="h-6 w-6 shrink-0 text-blue-500" />
                      <div>
                        <h3 className="mb-2 text-xl font-semibold">
                          Updater Signing Configuration
                        </h3>
                        <p className="text-zinc-400">
                          Tauri updater configuration is present with a public key and website
                          endpoint for desktop release manifests.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex-1">
                  <div className="relative rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-xs">
                    <div className="absolute inset-0 -z-10 bg-blue-500/10 blur-3xl" />
                    <div className="space-y-4 font-mono text-sm text-zinc-400">
                      <div className="flex items-center gap-2 text-green-400">
                        <Shield className="h-4 w-4" />
                        <span>Release Config Snapshot</span>
                      </div>
                      <div className="h-px bg-white/10" />
                      <div className="flex justify-between">
                        <span>Desktop Version</span>
                        <span className="text-white">1.1.3</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Tauri Bundle</span>
                        <span className="text-white">active: true</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Targets</span>
                        <span className="text-white">all</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Updater</span>
                        <span className="text-white">Configured</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Release API Routes</span>
                        <span className="text-white">Present</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="relative overflow-hidden py-24">
            <div className="absolute inset-0 bg-blue-600/10" />
            <div className="container relative mx-auto px-4 text-center">
              <h2 className="mb-6 text-4xl font-bold tracking-tight md:text-5xl">
                Start automating today
              </h2>
              <p className="mx-auto mb-10 max-w-2xl text-xl text-zinc-400">
                Download the desktop app and connect your preferred AI provider in minutes. No
                infrastructure required.
              </p>
              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  href="/download"
                  className="inline-flex h-14 items-center justify-center rounded-full bg-white px-8 text-lg font-bold text-black transition-transform hover:scale-105"
                >
                  Download Desktop App
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex h-14 items-center justify-center rounded-full border border-zinc-700 bg-black px-8 text-lg font-medium text-white transition-colors hover:bg-zinc-900"
                >
                  View Pricing
                </Link>
              </div>
            </div>
          </section>
        </main>

        <footer className="border-t border-white/10 bg-black py-12">
          <div className="container mx-auto px-4">
            <div className="mb-8 flex flex-col items-center justify-between gap-6 md:flex-row">
              <div className="flex items-center gap-2 font-bold">
                <Bot className="h-5 w-5 text-zinc-500" />
                <span className="text-zinc-500">AGI Workforce</span>
              </div>
              <div className="flex flex-wrap justify-center gap-6 text-sm">
                <Link href="/about" className="text-zinc-400 transition-colors hover:text-white">
                  About
                </Link>
                <Link href="/pricing" className="text-zinc-400 transition-colors hover:text-white">
                  Pricing
                </Link>
                <Link href="/docs" className="text-zinc-400 transition-colors hover:text-white">
                  Documentation
                </Link>
                <Link href="/faq" className="text-zinc-400 transition-colors hover:text-white">
                  FAQ
                </Link>
                <Link href="/contact" className="text-zinc-400 transition-colors hover:text-white">
                  Contact
                </Link>
                <Link href="/privacy" className="text-zinc-400 transition-colors hover:text-white">
                  Privacy
                </Link>
                <Link href="/terms" className="text-zinc-400 transition-colors hover:text-white">
                  Terms
                </Link>
              </div>
            </div>
            <div className="text-center text-sm text-zinc-600">
              © {new Date().getFullYear()} AGI Automation LLC. All rights reserved.
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
