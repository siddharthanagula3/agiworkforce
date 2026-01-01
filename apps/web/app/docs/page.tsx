import Link from 'next/link';
import { ArrowLeft, Book, FileText, Settings, Zap, Shield } from 'lucide-react';
import { Header } from '../../components/layout/Header';

export const metadata = {
  title: 'Documentation',
  description:
    'Complete documentation for AGI Workforce - setup guides, API references, and feature documentation.',
};

export default function DocsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <Header />

      <main className="flex-1 pt-24">
        <div className="container mx-auto px-4 py-12 max-w-4xl">
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
              Complete guides, API references, and feature documentation for AGI Workforce.
            </p>
          </div>

          {/* Quick Links */}
          <div className="grid md:grid-cols-2 gap-6 mb-12">
            <Link
              href="/get-started"
              className="group rounded-xl border border-zinc-800 bg-black/50 p-6 hover:border-blue-500/50 transition-colors"
            >
              <Zap className="h-8 w-8 text-blue-500 mb-3" />
              <h3 className="text-xl font-semibold mb-2">Getting Started</h3>
              <p className="text-zinc-400 text-sm">
                Quick start guide to set up and use AGI Workforce
              </p>
            </Link>

            <Link
              href="/download"
              className="group rounded-xl border border-zinc-800 bg-black/50 p-6 hover:border-blue-500/50 transition-colors"
            >
              <Settings className="h-8 w-8 text-blue-500 mb-3" />
              <h3 className="text-xl font-semibold mb-2">Installation</h3>
              <p className="text-zinc-400 text-sm">Download and install the desktop application</p>
            </Link>
          </div>

          {/* Documentation Sections */}
          <div className="space-y-6">
            <section className="rounded-xl border border-zinc-800 bg-black/50 p-6">
              <div className="flex items-center gap-3 mb-4">
                <Book className="h-6 w-6 text-blue-500" />
                <h2 className="text-2xl font-semibold">Feature Documentation</h2>
              </div>
              <p className="text-zinc-400 mb-4">
                Learn about all the features and capabilities of AGI Workforce:
              </p>
              <ul className="space-y-2 text-zinc-300">
                <li>• Autonomous AI agents and workflow automation</li>
                <li>• Multi-LLM support (GPT-4, Claude, Gemini, and more)</li>
                <li>• Desktop and web automation</li>
                <li>• Browser automation and screen interaction</li>
                <li>• File operations and document processing</li>
                <li>• Database operations and API integrations</li>
              </ul>
            </section>

            <section className="rounded-xl border border-zinc-800 bg-black/50 p-6">
              <div className="flex items-center gap-3 mb-4">
                <Shield className="h-6 w-6 text-blue-500" />
                <h2 className="text-2xl font-semibold">Security & Privacy</h2>
              </div>
              <p className="text-zinc-400 mb-4">
                AGI Workforce is built with security and privacy as top priorities:
              </p>
              <ul className="space-y-2 text-zinc-300">
                <li>• Local-first execution - your data stays on your device</li>
                <li>• Encrypted credential storage using OS keyring</li>
                <li>• Sandboxed agent environments</li>
                <li>• End-to-end encryption for sensitive operations</li>
                <li>• No data sent to AGI Workforce servers</li>
              </ul>
            </section>

            <section className="rounded-xl border border-zinc-800 bg-black/50 p-6">
              <div className="flex items-center gap-3 mb-4">
                <FileText className="h-6 w-6 text-blue-500" />
                <h2 className="text-2xl font-semibold">API & Integration</h2>
              </div>
              <p className="text-zinc-400 mb-4">For developers and advanced users:</p>
              <ul className="space-y-2 text-zinc-300">
                <li>• REST API endpoints for programmatic access</li>
                <li>• Webhook support for event notifications</li>
                <li>• Custom tool development</li>
                <li>• Integration with external services</li>
              </ul>
            </section>
          </div>

          {/* Support Section */}
          <div className="mt-12 rounded-xl border border-blue-500/20 bg-blue-500/5 p-6">
            <h3 className="text-xl font-semibold mb-2">Need Help?</h3>
            <p className="text-zinc-400 mb-4">
              Can't find what you're looking for? We're here to help.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/diagnose"
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                Diagnostic Tool
              </Link>
              <a
                href="mailto:support@agiworkforce.com"
                className="inline-flex items-center justify-center rounded-lg border border-zinc-800 bg-black px-6 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-900 hover:text-white transition-colors"
              >
                Contact Support
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
