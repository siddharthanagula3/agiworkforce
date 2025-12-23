import Link from 'next/link';
import { Bot, FileText, Shield, Zap } from 'lucide-react';

export const metadata = {
  title: 'Documentation | AGI Workforce',
  description: 'Learn how to use AGI Workforce to automate your desktop workflows.',
};

export default function DocsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      {}
      <header className="fixed top-0 w-full border-b border-white/10 bg-black/50 backdrop-blur-xl z-50">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl tracking-tighter">
            <Bot className="h-6 w-6 text-blue-500" />
            <span>AGI Workforce</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm font-medium text-zinc-400 hover:text-white transition-colors"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 pt-24">
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">Documentation</h1>
            <p className="text-xl text-zinc-400 mb-12">
              Everything you need to know about setting up and scaling your AI workforce.
            </p>

            <div className="grid md:grid-cols-2 gap-6">
              {[
                {
                  title: 'Getting Started',
                  description:
                    'Learn how to download, install and configure AGI Workforce on your desktop.',
                  icon: Zap,
                  href: '#getting-started',
                },
                {
                  title: 'Agent Configuration',
                  description:
                    'Configure your autonomous agents with the right LLMs and capabilities.',
                  icon: Bot,
                  href: '#agent-config',
                },
                {
                  title: 'Workflow Automation',
                  description: 'Build complex, multi-step automation chains for any desktop task.',
                  icon: FileText,
                  href: '#workflow',
                },
                {
                  title: 'Security & Privacy',
                  description: 'Understand how we protect your data and manage local execution.',
                  icon: Shield,
                  href: '#security',
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className="group p-6 rounded-2xl border border-zinc-800 bg-zinc-950 hover:border-blue-500/50 transition-colors"
                >
                  <item.icon className="h-8 w-8 text-blue-500 mb-4" />
                  <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
                  <p className="text-zinc-400 mb-4">{item.description}</p>
                  <Link
                    href={item.href}
                    className="text-blue-400 hover:text-blue-300 font-medium inline-flex items-center"
                  >
                    Read More
                  </Link>
                </div>
              ))}
            </div>

            <section id="getting-started" className="mt-20 pt-16 border-t border-white/10">
              <h2 className="text-3xl font-bold mb-6">Getting Started</h2>
              <div className="prose prose-invert max-w-none text-zinc-400">
                <p className="mb-4">
                  AGI Workforce is a desktop-first platform. To begin, follow these steps:
                </p>
                <ol className="list-decimal list-inside space-y-2 ml-4">
                  <li>Download the application for your operating system (macOS or Windows).</li>
                  <li>Run the installer and follow the on-screen instructions.</li>
                  <li>Create an account or sign in to synchronize your workspace.</li>
                  <li>Configure your first LLM provider (OpenAI, Anthropic, or local Ollama).</li>
                </ol>
              </div>
            </section>

            <section id="agent-config" className="mt-20 pt-16 border-t border-white/10">
              <h2 className="text-3xl font-bold mb-6">Agent Configuration</h2>
              <div className="prose prose-invert max-w-none text-zinc-400">
                <p className="mb-4">
                  Configure your autonomous agents to match your specific needs. You can define:
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>
                    <strong>Tools:</strong> Enable or disable specific capabilities like file
                    access, web browsing, or terminal execution.
                  </li>
                  <li>
                    <strong>Models:</strong> Choose different LLMs for different tasks (e.g., GPT-4
                    for reasoning, Haiku for speed).
                  </li>
                  <li>
                    <strong>Permissions:</strong> Set strict boundaries on what your agent can and
                    cannot do.
                  </li>
                </ul>
              </div>
            </section>

            <section id="workflow" className="mt-20 pt-16 border-t border-white/10">
              <h2 className="text-3xl font-bold mb-6">Workflow Automation</h2>
              <div className="prose prose-invert max-w-none text-zinc-400">
                <p className="mb-4">Chain multiple agents together to create complex workflows.</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Use the visual builder to drag and drop steps.</li>
                  <li>Define triggers (e.g., on file change, daily at 9am).</li>
                  <li>Monitor execution in real-time with the built-in debugger.</li>
                </ul>
              </div>
            </section>

            <section id="security" className="mt-20 pt-16 border-t border-white/10">
              <h2 className="text-3xl font-bold mb-6">Security & Privacy</h2>
              <div className="prose prose-invert max-w-none text-zinc-400">
                <p className="mb-4">
                  Security is our top priority. Here&apos;s how we keep your data safe:
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>All credentials are encrypted at rest using AES-256-GCM.</li>
                  <li>We never train on your data.</li>
                  <li>Network requests are proxied securely or made directly from your machine.</li>
                </ul>
              </div>
            </section>
          </div>
        </div>
      </main>

      <footer className="border-t border-white/10 bg-black py-12">
        <div className="container mx-auto px-4 text-center">
          <div className="text-sm text-zinc-600">
            © {new Date().getFullYear()} AGI Automation LLC. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
