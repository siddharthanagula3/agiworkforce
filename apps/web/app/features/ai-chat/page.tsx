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
  Search,
} from 'lucide-react';
import { EditorialPage } from '../../../components/marketing/editorial/EditorialPage';
import { DispatchSection } from '../../../components/marketing/editorial/DispatchSection';

export const metadata: Metadata = {
  title: 'Agentic AI Chat | AGI Workforce',
  description:
    'Multi-model AI chat with real-time tool execution, streaming responses, reasoning traces, and voice input - all in a native desktop interface.',
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

export default function AIChatFeaturePage() {
  return (
    <EditorialPage tier="paper">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="flex min-h-screen flex-col bg-[#09090b] text-[#edebe8]">
        <div className="flex-1 pt-24">
          {/* Hero */}
          <section className="relative py-20 md:py-32 lg:py-40">
            <div className="container relative mx-auto max-w-4xl px-4">
              <p className="mb-6 text-sm font-medium tracking-wide text-[#888480] uppercase">
                Agentic Chat
              </p>
              <h1 className="text-4xl font-bold tracking-tight md:text-6xl lg:text-7xl">
                One interface.{' '}
                <span className="text-[#c8892a]">{MARKETING.models.display} models.</span>
              </h1>
              <p className="mt-6 max-w-2xl text-lg text-[#888480] leading-relaxed md:text-xl">
                Claude Opus 4.6, GPT-5.4, Gemini 3.1 Pro, DeepSeek, Grok 4, and{' '}
                {MARKETING.providers.display} more providers. Streaming responses, inline tool
                execution across {MARKETING.tools.display} tools, and full reasoning traces - from a
                native desktop app that stays out of your way.
              </p>
              <div className="mt-10 flex items-center gap-4">
                <Link
                  href="/download"
                  className="inline-flex h-11 items-center justify-center rounded-md bg-[#c8892a] px-6 text-sm font-medium text-[#09090b] transition-colors hover:bg-[#d4993a]"
                >
                  Download
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
                <Link
                  href="#capabilities"
                  className="inline-flex h-11 items-center justify-center rounded-md border border-[#555150] px-6 text-sm font-medium text-[#edebe8] transition-colors hover:border-[#888480]"
                >
                  See below
                </Link>
              </div>
            </div>
          </section>

          {/* Primary capability - full width */}
          <section id="capabilities" className="border-t border-[#555150]/30 py-24">
            <div className="container mx-auto max-w-5xl px-4">
              <div className="grid gap-12 lg:grid-cols-5">
                <div className="lg:col-span-3">
                  <div className="flex items-center gap-2 text-[#c8892a]">
                    <Layers className="h-4 w-4" />
                    <span className="text-xs font-medium tracking-wide uppercase">
                      Multi-provider
                    </span>
                  </div>
                  <h2 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
                    Switch models mid-conversation
                  </h2>
                  <p className="mt-4 text-[#888480] leading-relaxed">
                    Start a chain-of-thought with Claude Opus, hand it to GPT-5.4 for code
                    generation, then ask Gemini 3.1 Pro for a second opinion - without losing
                    context. {MARKETING.providers.display} providers, one chat window. Your API
                    keys, stored locally with AES-GCM encryption. No middleman, no markup.
                  </p>
                </div>
                <div className="lg:col-span-2">
                  <div className="rounded-lg border border-[#555150]/40 bg-[#09090b] p-5 font-mono text-sm">
                    <div className="text-[#555150]"># model roster</div>
                    <div className="mt-2 space-y-1 text-[#888480]">
                      <div>
                        anthropic {'  '}
                        <span className="text-[#edebe8]">claude-opus-4-6</span>
                      </div>
                      <div>
                        openai {'     '}
                        <span className="text-[#edebe8]">gpt-5.4</span>
                      </div>
                      <div>
                        google {'     '}
                        <span className="text-[#edebe8]">gemini-3.1-pro</span>
                      </div>
                      <div>
                        xai {'        '}
                        <span className="text-[#edebe8]">grok-4</span>
                      </div>
                      <div>
                        deepseek {'   '}
                        <span className="text-[#edebe8]">deepseek-r2</span>
                      </div>
                      <div>
                        ollama {'     '}
                        <span className="text-[#edebe8]">llama-4-scout</span>
                      </div>
                    </div>
                    <div className="mt-3 text-[#555150]">
                      + {MARKETING.models.count - 6} more models
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Secondary features - asymmetric 2-col */}
          <section className="border-t border-[#555150]/30 py-24">
            <div className="container mx-auto max-w-5xl px-4">
              <div className="grid gap-8 md:grid-cols-2">
                {/* Streaming - tall card */}
                <div className="row-span-2 rounded-lg border border-[#555150]/40 p-8">
                  <Zap className="h-5 w-5 text-[#c8892a]" />
                  <h3 className="mt-4 text-xl font-semibold">Real-time streaming</h3>
                  <p className="mt-3 text-[#888480] leading-relaxed">
                    SSE streaming delivers tokens the instant they leave the model. No spinner, no
                    waiting for a full response. A live cursor tracks generation progress across
                    every provider.
                  </p>
                  <div className="mt-6 rounded-md border border-[#555150]/30 bg-[#09090b] p-4 font-mono text-xs text-[#888480]">
                    <div className="text-[#555150]">stream delta</div>
                    <div className="mt-1">
                      <span className="text-[#edebe8]">The derivative of</span>
                      <span className="inline-block h-3.5 w-1.5 animate-pulse bg-[#c8892a]" />
                    </div>
                  </div>
                </div>

                {/* Tool execution */}
                <div className="rounded-lg border border-[#555150]/40 p-8">
                  <MessageSquare className="h-5 w-5 text-[#c8892a]" />
                  <h3 className="mt-4 text-xl font-semibold">Inline tool execution</h3>
                  <p className="mt-3 text-[#888480] leading-relaxed">
                    Claude Code-style status labels - Read, Write, Bash, WebSearch - with a full
                    timeline showing duration, arguments, and result previews.
                  </p>
                </div>

                {/* Reasoning */}
                <div className="rounded-lg border border-[#555150]/40 p-8">
                  <Brain className="h-5 w-5 text-[#c8892a]" />
                  <h3 className="mt-4 text-xl font-semibold">Reasoning traces</h3>
                  <p className="mt-3 text-[#888480] leading-relaxed">
                    Extended thinking for multi-step problems. Collapsible reasoning blocks show
                    exactly how the model arrived at its answer.
                  </p>
                </div>
              </div>

              {/* Smaller feature row */}
              <div className="mt-8 grid gap-8 md:grid-cols-3">
                <div className="rounded-lg border border-[#555150]/40 p-6">
                  <Mic className="h-5 w-5 text-[#888480]" />
                  <h3 className="mt-3 text-base font-semibold">Voice input</h3>
                  <p className="mt-2 text-sm text-[#888480]">
                    Hold-to-record with Whisper transcription. Local or cloud.
                  </p>
                </div>
                <div className="rounded-lg border border-[#555150]/40 p-6">
                  <History className="h-5 w-5 text-[#888480]" />
                  <h3 className="mt-3 text-base font-semibold">Session history</h3>
                  <p className="mt-2 text-sm text-[#888480]">
                    Full-text search across conversations. Resume, rename, export.
                  </p>
                </div>
                <div className="rounded-lg border border-[#555150]/40 p-6">
                  <Search className="h-5 w-5 text-[#888480]" />
                  <h3 className="mt-3 text-base font-semibold">{MARKETING.tools.display} tools</h3>
                  <p className="mt-2 text-sm text-[#888480]">
                    File I/O, shell, web search, code analysis, and more - all sandboxed.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Chat transcript - monospace code block */}
          <section className="border-t border-[#555150]/30 py-24">
            <div className="container mx-auto max-w-3xl px-4">
              <h2 className="mb-8 text-2xl font-bold tracking-tight md:text-3xl">
                What a session looks like
              </h2>
              <div className="rounded-lg border border-[#555150]/40 bg-[#09090b] font-mono text-sm leading-relaxed">
                {/* Title bar */}
                <div className="flex items-center gap-2 border-b border-[#555150]/30 px-5 py-3">
                  <div className="h-2.5 w-2.5 rounded-full bg-[#555150]" />
                  <div className="h-2.5 w-2.5 rounded-full bg-[#555150]" />
                  <div className="h-2.5 w-2.5 rounded-full bg-[#555150]" />
                  <span className="ml-2 text-xs text-[#555150]">
                    AGI Workforce - claude-opus-4-6
                  </span>
                </div>
                <div className="space-y-5 p-5">
                  {/* User message */}
                  <div>
                    <span className="text-[#c8892a]">you</span>
                    <span className="ml-3 text-[#edebe8]">
                      Refactor the auth module to use Argon2id. Run the test suite when done.
                    </span>
                  </div>

                  {/* Tool executions */}
                  <div className="space-y-1 text-[#555150]">
                    <div>
                      <span className="text-[#888480]">Read</span> src/core/auth/mod.rs{' '}
                      <span className="text-[#555150]">248 lines</span>
                    </div>
                    <div>
                      <span className="text-[#888480]">Read</span> src/core/auth/password.rs{' '}
                      <span className="text-[#555150]">89 lines</span>
                    </div>
                    <div>
                      <span className="text-[#c8892a]">Write</span> src/core/auth/password.rs{' '}
                      <span className="text-[#555150]">+34 -12</span>
                    </div>
                    <div>
                      <span className="text-[#c8892a]">Write</span> src/core/auth/mod.rs{' '}
                      <span className="text-[#555150]">+8 -3</span>
                    </div>
                    <div>
                      <span className="text-[#888480]">Bash</span>{' '}
                      <span className="text-[#edebe8]">cargo test -p auth</span>{' '}
                      <span className="text-[#555150]">32 passed, 0 failed (1.4s)</span>
                    </div>
                  </div>

                  {/* Assistant reply */}
                  <div>
                    <span className="text-[#888480]">claude-opus-4-6</span>
                    <p className="mt-1 text-[#edebe8]">
                      Done. Replaced bcrypt with argon2id (OWASP-recommended params: m=19456, t=2,
                      p=1). Updated the hash-verification path in mod.rs to use the new
                      constant-time comparison. All 32 tests pass.
                    </p>
                  </div>

                  {/* Follow-up */}
                  <div>
                    <span className="text-[#c8892a]">you</span>
                    <span className="ml-3 text-[#edebe8]">
                      Switch to gpt-5.4 and review that diff for security issues.
                    </span>
                  </div>

                  <div className="space-y-1 text-[#555150]">
                    <div>
                      <span className="text-[#888480]">model</span>{' '}
                      <span className="text-[#edebe8]">switched to gpt-5.4</span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[#888480]">gpt-5.4</span>
                    <p className="mt-1 text-[#edebe8]">
                      The refactor looks correct. Two observations: (1) the memory cost parameter is
                      appropriate for a server-side context but consider raising it for desktop-only
                      use, (2) the old bcrypt fallback path should be removed after migration -
                      leaving it creates a downgrade vector.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Safety Section */}
          <section className="border-t border-[#555150]/30 py-24">
            <div className="container mx-auto max-w-5xl px-4">
              <div className="flex flex-col items-center gap-16 lg:flex-row">
                <div className="flex-1 space-y-8">
                  <div className="mb-2 inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-400">
                    <Shield className="mr-2 h-4 w-4" />
                    Privacy & Safety
                  </div>
                  <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                    Your Keys, Your Data
                  </h2>
                  <p className="text-lg text-[#888480]">
                    AGI Workforce never proxies your API calls or stores your conversations on our
                    servers. Everything stays on your device.
                  </p>
                  <div className="space-y-6">
                    {safetyFeatures.map((feature) => (
                      <div key={feature.title} className="flex gap-4">
                        <feature.icon className="h-6 w-6 shrink-0 text-emerald-500" />
                        <div>
                          <h3 className="mb-1 text-lg font-semibold">{feature.title}</h3>
                          <p className="text-[#888480]">{feature.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex-1">
                  <div className="relative rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-xs">
                    <div className="absolute inset-0 -z-10 bg-emerald-500/10 blur-3xl rounded-2xl" />
                    <div className="space-y-4 font-mono text-sm text-[#888480]">
                      <div className="flex items-center gap-2 text-emerald-400">
                        <MessageSquare className="h-4 w-4" />
                        <span>Active Chat Session</span>
                      </div>
                      <div className="h-px bg-white/10" />
                      <div className="flex justify-between">
                        <span>Model</span>
                        <span className="text-[#edebe8]">claude-sonnet-4-6</span>
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
                        <span className="text-[#edebe8]">8,432 / 10,000</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Tools Executed</span>
                        <span className="text-[#edebe8]">3 this session</span>
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

          <DispatchSection slugIndex="04" slugKicker="DISPATCH" />
        </div>
      </div>
    </EditorialPage>
  );
}
