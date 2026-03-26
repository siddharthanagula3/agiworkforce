import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight,
  Globe,
  Terminal,
  FolderOpen,
  Eye,
  Monitor,
  Keyboard,
  Shield,
  CheckCircle2,
  Zap,
  RotateCcw,
  DollarSign,
  MessageSquare,
  Play,
  Search,
} from 'lucide-react';
import { Header } from '../../../components/layout/Header';
import { CtaSection } from '../../../components/marketing/CtaSection';
import { MarketingFooter } from '../../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Desktop Tools & Computer Use | AGI Workforce',
  description:
    'Native desktop automation that sees your screen, controls your keyboard, manages your files, and runs terminal commands — all with safety controls. Browser automation, computer use, file management, and more.',
  keywords: [
    'desktop automation',
    'computer use',
    'browser automation',
    'screen capture',
    'terminal automation',
    'file management',
    'AI desktop agent',
    'keyboard automation',
    'Tauri desktop app',
    'AGI Workforce',
  ],
  alternates: {
    canonical: 'https://agiworkforce.com/features/tools',
  },
  openGraph: {
    title: 'Desktop Tools & Computer Use | AGI Workforce',
    description:
      'Native desktop automation that sees your screen, controls your keyboard, manages your files, and runs terminal commands — all with safety controls.',
    url: 'https://agiworkforce.com/features/tools',
    siteName: 'AGI Workforce',
    type: 'website',
    images: [
      {
        url: '/app-preview.png',
        width: 1200,
        height: 630,
        alt: 'AGI Workforce - Desktop Tools & Computer Use',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Desktop Tools & Computer Use | AGI Workforce',
    description:
      'Native desktop automation: browser control, terminal, file management, screen capture, computer use — with full safety controls.',
    images: ['/app-preview.png'],
    creator: '@agiworkforce',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Desktop Tools & Computer Use - AGI Workforce',
  description:
    'Native desktop automation that sees your screen, controls your keyboard, manages your files, and runs terminal commands — all with safety controls.',
  url: 'https://agiworkforce.com/features/tools',
  isPartOf: {
    '@type': 'WebSite',
    '@id': 'https://agiworkforce.com/#website',
    name: 'AGI Workforce',
    url: 'https://agiworkforce.com',
  },
  mainEntity: {
    '@type': 'SoftwareApplication',
    name: 'AGI Workforce Desktop',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'macOS, Windows, Linux',
    featureList: [
      'Browser automation with Playwright',
      'Terminal and shell execution',
      'File system management',
      'Screen capture and OCR',
      'Full computer use (mouse and keyboard)',
      'Keyboard and input simulation',
      'ToolGuard safety validation',
      'Approval flows for sensitive operations',
    ],
  },
};

const capabilities = [
  {
    icon: Globe,
    title: 'Browser Automation',
    gradient: 'from-blue-500 to-blue-600',
    borderHover: 'hover:border-blue-500/50',
    iconColor: 'text-blue-400',
    bgGlow: 'bg-blue-500/10',
    features: [
      'Navigate websites, click elements, fill forms, extract data',
      'Playwright-powered DOM operations',
    ],
    tagline: 'Works with any website — no API needed',
  },
  {
    icon: Terminal,
    title: 'Terminal & Shell',
    gradient: 'from-emerald-500 to-green-600',
    borderHover: 'hover:border-emerald-500/50',
    iconColor: 'text-emerald-400',
    bgGlow: 'bg-emerald-500/10',
    features: [
      'Execute commands, manage processes, install packages',
      'Full shell access with safety sandboxing',
    ],
    tagline: 'Run any command your terminal can',
  },
  {
    icon: FolderOpen,
    title: 'File Management',
    gradient: 'from-purple-500 to-violet-600',
    borderHover: 'hover:border-purple-500/50',
    iconColor: 'text-purple-400',
    bgGlow: 'bg-purple-500/10',
    features: [
      'Read, write, search, organize files and directories',
      'Bulk operations with undo support',
    ],
    tagline: 'Manage your entire file system naturally',
  },
  {
    icon: Eye,
    title: 'Screen Capture & Vision',
    gradient: 'from-orange-500 to-amber-600',
    borderHover: 'hover:border-orange-500/50',
    iconColor: 'text-orange-400',
    bgGlow: 'bg-orange-500/10',
    features: [
      'OCR text extraction, screenshot analysis',
      'Visual element detection and interaction',
    ],
    tagline: 'AI that can see and understand your screen',
  },
  {
    icon: Monitor,
    title: 'Computer Use',
    gradient: 'from-cyan-500 to-teal-600',
    borderHover: 'hover:border-cyan-500/50',
    iconColor: 'text-cyan-400',
    bgGlow: 'bg-cyan-500/10',
    features: [
      'Observe-Plan-Act loop for autonomous desktop control',
      'Mouse and keyboard simulation',
    ],
    tagline: 'Full computer use — like having a second pair of hands',
  },
  {
    icon: Keyboard,
    title: 'Keyboard & Input',
    gradient: 'from-pink-500 to-rose-600',
    borderHover: 'hover:border-pink-500/50',
    iconColor: 'text-pink-400',
    bgGlow: 'bg-pink-500/10',
    features: ['Type text, execute hotkeys, simulate input', 'Clipboard management'],
    tagline: 'Automate any repetitive input task',
  },
];

const safetyFeatures = [
  {
    icon: Shield,
    title: 'ToolGuard Validation',
    description:
      'Every tool execution is validated through ToolGuard before running — ensuring no unauthorized actions reach your system.',
  },
  {
    icon: CheckCircle2,
    title: 'Approval Flows',
    description:
      'Sensitive operations require explicit approval. Review what the AI wants to do before it acts.',
  },
  {
    icon: RotateCcw,
    title: 'Undo Support',
    description:
      'Reversible actions come with full undo support. Experiment freely knowing you can always roll back.',
  },
  {
    icon: DollarSign,
    title: 'Budget Controls',
    description:
      'Set token and iteration budgets for autonomous loops. The AI stops when limits are reached.',
  },
];

const steps = [
  {
    number: '01',
    icon: MessageSquare,
    title: 'Describe Your Task',
    description:
      'Tell the AI what you want done in plain language. No scripting, no configuration files, no technical knowledge required.',
  },
  {
    number: '02',
    icon: Play,
    title: 'AI Plans & Executes',
    description:
      'The AI breaks your task into steps, selects the right desktop tools, and executes each action with real-time progress updates.',
  },
  {
    number: '03',
    icon: Search,
    title: 'Review & Approve',
    description:
      'See exactly what was done, review results, approve or undo any action. You stay in control at every step.',
  },
];

const webPageJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'AI Tools - AGI Workforce',
  description: 'Unlimited MCP tools, screen automation, and desktop control for AI agents.',
  url: 'https://agiworkforce.com/features/tools',
  isPartOf: { '@type': 'WebSite', name: 'AGI Workforce', url: 'https://agiworkforce.com' },
};

export default function ToolsFeaturePage() {
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
                <Monitor className="mr-2 h-4 w-4" />
                Desktop Automation
              </div>
              <h1 className="mx-auto max-w-4xl bg-gradient-to-b from-white to-white/50 bg-clip-text text-5xl font-bold tracking-tight text-transparent md:text-7xl lg:text-8xl">
                Your Desktop, Fully Autonomous
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400 md:text-xl">
                Native desktop automation that sees your screen, controls your keyboard, manages
                your files, and runs terminal commands — all with safety controls.
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
                  <span>6 Automation Domains</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>Native Performance</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <Shield className="h-4 w-4 text-emerald-500" />
                  <span>Full Safety Controls</span>
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
                  Everything Your Desktop Can Do, Automated
                </h2>
                <p className="mx-auto max-w-2xl text-zinc-400">
                  Six powerful automation domains that give your AI agent full control over your
                  desktop environment — with safety at every step.
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
                    Safety First
                  </div>
                  <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                    Autonomous, but Safe
                  </h2>
                  <p className="text-lg text-zinc-400">
                    Every tool action passes through multiple safety layers before execution. You
                    stay in control even when the AI works autonomously.
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
                        <Shield className="h-4 w-4" />
                        <span>ToolGuard Safety Pipeline</span>
                      </div>
                      <div className="h-px bg-white/10" />
                      <div className="flex justify-between">
                        <span>Tool Validation</span>
                        <span className="text-emerald-400">Passed</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Permission Check</span>
                        <span className="text-emerald-400">Authorized</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Sandbox Isolation</span>
                        <span className="text-emerald-400">Active</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Budget Remaining</span>
                        <span className="text-white">47 / 50 iterations</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Undo Stack</span>
                        <span className="text-white">3 reversible actions</span>
                      </div>
                      <div className="h-px bg-white/10" />
                      <div className="flex justify-between">
                        <span>Status</span>
                        <span className="text-emerald-400 font-semibold">Safe to Execute</span>
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
                  From natural language to executed automation in three simple steps.
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
            icon="Monitor"
            headline="Automate Your Desktop Today"
            body="Download the desktop app and let AI handle your repetitive tasks. Browser automation, file management, terminal commands — all from natural language."
          />
        </main>

        <MarketingFooter />
      </div>
    </>
  );
}
