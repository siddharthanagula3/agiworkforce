import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, Bot, Check, Clock, Eye, Smartphone, Terminal, Wrench } from 'lucide-react';
import { MARKETING } from '../../../lib/marketing-constants';
import { EditorialPage } from '../../../components/marketing/editorial/EditorialPage';
import { DispatchSection } from '../../../components/marketing/editorial/DispatchSection';

export const metadata: Metadata = {
  title: 'AI Agents & Parallel Orchestration | AGI Workforce',
  description:
    'Deploy autonomous AI agents that decompose complex tasks, work simultaneously in parallel, and aggregate results. Powered by an orchestration engine with mobile oversight.',
  keywords: [
    'AI agents',
    'parallel orchestration',
    'swarm intelligence',
    'autonomous agents',
    'multi-agent',
    'task decomposition',
    'agent spawning',
    'AI workforce',
    'desktop AI',
    'agent orchestration',
  ],
  openGraph: {
    title: 'AI Agents & Parallel Orchestration | AGI Workforce',
    description:
      'Deploy autonomous AI agents that decompose complex tasks, work simultaneously in parallel, and aggregate results. Swarm orchestration with mobile oversight.',
    type: 'website',
    url: 'https://agiworkforce.com/features/agents',
    images: [
      {
        url: '/app-preview.png',
        width: 1200,
        height: 630,
        alt: 'AGI Workforce - Parallel Agent Orchestration',
      },
    ],
  },
  alternates: {
    canonical: '/features/agents',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Agents & Parallel Orchestration | AGI Workforce',
    description:
      'Deploy autonomous AI agents that decompose complex tasks, work simultaneously in parallel, and aggregate results.',
    images: ['/app-preview.png'],
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'AI Agents & Parallel Orchestration',
  description:
    'Deploy autonomous AI agents that decompose complex tasks, work simultaneously in parallel, and aggregate results - powered by an orchestration engine.',
  url: 'https://agiworkforce.com/features/agents',
  mainEntity: {
    '@type': 'SoftwareApplication',
    name: 'AGI Workforce',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'macOS, Windows, Linux',
    featureList: [
      'Parallel sub-agent orchestration',
      'Autonomous task execution',
      'Swarm intelligence engine',
      'Task decomposition and aggregation',
      'Vision and screen understanding',
      'RAG and knowledge retrieval',
      'Mobile companion oversight',
      'MCP tool execution',
    ],
  },
};

const webPageJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'AI Agents - AGI Workforce',
  description: 'Autonomous AI agents that plan, execute, and iterate on complex tasks.',
  url: 'https://agiworkforce.com/features/agents',
  isPartOf: { '@type': 'WebSite', name: 'AGI Workforce', url: 'https://agiworkforce.com' },
};

