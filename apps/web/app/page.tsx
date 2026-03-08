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
  title: 'AGI Workforce | AI Agent for Desktop',
  description:
    'AGI Workforce is a privacy-first native desktop AI agent. All processing happens locally — conversations, files, and API keys never leave your machine. Multi-provider LLM support with BYOK and full offline mode via Ollama.',
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
    title: 'AGI Workforce | AI Agent for Desktop',
    description:
      'A native AI agent desktop app with chat, browser automation, and multi-provider model support. Now in Public ALPHA.',
    type: 'website',
    url: 'https://agiworkforce.com',
    images: [
      {
        url: '/app-preview.png',
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
      'Native AI agent desktop app with chat, browser automation, and multi-provider LLM support. Now in Public ALPHA.',
    images: ['/app-preview.png'],
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'AGI Workforce',
  description:
    'AGI Workforce is a native desktop AI agent with chat, browser automation, multi-provider LLM support, and tool execution — now in public ALPHA.',
  url: 'https://agiworkforce.com',
  mainEntity: {
    '@type': 'SoftwareApplication',
    name: 'AGI Workforce',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'macOS, Windows, Linux',
    featureList: [
      '140+ AI skills across 9 industries',
      'Unlimited MCP tools and plugins',
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
    desc: 'Pre-built AI specialists across healthcare, legal, finance, creative, education, and more — ready to handle real work in every industry.',
    href: '/features/ai-skills',
  },
  {
    icon: Plug,
    title: 'Unlimited MCP Plugins',
    desc: 'Connect any MCP tool — file systems, databases, APIs, browsers, and cloud services. No artificial tool caps.',
    href: '/features/plugins',
  },
  {
    icon: Wrench,
    title: 'Desktop Automation',
    desc: 'Native computer use: browser control, terminal commands, file management, screen capture, and OCR — all with safety controls.',
    href: '/features/tools',
  },
  {
    icon: Bot,
    title: 'Parallel AI Agents',
    desc: 'Swarm orchestration decomposes tasks, spawns parallel agents, and aggregates results — autonomous AI that scales.',
    href: '/features/agents',
  },
  {
    icon: MessageSquare,
    title: 'Agentic Chat',
    desc: 'Chat interface with real-time tool execution, inline results, reasoning traces, and Claude Code-style status labels.',
    href: '/features/ai-chat',
  },
  {
    icon: Lock,
    title: 'Privacy-First Design',
    desc: 'All processing happens locally on your machine. Conversations, files, and API keys never pass through our servers. BYOK means you own every token.',
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
          <section className="relative overflow-hidden py-20 md:py-32 lg:py-40">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-black to-black" />
            <div className="container relative mx-auto px-4 text-center">
              <div className="mb-8 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-blue-400 backdrop-blur-xs">
                <span className="mr-2 flex h-2 w-2 rounded-full bg-blue-500" />
                Now in Public ALPHA
              </div>
              <h1 className="mx-auto max-w-5xl whitespace-nowrap text-6xl font-bold tracking-tight md:text-8xl lg:text-9xl">
                <span className="bg-gradient-to-b from-white to-zinc-500 bg-clip-text text-transparent">
                  AGI
                </span>{' '}
                <span className="bg-gradient-to-b from-blue-400 to-blue-600 bg-clip-text text-transparent">
                  WORKFORCE
                </span>
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

              <div className="mt-12 flex flex-col items-center gap-4 md:flex-row md:flex-wrap md:justify-center">
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>Available on macOS, Windows, and Linux</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>OpenAI, Anthropic, Google, xAI, DeepSeek, and Ollama</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>Browser automation, file management, and terminal tools</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>Your data never leaves your machine</span>
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
                  <div className="mb-2 text-5xl font-bold text-blue-500">∞</div>
                  <div className="text-lg text-zinc-400">MCP Tools</div>
                  <p className="mt-2 text-sm text-zinc-600">
                    Unlimited plugins via Model Context Protocol
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
            headline="Start automating today"
            body="Download the desktop app and connect your preferred AI provider in minutes. No infrastructure required."
          />
        </main>

        <MarketingFooter
          links={[
            { label: 'AI Skills', href: '/features/ai-skills' },
            { label: 'Plugins', href: '/features/plugins' },
            { label: 'Tools', href: '/features/tools' },
            { label: 'Agents', href: '/features/agents' },
            { label: 'Pricing', href: '/pricing' },
            { label: 'Docs', href: '/docs' },
            { label: 'About', href: '/about' },
            { label: 'Privacy', href: '/privacy' },
            { label: 'Terms', href: '/terms' },
          ]}
        />
      </div>
    </>
  );
}
