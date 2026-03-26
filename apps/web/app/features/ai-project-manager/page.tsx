import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight,
  KanbanSquare,
  ClipboardList,
  GitBranch,
  Calendar,
  Users,
  BarChart2,
  Shield,
  CheckCircle2,
  Zap,
  Play,
  Search,
  Settings,
} from 'lucide-react';
import { Header } from '../../../components/layout/Header';
import { CtaSection } from '../../../components/marketing/CtaSection';
import { MarketingFooter } from '../../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'AI Project Manager | AGI Workforce',
  description:
    'AI-powered project management with intelligent task planning, parallel agent workflows, scheduling, and progress tracking — all in the AGI Workforce desktop app.',
  keywords: [
    'AI project manager',
    'AI task planning',
    'agent workflows',
    'AI scheduling',
    'project automation',
    'kanban AI',
    'AGI Workforce',
  ],
  alternates: { canonical: 'https://agiworkforce.com/features/ai-project-manager' },
  openGraph: {
    title: 'AI Project Manager | AGI Workforce',
    description:
      'AI-powered project management with intelligent task planning, agent workflows, and scheduling.',
    url: 'https://agiworkforce.com/features/ai-project-manager',
    siteName: 'AGI Workforce',
    type: 'website',
    images: [
      {
        url: '/app-preview.png',
        width: 1200,
        height: 630,
        alt: 'AGI Workforce - AI Project Manager',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Project Manager | AGI Workforce',
    description: 'AI task planning, parallel agent workflows, and scheduling in a desktop app.',
    images: ['/app-preview.png'],
    creator: '@agiworkforce',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'AI Project Manager - AGI Workforce',
  description:
    'AI-powered project management with intelligent task planning, parallel agent workflows, and scheduling.',
  url: 'https://agiworkforce.com/features/ai-project-manager',
  isPartOf: {
    '@type': 'WebSite',
    '@id': 'https://agiworkforce.com/#website',
    name: 'AGI Workforce',
    url: 'https://agiworkforce.com',
  },
};

const capabilities = [
  {
    icon: ClipboardList,
    title: 'Intelligent Task Planning',
    gradient: 'from-blue-500 to-blue-600',
    borderHover: 'hover:border-blue-500/50',
    iconColor: 'text-blue-400',
    bgGlow: 'bg-blue-500/10',
    features: [
      'Describe a goal — AI decomposes it into subtasks automatically',
      'Dependency detection, priority scoring, and timeline estimation',
    ],
    tagline: 'Turn a goal into an actionable plan instantly',
  },
  {
    icon: GitBranch,
    title: 'Parallel Agent Workflows',
    gradient: 'from-emerald-500 to-green-600',
    borderHover: 'hover:border-emerald-500/50',
    iconColor: 'text-emerald-400',
    bgGlow: 'bg-emerald-500/10',
    features: [
      'Spawn multiple agents to work on independent subtasks simultaneously',
      'Swarm orchestration aggregates results into a unified output',
    ],
    tagline: 'Complete in hours what would take days sequentially',
  },
  {
    icon: KanbanSquare,
    title: 'Kanban Board View',
    gradient: 'from-purple-500 to-violet-600',
    borderHover: 'hover:border-purple-500/50',
    iconColor: 'text-purple-400',
    bgGlow: 'bg-purple-500/10',
    features: [
      'Drag-and-drop task management with AI-assigned columns',
      'Status updates flow automatically as agents complete work',
    ],
    tagline: 'Your tasks, organized by AI',
  },
  {
    icon: Calendar,
    title: 'Smart Scheduling',
    gradient: 'from-orange-500 to-amber-600',
    borderHover: 'hover:border-orange-500/50',
    iconColor: 'text-orange-400',
    bgGlow: 'bg-orange-500/10',
    features: [
      'NLP-based scheduling: "remind me every Monday at 9am"',
      'Cron-style recurring tasks with natural language syntax',
    ],
    tagline: 'Schedule tasks the way you think about them',
  },
  {
    icon: BarChart2,
    title: 'Progress Tracking',
    gradient: 'from-cyan-500 to-teal-600',
    borderHover: 'hover:border-cyan-500/50',
    iconColor: 'text-cyan-400',
    bgGlow: 'bg-cyan-500/10',
    features: [
      'Real-time task completion rates and agent performance metrics',
      'Timeline view with milestone tracking and blockers highlighted',
    ],
    tagline: 'Always know where your project stands',
  },
  {
    icon: Users,
    title: 'Team Coordination',
    gradient: 'from-pink-500 to-rose-600',
    borderHover: 'hover:border-pink-500/50',
    iconColor: 'text-pink-400',
    bgGlow: 'bg-pink-500/10',
    features: [
      'Assign tasks to human team members or AI agents interchangeably',
      'Shared workspace with role-based access and audit trail',
    ],
    tagline: 'Humans and AI working side by side',
  },
];

const safetyFeatures = [
  {
    icon: Shield,
    title: 'Checkpoint Resume',
    description:
      'Autonomous task runs are checkpointed. If an agent fails mid-task, it resumes from the last checkpoint — no work lost.',
  },
  {
    icon: CheckCircle2,
    title: 'Budget Per Task',
    description:
      'Set token and iteration budgets per task or project. Agents stop when limits are reached and report back.',
  },
  {
    icon: Settings,
    title: 'Approval Gates',
    description:
      'Insert human approval checkpoints at any stage of an automated workflow before the next step proceeds.',
  },
  {
    icon: Shield,
    title: 'Audit Trail',
    description:
      'Every task, agent action, and result is logged with timestamps for full accountability and review.',
  },
];

const steps = [
  {
    number: '01',
    icon: ClipboardList,
    title: 'Define Your Project',
    description:
      'Describe your project goal in plain language. The AI breaks it down into a structured task list with priorities and dependencies.',
  },
  {
    number: '02',
    icon: Play,
    title: 'Agents Execute in Parallel',
    description:
      'Assign tasks to AI agents or team members. Multiple agents work simultaneously, reporting progress in real time.',
  },
  {
    number: '03',
    icon: Search,
    title: 'Review & Ship',
    description:
      'Review completed work, approve outputs, track milestones, and iterate until your project is done.',
  },
];

export default function AIProjectManagerFeaturePage() {
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
                <KanbanSquare className="mr-2 h-4 w-4" />
                AI Project Manager
              </div>
              <h1 className="mx-auto max-w-4xl bg-gradient-to-b from-white to-white/50 bg-clip-text text-5xl font-bold tracking-tight text-transparent md:text-7xl lg:text-8xl">
                Projects That Run Themselves
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400 md:text-xl">
                AI-powered project management that decomposes goals, spawns parallel agents, tracks
                progress, and delivers results — with you staying in control.
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
                  <span>Parallel Agent Execution</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>NLP Scheduling</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <Shield className="h-4 w-4 text-emerald-500" />
                  <span>Full Audit Trail</span>
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
                  Project Management Reimagined for AI
                </h2>
                <p className="mx-auto max-w-2xl text-zinc-400">
                  Six capabilities that transform how you plan, delegate, and ship — with AI agents
                  as first-class team members.
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
                    Reliability & Control
                  </div>
                  <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                    Autonomous, With Guardrails
                  </h2>
                  <p className="text-lg text-zinc-400">
                    AI agents work autonomously, but you always have override control. Budgets,
                    approval gates, and checkpoints keep every project on track.
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
                        <KanbanSquare className="h-4 w-4" />
                        <span>Active Project: Q1 Launch</span>
                      </div>
                      <div className="h-px bg-white/10" />
                      <div className="flex justify-between">
                        <span>Total Tasks</span>
                        <span className="text-white">24</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Completed</span>
                        <span className="text-emerald-400">18 done</span>
                      </div>
                      <div className="flex justify-between">
                        <span>In Progress</span>
                        <span className="text-amber-400">4 running</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Agents Active</span>
                        <span className="text-white">3 agents</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Budget Used</span>
                        <span className="text-white">62%</span>
                      </div>
                      <div className="h-px bg-white/10" />
                      <div className="flex justify-between">
                        <span>Status</span>
                        <span className="text-emerald-400 font-semibold">On Track</span>
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
                  From project goal to completed deliverable — in three steps.
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
            icon="KanbanSquare"
            headline="Manage Projects With AI Agents"
            body="Download the desktop app and let AI decompose, delegate, and deliver your next project. Parallel agents, smart scheduling, and full oversight included."
          />
        </main>

        <MarketingFooter />
      </div>
    </>
  );
}
