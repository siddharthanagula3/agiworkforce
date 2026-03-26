import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight,
  Bot,
  BookOpen,
  Brain,
  Check,
  ChevronRight,
  Clock,
  Eye,
  GitMerge,
  Layers,
  Smartphone,
  Users,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { Header } from '../../../components/layout/Header';
import { CtaSection } from '../../../components/marketing/CtaSection';
import { MarketingFooter } from '../../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'AI Agents & Parallel Orchestration | AGI Workforce',
  description:
    'Deploy autonomous AI agents that decompose complex tasks, work simultaneously in parallel, and aggregate results. Powered by a proprietary swarm orchestration engine with mobile oversight.',
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
        alt: 'AGI Workforce — Parallel Agent Orchestration',
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
    'Deploy autonomous AI agents that decompose complex tasks, work simultaneously in parallel, and aggregate results — powered by a proprietary swarm orchestration engine.',
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

const orchestrationSteps = [
  {
    icon: Layers,
    title: 'Task Decomposition',
    description: 'Complex tasks are broken into independent sub-tasks',
    detail: 'The orchestrator analyzes your request and identifies parallelizable work units.',
  },
  {
    icon: Users,
    title: 'Agent Spawning',
    description: 'Specialized agents are assigned to each sub-task',
    detail: 'Each agent is configured with the right tools, context, and model for its job.',
  },
  {
    icon: Zap,
    title: 'Parallel Execution',
    description: 'Agents work simultaneously, not sequentially',
    detail: 'All sub-agents execute concurrently, reducing total completion time dramatically.',
  },
  {
    icon: GitMerge,
    title: 'Result Aggregation',
    description: 'Results are combined into a unified deliverable',
    detail: 'Outputs from all agents are merged, deduplicated, and presented as one result.',
  },
];

const capabilities = [
  {
    icon: Bot,
    title: 'Autonomous Mode',
    description:
      'Agents plan, execute, and iterate without human intervention. Set goals and let them work.',
    highlight: 'Set a goal, walk away',
  },
  {
    icon: Clock,
    title: 'Background Agents',
    description: 'Long-running agents that work in the background while you focus on other things.',
    highlight: 'Always working for you',
  },
  {
    icon: Eye,
    title: 'Vision & Screen Understanding',
    description: 'Agents that can see your screen, read text, and interact with visual elements.',
    highlight: 'See what you see',
  },
  {
    icon: BookOpen,
    title: 'RAG & Knowledge',
    description:
      'Agents with retrieval-augmented generation for accessing project context and documents.',
    highlight: 'Context-aware intelligence',
  },
  {
    icon: Brain,
    title: 'Planning & Reasoning',
    description: 'Multi-step planning with reflection and self-correction capabilities.',
    highlight: 'Think before acting',
  },
  {
    icon: Wrench,
    title: 'Tool Execution',
    description: 'Agents use any MCP tool: browser, terminal, files, databases, APIs.',
    highlight: 'Unlimited MCP tools',
  },
];

interface ComparisonRow {
  feature: string;
  agiWorkforce: boolean;
  claudeDesktop: boolean;
  chatGpt: boolean;
  cursor: boolean;
}

const comparisonData: ComparisonRow[] = [
  {
    feature: 'Parallel sub-agents',
    agiWorkforce: true,
    claudeDesktop: false,
    chatGpt: false,
    cursor: false,
  },
  {
    feature: 'Swarm orchestration',
    agiWorkforce: true,
    claudeDesktop: false,
    chatGpt: false,
    cursor: false,
  },
  {
    feature: 'Autonomous mode',
    agiWorkforce: true,
    claudeDesktop: true,
    chatGpt: false,
    cursor: false,
  },
  {
    feature: 'Mobile agent oversight',
    agiWorkforce: true,
    claudeDesktop: false,
    chatGpt: false,
    cursor: false,
  },
  {
    feature: 'Multi-model support',
    agiWorkforce: true,
    claudeDesktop: false,
    chatGpt: false,
    cursor: true,
  },
  {
    feature: 'Desktop automation',
    agiWorkforce: true,
    claudeDesktop: true,
    chatGpt: false,
    cursor: false,
  },
  {
    feature: 'Non-coding AI skills',
    agiWorkforce: true,
    claudeDesktop: false,
    chatGpt: false,
    cursor: false,
  },
];