export default function AgentsPage() {
  return (
    <EditorialPage tier="paper">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }}
      />
      <div className="flex min-h-screen flex-col bg-[#09090b] text-[#edebe8]">
        <div className="flex-1 pt-24">
          {/* Hero */}
          <section className="relative py-20 md:py-32 lg:py-40">
            <div className="container relative mx-auto px-4">
              <div className="mx-auto max-w-3xl">
                <p className="mb-6 text-sm font-medium tracking-widest uppercase text-[#c8892a]">
                  Parallel Agent Orchestration
                </p>
                <h1 className="text-4xl font-bold tracking-tight text-[#edebe8] md:text-6xl lg:text-7xl">
                  12 agents. 3 minutes.
                  <br />
                  <span className="text-[#888480]">Work that used to take hours.</span>
                </h1>
                <p className="mt-6 max-w-2xl text-lg text-[#888480]">
                  Decompose a task, spawn specialized agents in parallel, and merge the results.
                  Each agent gets its own tools, model, and context window. You get one unified
                  deliverable.
                </p>
                <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                  <Link
                    href="/download"
                    className="inline-flex h-12 items-center justify-center rounded-lg bg-[#c8892a] px-8 text-sm font-medium text-[#09090b] transition-colors hover:bg-[#d9a04a]"
                  >
                    Download Desktop App
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                  <Link
                    href="#trace"
                    className="inline-flex h-12 items-center justify-center rounded-lg border border-zinc-800 px-8 text-sm font-medium text-[#888480] transition-colors hover:border-zinc-700 hover:text-[#edebe8]"
                  >
                    See it run
                  </Link>
                </div>
              </div>
            </div>
          </section>

          {/* Agent Execution Trace */}
          <section id="trace" className="border-t border-zinc-800/60 py-24">
            <div className="container mx-auto px-4">
              <div className="mx-auto max-w-3xl">
                <div className="mb-8 flex items-center gap-3">
                  <Terminal className="h-5 w-5 text-[#c8892a]" />
                  <h2 className="text-sm font-medium tracking-widest uppercase text-[#888480]">
                    Execution Trace
                  </h2>
                </div>

                <div className="overflow-hidden rounded-lg border border-zinc-800 bg-black">
                  {/* Terminal chrome */}
                  <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
                    <div className="h-3 w-3 rounded-full bg-zinc-700" />
                    <div className="h-3 w-3 rounded-full bg-zinc-700" />
                    <div className="h-3 w-3 rounded-full bg-zinc-700" />
                    <span className="ml-3 text-xs text-[#555150]">agiworkforce --- agents</span>
                  </div>

                  <pre className="overflow-x-auto p-6 text-[13px] leading-relaxed">
                    <code>
                      <span className="text-[#555150]">$</span>{' '}
                      <span className="text-[#edebe8]">
                        &quot;Refactor the auth module, add tests, update the docs&quot;
                      </span>
                      {'\n\n'}
                      <span className="text-[#c8892a]">orchestrator</span>
                      <span className="text-[#555150]"> ── </span>
                      <span className="text-[#888480]">decomposed into 3 parallel tasks</span>
                      {'\n\n'}
                      <span className="text-[#555150]">
                        {'  '}agent/refactor{'  '}
                      </span>
                      <span className="text-emerald-500">spawned</span>
                      <span className="text-[#555150]"> ── </span>
                      <span className="text-[#888480]">
                        claude-4.6-opus{'  '}| tools: fs, terminal, git
                      </span>
                      {'\n'}
                      <span className="text-[#555150]">
                        {'  '}agent/tests{'     '}
                      </span>
                      <span className="text-emerald-500">spawned</span>
                      <span className="text-[#555150]"> ── </span>
                      <span className="text-[#888480]">
                        claude-4.6-sonnet | tools: fs, terminal, vitest
                      </span>
                      {'\n'}
                      <span className="text-[#555150]">
                        {'  '}agent/docs{'      '}
                      </span>
                      <span className="text-emerald-500">spawned</span>
                      <span className="text-[#555150]"> ── </span>
                      <span className="text-[#888480]">
                        gpt-5.4-mini{'     '}| tools: fs, markdown
                      </span>
                      {'\n\n'}
                      <span className="text-[#555150]">
                        {'  '}agent/refactor{'  '}
                      </span>
                      <span className="text-[#c8892a]">running</span>
                      <span className="text-[#555150]"> ── </span>
                      <span className="text-[#888480]">
                        extracted 4 services from monolith auth.ts
                      </span>
                      {'\n'}
                      <span className="text-[#555150]">
                        {'  '}agent/tests{'     '}
                      </span>
                      <span className="text-[#c8892a]">running</span>
                      <span className="text-[#555150]"> ── </span>
                      <span className="text-[#888480]">generated 47 test cases across 4 files</span>
                      {'\n'}
                      <span className="text-[#555150]">
                        {'  '}agent/docs{'      '}
                      </span>
                      <span className="text-[#c8892a]">running</span>
                      <span className="text-[#555150]"> ── </span>
                      <span className="text-[#888480]">
                        updated API reference + migration guide
                      </span>
                      {'\n\n'}
                      <span className="text-[#555150]">
                        {'  '}agent/refactor{'  '}
                      </span>
                      <span className="text-emerald-500">done</span>
                      <span className="text-[#555150]">
                        {'  '}2m 14s{'  '}12 files changed
                      </span>
                      {'\n'}
                      <span className="text-[#555150]">
                        {'  '}agent/tests{'     '}
                      </span>
                      <span className="text-emerald-500">done</span>
                      <span className="text-[#555150]">
                        {'  '}1m 48s{'  '}47/47 passing
                      </span>
                      {'\n'}
                      <span className="text-[#555150]">
                        {'  '}agent/docs{'      '}
                      </span>
                      <span className="text-emerald-500">done</span>
                      <span className="text-[#555150]">
                        {'  '}0m 52s{'  '}3 files updated
                      </span>
                      {'\n\n'}
                      <span className="text-[#c8892a]">orchestrator</span>
                      <span className="text-[#555150]"> ── </span>
                      <span className="text-[#888480]">merged results{'  '}</span>
                      <span className="text-emerald-500">complete</span>
                      <span className="text-[#555150]">
                        {'  '}3m 01s total (sequential est. 11m)
                      </span>
                    </code>
                  </pre>
                </div>

                <p className="mt-4 text-sm text-[#555150]">
                  Each agent picks its own model, tools, and execution strategy. The orchestrator
                  handles decomposition, dependency ordering, and result merging.
                </p>
              </div>
            </div>
          </section>

          {/* Capabilities --- asymmetric layout */}
          <section className="border-t border-zinc-800/60 py-24">
            <div className="container mx-auto px-4">
              <div className="mx-auto max-w-5xl">
                <h2 className="mb-4 text-2xl font-bold tracking-tight text-[#edebe8] md:text-3xl">
                  What agents can do
                </h2>
                <p className="mb-12 max-w-xl text-[#888480]">
                  Every agent in a parallel run has access to the full tool surface. These are not
                  chat wrappers.
                </p>

                <div className="grid gap-px overflow-hidden rounded-lg border border-zinc-800 bg-zinc-800 md:grid-cols-2">
                  {[
                    {
                      icon: Bot,
                      name: 'Autonomous mode',
                      detail:
                        'Set a goal and walk away. Agents plan, execute, and self-correct without intervention.',
                    },
                    {
                      icon: Clock,
                      name: 'Background agents',
                      detail:
                        'Long-running tasks continue in the background. Desktop notifications on completion.',
                    },
                    {
                      icon: Eye,
                      name: 'Vision + screen understanding',
                      detail:
                        'Agents see your screen, read rendered UI, and interact with visual elements.',
                    },
                    {
                      icon: Wrench,
                      name: `${MARKETING.tools.display} IPC tools`,
                      detail:
                        'File system, terminal, git, browser, databases, MCP servers, and every Tauri command.',
                    },
                  ].map((cap) => (
                    <div key={cap.name} className="bg-[#09090b] p-8">
                      <cap.icon className="mb-4 h-5 w-5 text-[#c8892a]" />
                      <h3 className="mb-2 text-base font-semibold text-[#edebe8]">{cap.name}</h3>
                      <p className="text-sm leading-relaxed text-[#888480]">{cap.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Mobile Companion --- asymmetric two-column */}
          <section className="border-t border-zinc-800/60 py-24">
            <div className="container mx-auto px-4">
              <div className="relative mx-auto max-w-5xl overflow-hidden rounded-xl border border-zinc-800 bg-black p-8 md:p-16">
                <div className="flex flex-col items-center gap-12 md:flex-row">
                  <div className="flex-1 space-y-6">
                    <div className="inline-flex items-center gap-2 text-sm font-medium text-[#c8892a]">
                      <Smartphone className="h-4 w-4" />
                      Mobile Companion
                    </div>
                    <h2 className="text-3xl font-bold tracking-tight text-[#edebe8] md:text-4xl">
                      Monitor and control agents from your phone
                    </h2>
                    <p className="text-lg text-[#888480]">
                      QR-pair with your desktop, view a real-time agent dashboard, and approve or
                      deny every tool call - all from your phone.
                    </p>
                    <p className="text-sm text-[#c8892a]">
                      Cross-provider session continuity and real-time mobile oversight, in one
                      unified platform.
                    </p>

                    <div className="space-y-3 pt-2">
                      {[
                        'QR code pairing with desktop in seconds',
                        'Real-time agent status and progress tracking',
                        'Per-tool-call approve/deny controls',
                        'Push notifications for agent milestones',
                      ].map((item) => (
                        <div key={item} className="flex items-center gap-3 text-sm text-[#edebe8]">
                          <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Phone mockup */}
                  <div className="shrink-0" aria-hidden="true">
                    <div className="relative h-[480px] w-[240px] rounded-[2.5rem] border-2 border-zinc-700 bg-zinc-900/80 p-3 shadow-2xl">
                      <div className="absolute left-1/2 top-4 h-6 w-20 -translate-x-1/2 rounded-full bg-black" />
                      <div className="flex h-full flex-col items-center justify-center rounded-[2rem] border border-zinc-800 bg-black/60 p-4">
                        <Bot className="mb-4 h-12 w-12 text-[#c8892a]" />
                        <div className="mb-2 text-center text-sm font-semibold text-[#edebe8]">
                          Agent Dashboard
                        </div>
                        <div className="w-full space-y-2">
                          <div className="flex items-center justify-between rounded-lg bg-zinc-800/50 px-3 py-2 text-xs">
                            <span className="text-[#888480]">Research Agent</span>
                            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-emerald-400">
                              Running
                            </span>
                          </div>
                          <div className="flex items-center justify-between rounded-lg bg-zinc-800/50 px-3 py-2 text-xs">
                            <span className="text-[#888480]">Code Agent</span>
                            <span className="rounded-full bg-[#c8892a]/20 px-2 py-0.5 text-[#c8892a]">
                              Waiting
                            </span>
                          </div>
                          <div className="flex items-center justify-between rounded-lg bg-zinc-800/50 px-3 py-2 text-xs">
                            <span className="text-[#888480]">Writer Agent</span>
                            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-emerald-400">
                              Running
                            </span>
                          </div>
                        </div>
                        <div className="mt-4 flex w-full gap-2">
                          <div className="flex-1 rounded-lg bg-emerald-600/80 py-1.5 text-center text-xs font-medium text-white">
                            Approve
                          </div>
                          <div className="flex-1 rounded-lg bg-red-600/80 py-1.5 text-center text-xs font-medium text-white">
                            Deny
                          </div>
                        </div>
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
