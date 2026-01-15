import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight,
  Bot,
  Cpu,
  Globe,
  Shield,
  Zap,
  Sparkles,
  CheckCircle2,
  TrendingUp,
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { ApplicationPreview } from '../components/ApplicationPreview';

export const metadata: Metadata = {
  title: 'AGI Workforce | Your On-Demand AI Workforce - Automate Everything',
  description:
    'Deploy autonomous AI agents to automate complex desktop and web workflows. Support for GPT-5, Claude 4.5, Gemini 3, DeepSeek V3, and local models. Built with Rust for blazing performance.',
  keywords: [
    'AI agents',
    'autonomous agents',
    'workflow automation',
    'desktop automation',
    'web automation',
    'GPT-5',
    'Claude 4.5',
    'Gemini 3',
    'DeepSeek V3',
    'Llama 3.3',
    'local AI',
    'productivity tools',
    'business automation',
  ],
  openGraph: {
    title: 'AGI Workforce | Your On-Demand AI Workforce',
    description:
      'Deploy autonomous AI agents to automate complex desktop and web workflows. Multi-LLM support, local-first privacy, blazing fast performance.',
    type: 'website',
    url: 'https://agiworkforce.com',
    images: [
      {
        url: '/og-image.svg',
        width: 1200,
        height: 630,
        alt: 'AGI Workforce - Deploy autonomous AI agents',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AGI Workforce | Your On-Demand AI Workforce',
    description:
      'Deploy autonomous AI agents to automate complex desktop and web workflows. Multi-LLM support, native performance.',
    images: ['/og-image.svg'],
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'AGI Workforce - On-Demand AI Workforce',
  description:
    'Deploy autonomous AI agents to automate complex desktop and web workflows with multi-LLM support.',
  url: 'https://agiworkforce.com',
  mainEntity: {
    '@type': 'SoftwareApplication',
    name: 'AGI Workforce',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'macOS, Windows, Linux',
    offers: {
      '@type': 'AggregateOffer',
      lowPrice: '0',
      highPrice: '299.99',
      priceCurrency: 'USD',
      offerCount: '3',
    },
    featureList: [
      'Autonomous AI Agents',
      'Multi-LLM Support (GPT-5, Claude 4.5, Gemini 3, DeepSeek V3)',
      'Desktop and Web Automation',
      'Local-First Privacy',
      'Native Performance with Rust',
      'Visual Workflow Builder',
    ],
  },
};

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
          {/* Hero Section */}
          <section className="relative overflow-hidden py-20 md:py-32 lg:py-40">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-black to-black" />
            <div className="container relative mx-auto px-4 text-center">
              <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-blue-400 mb-8 backdrop-blur-sm">
                <span className="flex h-2 w-2 rounded-full bg-blue-500 mr-2 animate-pulse" />
                Now in Public Beta - Free to Start
              </div>
              <h1 className="mx-auto max-w-4xl text-5xl font-bold tracking-tight md:text-7xl lg:text-8xl bg-clip-text text-transparent bg-gradient-to-b from-white to-white/50">
                Your On-Demand <br />
                AI Workforce
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400 md:text-xl">
                Automate complex workflows, deploy autonomous agents, and scale your operations
                without hiring a single human. Built for the autonomous era with multi-LLM support.
              </p>
              <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href="/download"
                  className="inline-flex h-12 items-center justify-center rounded-full bg-blue-600 px-8 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-black"
                >
                  Download for Desktop
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
                <Link
                  href="/docs"
                  className="inline-flex h-12 items-center justify-center rounded-full border border-zinc-800 bg-black px-8 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white"
                >
                  Read Documentation
                </Link>
              </div>

              {/* Social Proof */}
              <div className="mt-12 flex flex-col items-center gap-4 md:flex-row md:justify-center">
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>Free to start</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>No credit card required</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>Local-first privacy</span>
                </div>
              </div>

              {/* Application Preview */}
              <ApplicationPreview />
            </div>
          </section>

          {/* Features Section */}
          <section id="features" className="py-24 bg-zinc-950">
            <div className="container mx-auto px-4">
              <div className="text-center mb-16">
                <h2 className="text-3xl font-bold tracking-tight md:text-4xl mb-4">
                  Built for the Autonomous Era
                </h2>
                <p className="text-zinc-400 max-w-2xl mx-auto">
                  Everything you need to automate your workflows and multiply your productivity with
                  AI agents.
                </p>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                {[
                  {
                    icon: Cpu,
                    title: 'Autonomous Agents',
                    desc: 'Deploy self-healing agents that plan, execute, and verify complex tasks across your desktop and web. No coding required.',
                  },
                  {
                    icon: Zap,
                    title: 'Native Performance',
                    desc: 'Built with Rust and Tauri for blazing fast performance and minimal resource footprint. 10x faster than Electron.',
                  },
                  {
                    icon: Shield,
                    title: 'Local & Private',
                    desc: 'Your data stays on your device. Run local LLMs via Ollama or connect to cloud providers securely with encrypted credentials.',
                  },
                  {
                    icon: Globe,
                    title: 'Web Automation',
                    desc: 'Control browsers naturally to scrape data, fill forms, automate testing, and orchestrate complex web workflows.',
                  },
                  {
                    icon: Bot,
                    title: 'Multi-LLM Support',
                    desc: 'Switch instantly between GPT-5, Claude 4.5, Gemini 3, Grok 4.1, DeepSeek V3, Qwen 3, or local Llama 3.3 models.',
                  },
                  {
                    icon: Sparkles,
                    title: 'Visual Workflow Builder',
                    desc: 'Create complex automation chains with an intuitive drag-and-drop interface. No programming knowledge needed.',
                  },
                ].map((feature, i) => (
                  <div
                    key={i}
                    className="group rounded-2xl border border-zinc-800 bg-black/50 p-8 hover:border-blue-500/50 transition-all hover:transform hover:scale-105"
                  >
                    <feature.icon className="h-10 w-10 text-blue-500 mb-4" />
                    <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                    <p className="text-zinc-400 leading-relaxed">{feature.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Stats Section */}
          <section className="py-24 bg-black">
            <div className="container mx-auto px-4">
              <div className="grid md:grid-cols-3 gap-8 text-center">
                <div className="p-8">
                  <div className="text-5xl font-bold text-blue-500 mb-2">10+</div>
                  <div className="text-zinc-400 text-lg">Supported LLM Providers</div>
                  <p className="text-zinc-600 text-sm mt-2">
                    OpenAI, Anthropic, Google, X.AI, DeepSeek, Qwen, Ollama
                  </p>
                </div>
                <div className="p-8">
                  <div className="text-5xl font-bold text-blue-500 mb-2">3</div>
                  <div className="text-zinc-400 text-lg">Platforms Supported</div>
                  <p className="text-zinc-600 text-sm mt-2">macOS, Windows, Linux</p>
                </div>
                <div className="p-8">
                  <div className="text-5xl font-bold text-blue-500 mb-2">100%</div>
                  <div className="text-zinc-400 text-lg">Local-First</div>
                  <p className="text-zinc-600 text-sm mt-2">Your data never leaves your device</p>
                </div>
              </div>
            </div>
          </section>

          {/* Security Section */}
          <section id="security" className="py-24 bg-zinc-950">
            <div className="container mx-auto px-4">
              <div className="flex flex-col md:flex-row items-center gap-16">
                <div className="flex-1 space-y-8">
                  <div className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-sm text-blue-400 mb-2">
                    <Shield className="h-4 w-4 mr-2" />
                    Enterprise-Grade Security
                  </div>
                  <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                    Built with Security & Privacy First
                  </h2>
                  <div className="space-y-6">
                    <div className="flex gap-4">
                      <Shield className="h-6 w-6 text-blue-500 shrink-0" />
                      <div>
                        <h3 className="text-xl font-semibold mb-2">Local-First Execution</h3>
                        <p className="text-zinc-400">
                          Your data never leaves your device unless you explicitly allow it. We
                          prioritize local LLMs and secure, direct connections to cloud providers.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <Shield className="h-6 w-6 text-blue-500 shrink-0" />
                      <div>
                        <h3 className="text-xl font-semibold mb-2">Sandboxed Environments</h3>
                        <p className="text-zinc-400">
                          Agents run in isolated environments with strict permission controls. You
                          approve every file access and network request before execution.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <Shield className="h-6 w-6 text-blue-500 shrink-0" />
                      <div>
                        <h3 className="text-xl font-semibold mb-2">End-to-End Encryption</h3>
                        <p className="text-zinc-400">
                          All sensitive data, including API keys and credentials, is encrypted at
                          rest using industry-standard AES-256-GCM encryption.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex-1">
                  <div className="relative rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm">
                    <div className="absolute inset-0 bg-blue-500/10 blur-3xl -z-10" />
                    <div className="space-y-4 font-mono text-sm text-zinc-400">
                      <div className="flex items-center gap-2 text-green-400">
                        <Shield className="h-4 w-4" />
                        <span>Security Scan Complete</span>
                      </div>
                      <div className="h-px bg-white/10" />
                      <div className="flex justify-between">
                        <span>Encryption</span>
                        <span className="text-white">AES-256-GCM</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Data Storage</span>
                        <span className="text-white">Local Encrypted</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Network</span>
                        <span className="text-white">TLS 1.3</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Agent Sandbox</span>
                        <span className="text-white">Active</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Permission System</span>
                        <span className="text-white">Enabled</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Use Cases Section */}
          <section className="py-24 bg-black">
            <div className="container mx-auto px-4">
              <div className="text-center mb-16">
                <h2 className="text-3xl font-bold tracking-tight md:text-4xl mb-4">
                  Perfect for Every Use Case
                </h2>
                <p className="text-zinc-400 max-w-2xl mx-auto">
                  From individual developers to enterprise teams, AGI Workforce adapts to your needs
                </p>
              </div>
              <div className="grid md:grid-cols-2 gap-8">
                {[
                  {
                    icon: TrendingUp,
                    title: 'Developers & Engineers',
                    desc: 'Automate code reviews, testing, deployments, and documentation. Generate boilerplate code and debug issues faster.',
                  },
                  {
                    icon: Bot,
                    title: 'Business Professionals',
                    desc: 'Automate data entry, report generation, email management, and CRM updates. Save hours every day.',
                  },
                  {
                    icon: Sparkles,
                    title: 'Content Creators',
                    desc: 'Automate social media posting, image processing, video transcription, and content research.',
                  },
                  {
                    icon: Globe,
                    title: 'Data Analysts',
                    desc: 'Scrape web data, process spreadsheets, generate visualizations, and create automated reports.',
                  },
                ].map((useCase, i) => (
                  <div
                    key={i}
                    className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 hover:border-blue-500/50 transition-colors"
                  >
                    <useCase.icon className="h-10 w-10 text-blue-500 mb-4" />
                    <h3 className="text-xl font-semibold mb-2">{useCase.title}</h3>
                    <p className="text-zinc-400 leading-relaxed">{useCase.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* CTA Section */}
          <section className="py-24 relative overflow-hidden">
            <div className="absolute inset-0 bg-blue-600/10" />
            <div className="container relative mx-auto px-4 text-center">
              <h2 className="text-4xl font-bold tracking-tight mb-6 md:text-5xl">
                Ready to multiply your productivity?
              </h2>
              <p className="text-xl text-zinc-400 mb-10 max-w-2xl mx-auto">
                Join thousands of developers, founders, and professionals using AGI Workforce to
                automate the boring stuff and focus on what matters.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href="/download"
                  className="inline-flex h-14 items-center justify-center rounded-full bg-white px-8 text-lg font-bold text-black transition-transform hover:scale-105"
                >
                  Get Started for Free
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
            <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-8">
              <div className="flex items-center gap-2 font-bold">
                <Bot className="h-5 w-5 text-zinc-500" />
                <span className="text-zinc-500">AGI Workforce</span>
              </div>
              <div className="flex flex-wrap justify-center gap-6 text-sm">
                <Link href="/about" className="text-zinc-400 hover:text-white transition-colors">
                  About
                </Link>
                <Link href="/pricing" className="text-zinc-400 hover:text-white transition-colors">
                  Pricing
                </Link>
                <Link href="/docs" className="text-zinc-400 hover:text-white transition-colors">
                  Documentation
                </Link>
                <Link href="/faq" className="text-zinc-400 hover:text-white transition-colors">
                  FAQ
                </Link>
                <Link href="/contact" className="text-zinc-400 hover:text-white transition-colors">
                  Contact
                </Link>
                <Link href="/privacy" className="text-zinc-400 hover:text-white transition-colors">
                  Privacy
                </Link>
                <Link href="/terms" className="text-zinc-400 hover:text-white transition-colors">
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