function ComparisonCell({ supported }: { supported: boolean }) {
  return supported ? (
    <Check className="mx-auto h-5 w-5 text-emerald-500" />
  ) : (
    <X className="mx-auto h-5 w-5 text-zinc-600" />
  );
}

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
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }}
      />
      <div className="flex min-h-screen flex-col bg-black text-white">
        <Header />

        <main className="flex-1 pt-24">
          {/* Hero Section */}
          <section className="relative overflow-hidden py-20 md:py-32 lg:py-40">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-black to-black" />
            <div className="container relative mx-auto px-4 text-center">
              <div className="mb-8 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-blue-400 backdrop-blur-xs">
                <span className="mr-2 flex h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                Swarm Orchestration Engine
              </div>
              <h1 className="mx-auto max-w-5xl bg-gradient-to-b from-white to-white/50 bg-clip-text text-5xl font-bold tracking-tight text-transparent md:text-7xl lg:text-8xl">
                AI Agents That Work in Parallel
              </h1>
              <p className="mx-auto mt-6 max-w-3xl text-lg text-zinc-400 md:text-xl">
                Deploy autonomous agents that decompose complex tasks, work simultaneously, and
                aggregate results — powered by a proprietary swarm orchestration engine.
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
                  href="#how-it-works"
                  className="inline-flex h-12 items-center justify-center rounded-full border border-zinc-800 bg-black px-8 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white"
                >
                  How It Works
                </Link>
              </div>

              <div className="mt-12 flex flex-col items-center gap-4 md:flex-row md:justify-center">
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <Zap className="h-4 w-4 text-blue-500" />
                  <span>Parallel Execution</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <Bot className="h-4 w-4 text-blue-500" />
                  <span>Autonomous Mode</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <Eye className="h-4 w-4 text-blue-500" />
                  <span>Vision + RAG</span>
                </div>
              </div>
            </div>
          </section>

          {/* How Swarm Orchestration Works */}
          <section id="how-it-works" className="bg-zinc-950 py-24">
            <div className="container mx-auto px-4">
              <div className="mb-16 text-center">
                <div className="mb-4 inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-sm text-blue-400">
                  <Layers className="mr-2 h-4 w-4" />
                  Orchestration Pipeline
                </div>
                <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">
                  How Swarm Orchestration Works
                </h2>
                <p className="mx-auto max-w-2xl text-zinc-400">
                  A four-stage pipeline that transforms complex requests into parallel agent
                  workflows, completing work in a fraction of the time.
                </p>
              </div>

              <div className="relative grid gap-6 md:grid-cols-4">
                {orchestrationSteps.map((step, index) => (
                  <div key={step.title} className="relative flex flex-col items-center text-center">
                    {/* Connector arrow (hidden on mobile, shown between steps on desktop) */}
                    {index < orchestrationSteps.length - 1 && (
                      <div className="absolute right-0 top-12 z-10 hidden translate-x-1/2 md:block">
                        <ChevronRight className="h-6 w-6 text-blue-500/50" />
                      </div>
                    )}

                    {/* Step number */}
                    <div className="mb-4 flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/20 text-sm font-bold text-blue-400">
                      {index + 1}
                    </div>

                    {/* Icon */}
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-zinc-800 bg-black">
                      <step.icon className="h-8 w-8 text-blue-500" />
                    </div>

                    {/* Content */}
                    <h3 className="mb-2 text-lg font-semibold">{step.title}</h3>
                    <p className="mb-2 text-sm text-zinc-400">{step.description}</p>
                    <p className="text-xs text-zinc-600">{step.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Agent Capabilities */}
          <section className="bg-black py-24">
            <div className="container mx-auto px-4">
              <div className="mb-16 text-center">
                <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">
                  Agent Capabilities
                </h2>
                <p className="mx-auto max-w-2xl text-zinc-400">
                  Every agent in your workforce comes equipped with powerful capabilities that go
                  far beyond simple chat.
                </p>
              </div>

              <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                {capabilities.map((capability) => (
                  <div
                    key={capability.title}
                    className="group rounded-2xl border border-zinc-800 bg-black/50 p-8 transition-all hover:scale-105 hover:border-blue-500/50"
                  >
                    <capability.icon className="mb-4 h-10 w-10 text-blue-500" />
                    <div className="mb-2 inline-block rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400">
                      {capability.highlight}
                    </div>
                    <h3 className="mb-2 text-xl font-semibold">{capability.title}</h3>
                    <p className="leading-relaxed text-zinc-400">{capability.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Mobile Companion */}
          <section className="bg-zinc-950 py-24">
            <div className="container mx-auto px-4">
              <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-blue-900/20 via-black to-black p-8 md:p-16">
                <div className="absolute inset-0 -z-10 bg-blue-500/5 blur-3xl" />

                <div className="flex flex-col items-center gap-12 md:flex-row">
                  <div className="flex-1 space-y-6">
                    <div className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-sm text-blue-400">
                      <Smartphone className="mr-2 h-4 w-4" />
                      Mobile Companion App
                    </div>
                    <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                      Monitor and Control Agents from Your Phone
                    </h2>
                    <p className="text-lg text-zinc-400">
                      QR-pair with your desktop, view a real-time agent dashboard, and approve or
                      deny every tool call — all from your phone.
                    </p>
                    <p className="text-sm font-medium text-blue-400">
                      The only AI platform with a dedicated mobile companion app for agent
                      oversight.
                    </p>

                    <div className="space-y-3">
                      <div className="flex items-center gap-3 text-sm text-zinc-300">
                        <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                        <span>QR code pairing with desktop in seconds</span>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-zinc-300">
                        <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                        <span>Real-time agent status and progress tracking</span>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-zinc-300">
                        <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                        <span>Per-tool-call approve/deny controls</span>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-zinc-300">
                        <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                        <span>Push notifications for agent milestones</span>
                      </div>
                    </div>
                  </div>

                  {/* Phone mockup placeholder */}
                  <div className="shrink-0" aria-hidden="true">
                    <div className="relative h-[480px] w-[240px] rounded-[2.5rem] border-2 border-zinc-700 bg-zinc-900/80 p-3 shadow-2xl backdrop-blur-sm">
                      <div className="absolute left-1/2 top-4 h-6 w-20 -translate-x-1/2 rounded-full bg-black" />
                      <div className="flex h-full flex-col items-center justify-center rounded-[2rem] border border-zinc-800 bg-black/60 p-4">
                        <Bot className="mb-4 h-12 w-12 text-blue-500" />
                        <div className="mb-2 text-center text-sm font-semibold">
                          Agent Dashboard
                        </div>
                        <div className="w-full space-y-2">
                          <div className="flex items-center justify-between rounded-lg bg-zinc-800/50 px-3 py-2 text-xs">
                            <span className="text-zinc-400">Research Agent</span>
                            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-emerald-400">
                              Running
                            </span>
                          </div>
                          <div className="flex items-center justify-between rounded-lg bg-zinc-800/50 px-3 py-2 text-xs">
                            <span className="text-zinc-400">Code Agent</span>
                            <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-blue-400">
                              Waiting
                            </span>
                          </div>
                          <div className="flex items-center justify-between rounded-lg bg-zinc-800/50 px-3 py-2 text-xs">
                            <span className="text-zinc-400">Writer Agent</span>
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

          {/* Comparison Section */}
          <section className="bg-black py-24">
            <div className="container mx-auto px-4">
              <div className="mb-16 text-center">
                <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">
                  Beyond Single-Agent AI
                </h2>
                <p className="mx-auto max-w-2xl text-zinc-400">
                  Most AI tools run one agent at a time. AGI Workforce is the only platform with
                  parallel sub-agent orchestration and mobile oversight.
                </p>
              </div>

              <div className="mx-auto max-w-4xl overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="px-4 py-4 text-left font-medium text-zinc-400">Feature</th>
                      <th className="px-4 py-4 text-center font-semibold text-blue-400">
                        AGI Workforce
                      </th>
                      <th className="px-4 py-4 text-center font-medium text-zinc-400">
                        Claude Desktop
                      </th>
                      <th className="px-4 py-4 text-center font-medium text-zinc-400">ChatGPT</th>
                      <th className="px-4 py-4 text-center font-medium text-zinc-400">Cursor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonData.map((row) => (
                      <tr key={row.feature} className="border-b border-zinc-800/50">
                        <td className="px-4 py-4 text-zinc-300">{row.feature}</td>
                        <td className="px-4 py-4">
                          <ComparisonCell supported={row.agiWorkforce} />
                        </td>
                        <td className="px-4 py-4">
                          <ComparisonCell supported={row.claudeDesktop} />
                        </td>
                        <td className="px-4 py-4">
                          <ComparisonCell supported={row.chatGpt} />
                        </td>
                        <td className="px-4 py-4">
                          <ComparisonCell supported={row.cursor} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <CtaSection
            icon="Bot"
            headline="Deploy Your AI Workforce"
            body="Stop running one agent at a time. Launch a parallel workforce that decomposes, executes, and delivers — all from your desktop."
          />
        </main>

        <MarketingFooter />
      </div>
    </>
  );
}
