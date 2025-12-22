import Link from 'next/link';
import { ArrowRight, Bot, Cpu, Globe, Shield, Zap } from 'lucide-react';
import { Header } from '../components/layout/Header';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      {/* Navigation */}
      {/* Navigation */}
      <Header />

      <main className="flex-1 pt-24">
        {/* Hero Section */}
        <section className="relative overflow-hidden py-20 md:py-32 lg:py-40">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-black to-black" />
          <div className="container relative mx-auto px-4 text-center">
            <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-blue-400 mb-8 backdrop-blur-sm">
              <span className="flex h-2 w-2 rounded-full bg-blue-500 mr-2 animate-pulse" />
              Now in Public Beta
            </div>
            <h1 className="mx-auto max-w-4xl text-5xl font-bold tracking-tight md:text-7xl lg:text-8xl bg-clip-text text-transparent bg-gradient-to-b from-white to-white/50">
              Your On-Demand <br />
              AI Workforce
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400 md:text-xl">
              Automate complex workflows, deploy autonomous agents, and scale your operations
              without hiring a single human. The future of work is here.
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

            {/* UI Preview */}
            <div className="mt-20 rounded-xl border border-white/10 bg-white/5 p-2 backdrop-blur-sm mx-auto max-w-5xl shadow-2xl shadow-blue-900/20">
              <div className="rounded-lg bg-black aspect-video w-full flex items-center justify-center border border-white/5 relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/10 to-purple-500/10 opacity-50 group-hover:opacity-100 transition-opacity" />
                <p className="text-zinc-500 font-mono">Application Preview</p>
              </div>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section id="features" className="py-24 bg-zinc-950">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl font-bold tracking-tight text-center mb-16">
              Built for the Autonomous Era
            </h2>
            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  icon: Cpu,
                  title: 'Autonomous Agents',
                  desc: 'Deploy self-healing agents that plan, execute, and verify complex tasks across your desktop and web.',
                },
                {
                  icon: Zap,
                  title: 'Native Performance',
                  desc: 'Built with Rust and Tauri for blazing fast performance and minimal resource footprint.',
                },
                {
                  icon: Shield,
                  title: 'Local & Private',
                  desc: 'Your data stays on your device. Run local LLMs or connect to cloud providers securely.',
                },
                {
                  icon: Globe,
                  title: 'Web Automation',
                  desc: 'Control browsers naturally to scrape data, fill forms, and automate web workflows.',
                },
                {
                  icon: Bot,
                  title: 'Multi-LLM Support',
                  desc: 'Switch instantly between GPT-4, Claude, Gemini, or local Llama models.',
                },
                {
                  icon: ArrowRight,
                  title: 'Visual Workflow Builder',
                  desc: 'Create complex automation chains with a simple drag-and-drop interface.',
                },
              ].map((feature, i) => (
                <div
                  key={i}
                  className="group rounded-2xl border border-zinc-800 bg-black/50 p-8 hover:border-blue-500/50 transition-colors"
                >
                  <feature.icon className="h-10 w-10 text-blue-500 mb-4" />
                  <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                  <p className="text-zinc-400 leading-relaxed">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Security Section */}
        <section id="security" className="py-24 bg-black">
          <div className="container mx-auto px-4">
            <div className="flex flex-col md:flex-row items-center gap-16">
              <div className="flex-1 space-y-8">
                <h2 className="text-3xl font-bold tracking-tight">Enterprise-Grade Security</h2>
                <div className="space-y-6">
                  <div className="flex gap-4">
                    <Shield className="h-6 w-6 text-blue-500 shrink-0" />
                    <div>
                      <h3 className="text-xl font-semibold mb-2">Local-First Execution</h3>
                      <p className="text-zinc-400">
                        Your data never leaves your device unless you explicitly allow it. We
                        prioritize local LLMs and secure, direct connections.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <Shield className="h-6 w-6 text-blue-500 shrink-0" />
                    <div>
                      <h3 className="text-xl font-semibold mb-2">Sandboxed Environments</h3>
                      <p className="text-zinc-400">
                        Agents run in isolated environments with strict permission controls. You
                        approve every file access and network request.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <Shield className="h-6 w-6 text-blue-500 shrink-0" />
                    <div>
                      <h3 className="text-xl font-semibold mb-2">End-to-End Encryption</h3>
                      <p className="text-zinc-400">
                        All sensitive data, including API keys and credentials, is encrypted at rest
                        using industry-standard AES-256 encryption.
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
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 relative overflow-hidden">
          <div className="absolute inset-0 bg-blue-600/10" />
          <div className="container relative mx-auto px-4 text-center">
            <h2 className="text-4xl font-bold tracking-tight mb-6">
              Ready to multiply your productivity?
            </h2>
            <p className="text-xl text-zinc-400 mb-10 max-w-2xl mx-auto">
              Join thousands of developers and founders using AGI Workforce to automate the boring
              stuff.
            </p>
            <Link
              href="/download"
              className="inline-flex h-14 items-center justify-center rounded-full bg-white px-8 text-lg font-bold text-black transition-transform hover:scale-105"
            >
              Get Started for Free
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-black py-12">
        <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2 font-bold">
            <Bot className="h-5 w-5 text-zinc-500" />
            <span className="text-zinc-500">AGI Workforce</span>
          </div>
          <div className="text-sm text-zinc-600">
            © {new Date().getFullYear()} AGI Automation LLC. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
