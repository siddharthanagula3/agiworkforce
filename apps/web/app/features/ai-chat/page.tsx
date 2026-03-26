import Link from 'next/link';
import type { Metadata } from 'next';
import { MARKETING } from '@/lib/marketing-constants';
import {
  ArrowRight,
  MessageSquare,
  Zap,
  Brain,
  Mic,
  Layers,
  History,
  Shield,
  CheckCircle2,
  Settings,
  Play,
  Search,
} from 'lucide-react';
import { Header } from '../../../components/layout/Header';
import { CtaSection } from '../../../components/marketing/CtaSection';
import { MarketingFooter } from '../../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Agentic AI Chat | AGI Workforce',
  description:
    'Multi-model AI chat with real-time tool execution, streaming responses, reasoning traces, and voice input — all in a native desktop interface.',
  keywords: [
    'AI chat',
    'agentic chat',
    'multi-model chat',
    'streaming AI',
    'tool execution',
    'Claude chat',
    'GPT chat',
    'voice AI',
    'AGI Workforce',
  ],
  alternates: { canonical: 'https://agiworkforce.com/features/ai-chat' },
  openGraph: {
    title: 'Agentic AI Chat | AGI Workforce',
    description:
      'Multi-model AI chat with real-time tool execution, streaming responses, and reasoning traces.',
    url: 'https://agiworkforce.com/features/ai-chat',
    siteName: 'AGI Workforce',
    type: 'website',
    images: [
      { url: '/app-preview.png', width: 1200, height: 630, alt: 'AGI Workforce - Agentic AI Chat' },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Agentic AI Chat | AGI Workforce',
    description:
      'Multi-model chat with streaming, tool execution, reasoning traces, and voice input.',
    images: ['/app-preview.png'],
    creator: '@agiworkforce',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Agentic AI Chat - AGI Workforce',
  description:
    'Multi-model AI chat with real-time tool execution, streaming responses, and reasoning traces.',
  url: 'https://agiworkforce.com/features/ai-chat',
  isPartOf: {
    '@type': 'WebSite',
    '@id': 'https://agiworkforce.com/#website',
    name: 'AGI Workforce',
    url: 'https://agiworkforce.com',
  },
};

const capabilities = [
  {
    icon: Layers,
    title: 'Multi-Provider Models',
    gradient: 'from-blue-500 to-blue-600',
    borderHover: 'hover:border-blue-500/50',
    iconColor: 'text-blue-400',
    bgGlow: 'bg-blue-500/10',
    features: [
      'Switch between OpenAI, Anthropic, Google, xAI, DeepSeek, Ollama, and more',
      'Bring your own API keys — no middleman, no markup',
    ],
    tagline: `${MARKETING.providers.display} providers, one unified interface`,
  },
  {
    icon: Zap,
    title: 'Real-Time Streaming',
    gradient: 'from-emerald-500 to-green-600',
    borderHover: 'hover:border-emerald-500/50',
    iconColor: 'text-emerald-400',
    bgGlow: 'bg-emerald-500/10',
    features: [
      'Server-sent events (SSE) streaming for instant token-by-token output',
      'Live streaming cursor with real-time progress indicators',
    ],
    tagline: 'Zero wait — responses appear as they generate',
  },
  {
    icon: MessageSquare,
    title: 'Inline Tool Execution',
    gradient: 'from-purple-500 to-violet-600',
    borderHover: 'hover:border-purple-500/50',
    iconColor: 'text-purple-400',
    bgGlow: 'bg-purple-500/10',
    features: [
      'Claude Code-style status labels: Read, Write, Bash, WebSearch, and more',
      'Tool timeline with duration, arguments, and result previews inline',
    ],
    tagline: 'Watch the AI work — no black box',
  },
  {
    icon: Brain,
    title: 'Reasoning Traces',
    gradient: 'from-orange-500 to-amber-600',
    borderHover: 'hover:border-orange-500/50',
    iconColor: 'text-orange-400',
    bgGlow: 'bg-orange-500/10',
    features: [
      'Extended thinking mode for complex multi-step problems',
      'Collapsible reasoning blocks — see exactly how the AI thinks',
    ],
    tagline: 'Transparent AI reasoning, not a black box',
  },
  {
    icon: Mic,
    title: 'Voice Input',
    gradient: 'from-cyan-500 to-teal-600',
    borderHover: 'hover:border-cyan-500/50',
    iconColor: 'text-cyan-400',
    bgGlow: 'bg-cyan-500/10',
    features: [
      'Hold-to-record voice input with Wispr Flow-style hotkey',
      'Local or cloud transcription powered by Whisper',
    ],
    tagline: 'Talk to your AI agent, hands-free',
  },
  {
    icon: History,
    title: 'Session History',
    gradient: 'from-pink-500 to-rose-600',
    borderHover: 'hover:border-pink-500/50',
    iconColor: 'text-pink-400',
    bgGlow: 'bg-pink-500/10',
    features: [
      'Persistent conversation history with full-text search',
      'Resume any past session, rename, organize, and export',
    ],
    tagline: 'Never lose a conversation',
  },
];

const safetyFeatures = [
  {
    icon: Shield,
    title: 'Rate Limiting',
    description:
      'Per-user token and request limits prevent runaway costs across all connected providers.',
  },
  {
    icon: CheckCircle2,
    title: 'Tool Approval Flows',
    description:
      'Before any tool executes in agentic mode, you review and approve or deny each action.',
  },
  {
    icon: Settings,
    title: 'Budget Controls',
    description: 'Set per-session token budgets. Autonomous loops stop when limits are reached.',
  },
  {
    icon: Shield,
    title: 'Local Key Storage',
    description:
      'API keys are encrypted at rest via Argon2id + AES-GCM and never leave your device in plaintext.',
  },
];

const steps = [
  {
    number: '01',
    icon: Layers,
    title: 'Pick Your Model',
    description: `Choose from ${MARKETING.providers.display} AI providers or use a local Ollama model. Switch mid-conversation without losing context.`,
  },
  {
    number: '02',
    icon: Play,
    title: 'Chat Naturally',
    description:
      'Type or speak your request. The AI streams responses in real time, executing tools inline and showing every step.',
  },
  {
    number: '03',
    icon: Search,
    title: 'Review & Continue',
    description:
      'See the full tool timeline, reasoning traces, and results. Continue the conversation or start a new session.',
  },
];

export default function AIChatFeaturePage() {
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
                <MessageSquare className="mr-2 h-4 w-4" />
                Agentic Chat
              </div>
              <h1 className="mx-auto max-w-4xl bg-gradient-to-b from-white to-white/50 bg-clip-text text-5xl font-bold tracking-tight text-transparent md:text-7xl lg:text-8xl">
                Chat That Actually Gets Things Done
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400 md:text-xl">
                Multi-model AI chat with real-time tool execution, streaming responses, reasoning
                traces, and voice input — all in one native desktop interface.
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
                  href="#capabilities"
                  className="inline-flex h-12 items-center justify-center rounded-full border border-zinc-800 bg-black px-8 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white"
                >
                  See Capabilities
                </Link>
              </div>
              <div className="mt-12 flex flex-col items-center gap-4 md:flex-row md:justify-center">
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <Zap className="h-4 w-4 text-blue-500" />
                  <span>{MARKETING.providers.display} AI Providers</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>Real-Time Streaming</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <Shield className="h-4 w-4 text-emerald-500" />
                  <span>Full Tool Visibility</span>
                </div>
              </div>
            </div>
          </section>

          {/* Capabilities Grid */}
          <section id="capabilities" className="bg-zinc-950 py-24">
            <div className="container mx-auto px-4">
              <div className="mb-16 text-center">
                <div className="mb-4 inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-sm text-blue-400">
                  <Zap className="mr-2 h-4 w-4" />
                  Capabilities
                </div>
                <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">
                  Everything a Power User Needs
                </h2>
                <p className="mx-auto max-w-2xl text-zinc-400">
                  Six powerful chat features that make AGI Workforce the most capable AI chat
                  interface available on any desktop platform.
                </p>
              </div>
              <div className="grid gap-8 md:grid-cols-2">
                {capabilities.map((capability) => (
                  <div
                    key={capability.title}
                    className={`group relative rounded-2xl border border-zinc-800 bg-black/50 p-8 transition-all hover:scale-[1.02] ${capability.borderHover}`}
                  >
                    <div
                      className={`absolute inset-0 rounded-2xl ${capability.bgGlow} opacity-0 transition-opacity group-hover:opacity-100 blur-xl pointer-events-none`}
                    />
                    <div className="flex items-start gap-5">
                      <div
                        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${capability.gradient} shadow-lg`}
                      >
                        <capability.icon className="h-7 w-7 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="mb-3 text-xl font-semibold">{capability.title}</h3>
                        <ul className="mb-4 space-y-2">
                          {capability.features.map((feature) => (
                            <li key={feature} className="flex items-start gap-2 text-zinc-400">
                              <CheckCircle2
                                className={`mt-0.5 h-4 w-4 shrink-0 ${capability.iconColor}`}
                              />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                        <p className={`text-sm font-medium ${capability.iconColor}`}>
                          {capability.tagline}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Safety Section */}
          <section className="bg-black py-24">
            <div className="container mx-auto px-4">
              <div className="flex flex-col items-center gap-16 lg:flex-row">
                <div className="flex-1 space-y-8">
                  <div className="mb-2 inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-400">
                    <Shield className="mr-2 h-4 w-4" />
                    Privacy & Safety
                  </div>
                  <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                    Your Keys, Your Data
                  </h2>
                  <p className="text-lg text-zinc-400">
                    AGI Workforce never proxies your API calls or stores your conversations on our
                    servers. Everything stays on your device.
                  </p>
                  <div className="space-y-6">
                    {safetyFeatures.map((feature) => (
                      <div key={feature.title} className="flex gap-4">
                        <feature.icon className="h-6 w-6 shrink-0 text-emerald-500" />
                        <div>
                          <h3 className="mb-1 text-lg font-semibold">{feature.title}</h3>
                          <p className="text-zinc-400">{feature.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex-1">
                  <div className="relative rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-xs">
                    <div className="absolute inset-0 -z-10 bg-emerald-500/10 blur-3xl rounded-2xl" />
                    <div className="space-y-4 font-mono text-sm text-zinc-400">
                      <div className="flex items-center gap-2 text-emerald-400">
                        <MessageSquare className="h-4 w-4" />
                        <span>Active Chat Session</span>
                      </div>
                      <div className="h-px bg-white/10" />
                      <div className="flex justify-between">
                        <span>Model</span>
                        <span className="text-white">claude-sonnet-4-6</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Key Storage</span>
                        <span className="text-emerald-400">Local Encrypted</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Tool Approval</span>
                        <span className="text-emerald-400">Active</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Token Budget</span>
                        <span className="text-white">8,432 / 10,000</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Tools Executed</span>
                        <span className="text-white">3 this session</span>
                      </div>
                      <div className="h-px bg-white/10" />
                      <div className="flex justify-between">
                        <span>Status</span>
                        <span className="text-emerald-400 font-semibold">Ready</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* How It Works */}
          <section className="bg-zinc-950 py-24">
            <div className="container mx-auto px-4">
              <div className="mb-16 text-center">
                <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">How It Works</h2>
                <p className="mx-auto max-w-2xl text-zinc-400">
                  From choosing a model to executing complex tasks — in three steps.
                </p>
              </div>
              <div className="grid gap-8 md:grid-cols-3">
                {steps.map((step, index) => (
                  <div key={step.number} className="relative">
                    {index < steps.length - 1 && (
                      <div className="absolute right-0 top-12 hidden h-px w-full translate-x-1/2 bg-gradient-to-r from-blue-500/50 to-transparent md:block" />
                    )}
                    <div className="relative rounded-2xl border border-zinc-800 bg-black/50 p-8 text-center">
                      <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700">
                        <step.icon className="h-7 w-7 text-white" />
                      </div>
                      <div className="mb-2 text-sm font-bold text-blue-400">Step {step.number}</div>
                      <h3 className="mb-3 text-xl font-semibold">{step.title}</h3>
                      <p className="text-zinc-400 leading-relaxed">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <CtaSection
            icon="MessageSquare"
            headline="Start Chatting With Any AI Model"
            body="Download the desktop app and connect your preferred AI provider in minutes. Real-time streaming, tool execution, and reasoning traces included."
          />
        </main>

        <MarketingFooter />
      </div>
    </>
  );
}
