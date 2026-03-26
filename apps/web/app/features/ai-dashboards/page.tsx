import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight,
  LayoutDashboard,
  BarChart2,
  Activity,
  Bot,
  Database,
  Bell,
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
  title: 'AI Dashboards & Analytics | AGI Workforce',
  description:
    'Real-time AI dashboards with live agent monitoring, analytics, custom widgets, and data insights — all in the AGI Workforce desktop app.',
  keywords: [
    'AI dashboard',
    'agent monitoring',
    'real-time analytics',
    'AI analytics',
    'desktop AI dashboard',
    'AGI Workforce',
  ],
  alternates: { canonical: 'https://agiworkforce.com/features/ai-dashboards' },
  openGraph: {
    title: 'AI Dashboards & Analytics | AGI Workforce',
    description:
      'Real-time AI dashboards with live agent monitoring, analytics, and custom widgets.',
    url: 'https://agiworkforce.com/features/ai-dashboards',
    siteName: 'AGI Workforce',
    type: 'website',
    images: [
      { url: '/app-preview.png', width: 1200, height: 630, alt: 'AGI Workforce - AI Dashboards' },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Dashboards & Analytics | AGI Workforce',
    description: 'Real-time agent monitoring, analytics, and insights in a native desktop app.',
    images: ['/app-preview.png'],
    creator: '@agiworkforce',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'AI Dashboards - AGI Workforce',
  description:
    'Real-time AI dashboards with live agent monitoring, analytics, and custom insights widgets.',
  url: 'https://agiworkforce.com/features/ai-dashboards',
  isPartOf: {
    '@type': 'WebSite',
    '@id': 'https://agiworkforce.com/#website',
    name: 'AGI Workforce',
    url: 'https://agiworkforce.com',
  },
};

const capabilities = [
  {
    icon: Activity,
    title: 'Live Agent Monitoring',
    gradient: 'from-blue-500 to-blue-600',
    borderHover: 'hover:border-blue-500/50',
    iconColor: 'text-blue-400',
    bgGlow: 'bg-blue-500/10',
    features: [
      'Watch active agents execute tasks in real time',
      'Per-agent status, tool calls, and iteration count visible',
    ],
    tagline: 'Full visibility into every agent run',
  },
  {
    icon: BarChart2,
    title: 'Usage Analytics',
    gradient: 'from-emerald-500 to-green-600',
    borderHover: 'hover:border-emerald-500/50',
    iconColor: 'text-emerald-400',
    bgGlow: 'bg-emerald-500/10',
    features: [
      'Token consumption, cost breakdown, and request history',
      'Per-model and per-provider usage charts',
    ],
    tagline: "Know exactly what you're spending and why",
  },
  {
    icon: LayoutDashboard,
    title: 'Custom Widgets',
    gradient: 'from-purple-500 to-violet-600',
    borderHover: 'hover:border-purple-500/50',
    iconColor: 'text-purple-400',
    bgGlow: 'bg-purple-500/10',
    features: [
      'Drag-and-drop widget layout — tailor your workspace',
      'Data cards, status indicators, and quick-action panels',
    ],
    tagline: 'Build the dashboard you actually need',
  },
  {
    icon: Database,
    title: 'Data Insights',
    gradient: 'from-orange-500 to-amber-600',
    borderHover: 'hover:border-orange-500/50',
    iconColor: 'text-orange-400',
    bgGlow: 'bg-orange-500/10',
    features: [
      'AI-generated summaries of your activity and trends',
      'Structured output rendering: tables, charts, JSON',
    ],
    tagline: 'Turn raw data into actionable insights',
  },
  {
    icon: Bell,
    title: 'Alerts & Notifications',
    gradient: 'from-cyan-500 to-teal-600',
    borderHover: 'hover:border-cyan-500/50',
    iconColor: 'text-cyan-400',
    bgGlow: 'bg-cyan-500/10',
    features: [
      'Budget alerts, error notifications, and task completion events',
      'Desktop system notifications for background agent activity',
    ],
    tagline: 'Stay informed without watching the screen',
  },
  {
    icon: Bot,
    title: 'Mobile Agent Dashboard',
    gradient: 'from-pink-500 to-rose-600',
    borderHover: 'hover:border-pink-500/50',
    iconColor: 'text-pink-400',
    bgGlow: 'bg-pink-500/10',
    features: [
      'QR-pair your phone for live agent oversight on the go',
      'Approve or deny tool calls from your mobile device',
    ],
    tagline: 'Manage AI agents from anywhere',
  },
];

const safetyFeatures = [
  {
    icon: Shield,
    title: 'Read-Only by Default',
    description:
      'Dashboard widgets only read data — they cannot trigger actions without explicit user confirmation.',
  },
  {
    icon: CheckCircle2,
    title: 'Mobile Approval Gate',
    description:
      'Sensitive agent actions can require phone-based approval before execution, even when away from your desk.',
  },
  {
    icon: Settings,
    title: 'Role-Based Visibility',
    description:
      'Configure which widgets and data panels are visible — hide sensitive usage data from shared screens.',
  },
  {
    icon: Shield,
    title: 'Local Data Storage',
    description:
      'All dashboard data is stored locally in encrypted SQLite. Nothing synced to external servers without your consent.',
  },
];

const steps = [
  {
    number: '01',
    icon: LayoutDashboard,
    title: 'Open Your Dashboard',
    description:
      'Launch the dashboard to see all active agents, recent sessions, token usage, and system status at a glance.',
  },
  {
    number: '02',
    icon: Play,
    title: 'Monitor in Real Time',
    description:
      'Watch live agent activity, review tool execution timelines, and track performance metrics as tasks run.',
  },
  {
    number: '03',
    icon: Search,
    title: 'Act on Insights',
    description:
      'Approve pending actions, adjust budgets, review analytics trends, and optimize your AI workflow based on real data.',
  },
];

export default function AIDashboardsFeaturePage() {
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
                <LayoutDashboard className="mr-2 h-4 w-4" />
                Real-Time Dashboards
              </div>
              <h1 className="mx-auto max-w-4xl bg-gradient-to-b from-white to-white/50 bg-clip-text text-5xl font-bold tracking-tight text-transparent md:text-7xl lg:text-8xl">
                Full Visibility Into Every Agent
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400 md:text-xl">
                Real-time dashboards that show you exactly what your AI agents are doing — live
                monitoring, usage analytics, mobile oversight, and custom widgets.
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
                  <span>Live Agent Monitoring</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>Mobile Oversight</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <Shield className="h-4 w-4 text-emerald-500" />
                  <span>Custom Widgets</span>
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
                  See Everything, Control Anything
                </h2>
                <p className="mx-auto max-w-2xl text-zinc-400">
                  Six monitoring and analytics capabilities that give you complete oversight of your
                  AI workforce — from desktop and mobile.
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
                    Privacy & Control
                  </div>
                  <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                    Observe Without Interfering
                  </h2>
                  <p className="text-lg text-zinc-400">
                    Dashboards are read-only by default. You choose when to intervene, approve, or
                    adjust — the AI never acts without your awareness.
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
                        <Activity className="h-4 w-4" />
                        <span>Dashboard Live Feed</span>
                      </div>
                      <div className="h-px bg-white/10" />
                      <div className="flex justify-between">
                        <span>Active Agents</span>
                        <span className="text-white">3 running</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Token Usage Today</span>
                        <span className="text-white">124,820</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Pending Approvals</span>
                        <span className="text-amber-400">2 awaiting</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Tasks Completed</span>
                        <span className="text-emerald-400">47 today</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Mobile Sync</span>
                        <span className="text-emerald-400">Connected</span>
                      </div>
                      <div className="h-px bg-white/10" />
                      <div className="flex justify-between">
                        <span>Status</span>
                        <span className="text-emerald-400 font-semibold">All Systems Go</span>
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
                  From launching your dashboard to acting on insights — in three steps.
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
            icon="LayoutDashboard"
            headline="Monitor Your AI Workforce in Real Time"
            body="Download the desktop app and get full visibility into every agent, tool call, and token spent — from your desktop or mobile device."
          />
        </main>

        <MarketingFooter />
      </div>
    </>
  );
}
