import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowLeft,
  Book,
  FileText,
  Settings,
  Zap,
  Shield,
  Code,
  Database,
  Cloud,
  Terminal,
  Cpu,
  Globe,
} from 'lucide-react';
import { Header } from '../../components/layout/Header';

export const metadata: Metadata = {
  title: 'Documentation | AGI Workforce - Complete Setup & API Guide',
  description:
    'Complete documentation for AGI Workforce. Setup guides, feature documentation, API references, and security best practices for desktop automation with AI agents.',
  keywords: [
    'AGI Workforce documentation',
    'AI agent setup',
    'automation guide',
    'API reference',
    'desktop automation tutorial',
    'LLM integration',
  ],
  openGraph: {
    title: 'Documentation | AGI Workforce',
    description:
      'Complete guides, API references, and feature documentation for AGI Workforce. Learn how to deploy autonomous AI agents.',
    url: 'https://agiworkforce.com/docs',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline: 'AGI Workforce Documentation',
  description: 'Complete documentation for setting up and using AGI Workforce',
  url: 'https://agiworkforce.com/docs',
  datePublished: '2025-01-01',
  dateModified: new Date().toISOString(),
  publisher: {
    '@type': 'Organization',
    name: 'AGI Automation LLC',
  },
};

export default function DocsPage() {
  const quickLinks = [
    {
      icon: Zap,
      title: 'Getting Started',
      href: '/get-started',
      description: 'Quick start guide to set up and use AGI Workforce',
    },
    {
      icon: Settings,
      title: 'Installation',
      href: '/download',
      description: 'Download and install the desktop application',
    },
  ];

  const featureDocs = [
    {
      icon: Cpu,
      title: 'Autonomous AI Agents',
      items: [
        'Agent Planning & Execution',
        'Multi-step Task Orchestration',
        'Self-healing & Error Recovery',
        'Goal-based Reasoning',
      ],
    },
    {
      icon: Code,
      title: 'Multi-LLM Support',
      items: [
        'OpenAI GPT-5 & GPT-4',
        'Anthropic Claude 4.5',
        'Google Gemini 3',
        'X.AI Grok 4.1',
        'DeepSeek V3.2',
        'Alibaba Qwen 3',
        'Local models via Ollama (Llama 3.3, etc.)',
      ],
    },
    {
      icon: Globe,
      title: 'Desktop & Web Automation',
      items: [
        'Browser automation with Playwright',
        'Screen capture & visual analysis',
        'File operations & document processing',
        'Cross-application workflows',
      ],
    },
    {
      icon: Database,
      title: 'Database & API Integration',
      items: [
        'PostgreSQL, MySQL, SQLite support',
        'REST API calls',
        'Webhook support',
        'Custom tool development',
      ],
    },
  ];

  const apiEndpoints = [
    {
      method: 'POST',
      path: '/api/llm/v1/chat/completions',
      description: 'OpenAI-compatible chat completions endpoint',
    },
    {
      method: 'GET',
      path: '/api/llm/v1/models',
      description: 'List available LLM models',
    },
    {
      method: 'GET',
      path: '/api/llm/v1/credits/balance',
      description: 'Get credit balance for authenticated user',
    },
    {
      method: 'POST',
      path: '/api/checkout',
      description: 'Create Stripe checkout session',
    },
    {
      method: 'POST',
      path: '/api/portal',
      description: 'Access Stripe billing portal',
    },
    {
      method: 'POST',
      path: '/api/device/link',
      description: 'Link desktop device to account',
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="flex min-h-screen flex-col bg-black text-white">
        <Header />

        <main className="flex-1 pt-24">
          <div className="container mx-auto px-4 py-12 max-w-6xl">
            {/* Back to Home */}
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-zinc-400 hover:text-white mb-8 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Link>

            {/* Header */}
            <div className="mb-12">
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">Documentation</h1>
              <p className="text-lg text-zinc-400">
                Complete guides, API references, and feature documentation for AGI Workforce. Learn
                how to deploy autonomous AI agents across your desktop and web.
              </p>
            </div>

            {/* Quick Links */}
            <div className="grid md:grid-cols-2 gap-6 mb-16">
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="group rounded-xl border border-zinc-800 bg-black/50 p-6 hover:border-blue-500/50 transition-all hover:transform hover:scale-105"
                >
                  <link.icon className="h-8 w-8 text-blue-500 mb-3" />
                  <h3 className="text-xl font-semibold mb-2 group-hover:text-blue-400 transition-colors">
                    {link.title}
                  </h3>
                  <p className="text-zinc-400 text-sm">{link.description}</p>
                </Link>
              ))}
            </div>

            {/* Feature Documentation */}
            <section className="mb-16">
              <div className="flex items-center gap-3 mb-8">
                <Book className="h-6 w-6 text-blue-500" />
                <h2 className="text-3xl font-semibold">Feature Documentation</h2>
              </div>
              <div className="grid md:grid-cols-2 gap-6">
                {featureDocs.map((section, i) => (
                  <div key={i} className="rounded-xl border border-zinc-800 bg-black/50 p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <section.icon className="h-6 w-6 text-blue-500" />
                      <h3 className="text-xl font-semibold">{section.title}</h3>
                    </div>
                    <ul className="space-y-2">
                      {section.items.map((item, j) => (
                        <li key={j} className="text-zinc-300 flex items-start gap-2">
                          <span className="text-blue-500 mt-1">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            {/* Security & Privacy */}
            <section className="mb-16">
              <div className="rounded-xl border border-zinc-800 bg-black/50 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Shield className="h-6 w-6 text-blue-500" />
                  <h2 className="text-2xl font-semibold">Security & Privacy</h2>
                </div>
                <p className="text-zinc-400 mb-4">
                  AGI Workforce is built with security and privacy as top priorities:
                </p>
                <ul className="space-y-3 text-zinc-300">
                  <li className="flex items-start gap-3">
                    <Shield className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-white">Local-first execution</strong> - Your data
                      stays on your device unless you explicitly allow cloud connections
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <Shield className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-white">Encrypted credential storage</strong> - API
                      keys and sensitive data stored using OS keyring with AES-256-GCM encryption
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <Shield className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-white">Sandboxed agent environments</strong> - Agents
                      run with strict permission controls and user approval for file/network access
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <Shield className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-white">No data sent to AGI Workforce servers</strong>{' '}
                      - We don&apos;t collect or store your automation data or credentials
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <Shield className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-white">TLS 1.3 for all network connections</strong> -
                      End-to-end encryption for all API communications
                    </div>
                  </li>
                </ul>
              </div>
            </section>

            {/* API Reference */}
            <section className="mb-16">
              <div className="rounded-xl border border-zinc-800 bg-black/50 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <FileText className="h-6 w-6 text-blue-500" />
                  <h2 className="text-2xl font-semibold">API Reference</h2>
                </div>
                <p className="text-zinc-400 mb-6">
                  AGI Workforce provides REST API endpoints for programmatic access:
                </p>
                <div className="space-y-3">
                  {apiEndpoints.map((endpoint, i) => (
                    <div
                      key={i}
                      className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-lg border border-zinc-800/50 bg-zinc-900/30 hover:bg-zinc-900/50 transition-colors"
                    >
                      <span
                        className={`inline-flex items-center justify-center px-3 py-1 rounded-md text-xs font-bold uppercase ${
                          endpoint.method === 'GET'
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-emerald-500/20 text-emerald-400'
                        }`}
                      >
                        {endpoint.method}
                      </span>
                      <code className="font-mono text-sm text-blue-300 flex-1">
                        {endpoint.path}
                      </code>
                      <span className="text-zinc-400 text-sm">{endpoint.description}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-6 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <div className="flex items-start gap-3">
                    <Terminal className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-blue-400 mb-2">OpenAI-Compatible API</h4>
                      <p className="text-zinc-300 text-sm">
                        The <code className="text-blue-300">/api/llm/v1/chat/completions</code>{' '}
                        endpoint is fully compatible with OpenAI&apos;s API format, making it easy
                        to integrate with existing tools and libraries.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Integration Examples */}
            <section className="mb-16">
              <div className="rounded-xl border border-zinc-800 bg-black/50 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Cloud className="h-6 w-6 text-blue-500" />
                  <h2 className="text-2xl font-semibold">Integration & Development</h2>
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="font-semibold text-white mb-3">External Service Integration</h3>
                    <ul className="space-y-2 text-zinc-300">
                      <li className="flex items-start gap-2">
                        <span className="text-blue-500 mt-1">•</span>
                        <span>REST API calls with authentication</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-500 mt-1">•</span>
                        <span>Webhook support for event notifications</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-500 mt-1">•</span>
                        <span>OAuth 2.0 integration</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-500 mt-1">•</span>
                        <span>Custom tool development</span>
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="font-semibold text-white mb-3">Development Tools</h3>
                    <ul className="space-y-2 text-zinc-300">
                      <li className="flex items-start gap-2">
                        <span className="text-blue-500 mt-1">•</span>
                        <span>TypeScript SDK for custom integrations</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-500 mt-1">•</span>
                        <span>Rust backend for native extensions</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-500 mt-1">•</span>
                        <span>Visual workflow designer</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-500 mt-1">•</span>
                        <span>Built-in debugging tools</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </section>

            {/* Support Section */}
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-6">
              <h3 className="text-xl font-semibold mb-2">Need Help?</h3>
              <p className="text-zinc-400 mb-4">
                Can&apos;t find what you&apos;re looking for? We&apos;re here to help you get
                started.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/diagnose"
                  className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                >
                  <Terminal className="h-4 w-4 mr-2" />
                  Diagnostic Tool
                </Link>
                <Link
                  href="/faq"
                  className="inline-flex items-center justify-center rounded-lg border border-zinc-800 bg-black px-6 py-3 text-sm font-medium text-zinc-300 hover:bg-zinc-900 hover:text-white transition-colors"
                >
                  <Book className="h-4 w-4 mr-2" />
                  View FAQ
                </Link>
                <a
                  href="mailto:support@agiworkforce.com"
                  className="inline-flex items-center justify-center rounded-lg border border-zinc-800 bg-black px-6 py-3 text-sm font-medium text-zinc-300 hover:bg-zinc-900 hover:text-white transition-colors"
                >
                  Contact Support
                </a>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
