import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Terminal,
  Zap,
  GitBranch,
  Plug,
  Package,
  CheckCircle2,
  Code2,
  Copy,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'CLI | AGI Workforce',
  description:
    'agiworkforce — the Rust CLI. 22 subcommands, Ratatui TUI, 13 providers, 2,161 tests. Install via Homebrew, Cargo, curl, or npm.',
  alternates: { canonical: 'https://agiworkforce.com/cli' },
  openGraph: {
    title: 'CLI | AGI Workforce',
    description:
      'Pure Rust CLI with Ratatui TUI. 22 subcommands, 13 providers, 5.7 MB binary, 2,161 tests.',
    url: 'https://agiworkforce.com/cli',
    type: 'website',
    images: [{ url: '/app-preview.png', width: 1200, height: 630, alt: 'AGI Workforce CLI' }],
  },
};

const cliStats = [
  { label: 'Rust files', value: '195', sub: 'source files' },
  { label: 'Subcommands', value: '22', sub: 'CLI commands' },
  { label: 'Tests', value: '2,161', sub: 'all passing' },
  { label: 'Binary size', value: '5.7 MB', sub: 'arm64 macOS' },
];

const providers = [
  'Anthropic',
  'OpenAI',
  'Google',
  'Ollama (Local + Cloud)',
  'xAI',
  'DeepSeek',
  'Perplexity',
  'Qwen',
  'Moonshot',
  'Zhipu',
  'LM Studio',
  'Custom',
];

const subcommands = [
  {
    cmd: 'agiworkforce exec',
    desc: 'Run a one-shot agent task with any provider. Multi-model fallback built in.',
    example: 'agiworkforce exec -m claude-opus-4-7 "Summarize this file"',
  },
  {
    cmd: 'agiworkforce repl',
    desc: 'Interactive Ratatui TUI. Full chat with streaming, tool calls, and history.',
    example: 'agiworkforce repl --provider openai',
  },
  {
    cmd: 'agiworkforce plan',
    desc: 'Agentic plan mode. Decompose a task into steps, approve, then execute.',
    example: 'agiworkforce plan "Refactor auth module"',
  },
  {
    cmd: 'agiworkforce sessions',
    desc: 'Resume, fork, or branch conversations. Full session continuity.',
    example: 'agiworkforce sessions resume abc123',
  },
  {
    cmd: 'agiworkforce mcp',
    desc: 'Connect and manage MCP servers (stdio only). Browse available tools.',
    example: 'agiworkforce mcp connect ./my-server',
  },
  {
    cmd: '--demo --json-events',
    desc: 'Structured JSON event stream. Pipe into scripts, CI, or your own tooling.',
    example: 'agiworkforce --demo --json-events exec -m claude-opus-4-7,gpt-5.5 "..."',
  },
];

const installMethods = [
  {
    label: 'Homebrew',
    cmd: 'brew install siddharthanagula3/tap/agiworkforce',
    status: 'live',
  },
  {
    label: 'Cargo',
    cmd: 'cargo install agiworkforce-cli',
    status: 'live',
  },
  {
    label: 'curl installer',
    cmd: 'curl -fsSL https://agiworkforce.com/install.sh | sh',
    status: 'live',
  },
  {
    label: 'npm (global)',
    cmd: 'npm install -g @agiworkforce/cli',
    status: 'coming-soon',
  },
];

const hookEvents = [
  'before_exec',
  'after_exec',
  'before_tool',
  'after_tool',
  'on_error',
  'on_stream_start',
  'on_stream_end',
  'on_plan_approved',
  'on_session_start',
  'on_session_end',
  'on_fallback_triggered',
  'on_mcp_connect',
  'on_mcp_disconnect',
  'on_provider_switch',
  'on_context_limit',
  'on_cancel',
  'on_token_budget',
  'before_sandbox',
  'after_sandbox',
  'on_approval_required',
  'on_skill_start',
  'on_skill_end',
];

export default function CliPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <Header />
      <main className="pt-24">
        {/* Hero */}
        <section className="relative overflow-hidden py-20 md:py-32">
          <div className="pointer-events-none absolute inset-0 [background-image:radial-gradient(rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:28px_28px]" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[500px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#c8892a]/[0.07] blur-[140px]" />

          <div className="container mx-auto px-4 relative">
            <div className="max-w-4xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#c8892a]/25 bg-[#c8892a]/[0.07] px-4 py-1.5 text-sm font-medium text-[#c8892a] mb-8">
                <Terminal className="h-3.5 w-3.5" />
                Pure Rust — 5.7 MB binary
              </div>

              <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[0.95] mb-6">
                <span className="font-mono">agiworkforce</span>
                <br />
                <span className="bg-gradient-to-r from-[#c8892a] via-[#e8af50] to-[#c8892a] bg-clip-text text-transparent">
                  the Rust CLI.
                </span>
              </h1>

              <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-4 leading-relaxed">
                22 subcommands. 13 providers. Ratatui TUI. 2,161 tests. v1.0 live.
              </p>

              {/* Quick install */}
              <div className="max-w-xl mx-auto mb-10">
                <div className="rounded-xl border border-white/10 bg-[#0c0c0e] p-4 flex items-center gap-3 text-left">
                  <Terminal className="h-4 w-4 text-[#c8892a] shrink-0" />
                  <code className="font-mono text-sm text-zinc-200 flex-1 overflow-x-auto">
                    brew install siddharthanagula3/tap/agiworkforce
                  </code>
                  <Copy className="h-4 w-4 text-zinc-600 shrink-0" />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href="https://github.com/siddharthanagula3/agiworkforce/releases"
                  className="group inline-flex h-12 items-center gap-2 rounded-md bg-[#c8892a] px-8 text-sm font-semibold text-black hover:bg-[#d4993a] transition-all"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub Releases
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/docs"
                  className="inline-flex h-12 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-8 text-sm font-medium text-zinc-400 hover:border-white/20 hover:text-white transition-all"
                >
                  Documentation
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Stats strip */}
        <section className="border-y border-white/[0.05] bg-[#0c0c0e]">
          <div className="container mx-auto px-4 py-12">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/[0.05] rounded-2xl overflow-hidden max-w-3xl mx-auto">
              {cliStats.map(({ label, value, sub }) => (
                <div key={label} className="bg-[#0c0c0e] p-6 text-center">
                  <div className="font-mono text-2xl font-bold text-[#c8892a] mb-1">{value}</div>
                  <div className="text-sm font-medium text-white mb-0.5">{label}</div>
                  <div className="text-xs text-zinc-600">{sub}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Subcommand showcase */}
        <section className="py-24">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#c8892a] mb-3">
                Subcommands
              </p>
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
                22 commands, every workflow
              </h2>
            </div>

            <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-4">
              {subcommands.map(({ cmd, desc, example }) => (
                <div key={cmd} className="rounded-xl border border-white/[0.06] bg-[#0c0c0e] p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Code2 className="h-4 w-4 text-[#c8892a] shrink-0" />
                    <code className="font-mono text-sm font-bold text-white">{cmd}</code>
                  </div>
                  <p className="text-sm text-zinc-500 mb-3 leading-relaxed">{desc}</p>
                  <div className="rounded-lg bg-zinc-950 border border-white/[0.04] px-4 py-2.5">
                    <code className="font-mono text-xs text-zinc-400 break-all">{example}</code>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Providers */}
        <section className="py-20 border-y border-white/[0.05] bg-[#0c0c0e]">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-10">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#c8892a] mb-3">
                  Provider registry
                </p>
                <h2 className="text-3xl font-bold tracking-tight mb-2">13 named providers</h2>
                <p className="text-zinc-500 text-sm">
                  Registered at build time in models.rs. Custom endpoints via OpenAI-compatible
                  adapter.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {providers.map((p) => (
                  <div
                    key={p}
                    className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-[#111114] px-4 py-3"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    <span className="text-sm text-zinc-300">{p}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Install methods */}
        <section className="py-24">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-3xl font-bold tracking-tight mb-2">Install</h2>
              <p className="text-zinc-500 mb-10">
                Four install paths. Pick the one that fits your workflow.
              </p>

              <div className="space-y-4">
                {installMethods.map(({ label, cmd, status }) => (
                  <div
                    key={label}
                    className="rounded-xl border border-white/[0.06] bg-[#0c0c0e] p-5"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-semibold text-zinc-300">{label}</span>
                      {status === 'live' ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          Live
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-amber-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                          Coming soon
                        </span>
                      )}
                    </div>
                    <div className="rounded-lg bg-zinc-950 border border-white/[0.04] px-4 py-3 flex items-center gap-3">
                      <Terminal className="h-4 w-4 text-zinc-600 shrink-0" />
                      <code className="font-mono text-sm text-zinc-300 flex-1 overflow-x-auto">
                        {cmd}
                      </code>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Hook events */}
        <section className="py-20 border-y border-white/[0.05] bg-[#0c0c0e]">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <div className="flex flex-col md:flex-row md:items-end gap-4 mb-8">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#c8892a] mb-2">
                    Hooks system
                  </p>
                  <h2 className="text-3xl font-bold tracking-tight">22 lifecycle events</h2>
                  <p className="text-zinc-500 text-sm mt-2">
                    Register shell scripts or Rust plugins on any event in the agent lifecycle.
                  </p>
                </div>
                <div className="ml-auto">
                  <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-1.5 text-xs text-emerald-400">
                    <GitBranch className="h-3 w-3" />
                    hooks.rs:179-200
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {hookEvents.map((evt) => (
                  <code
                    key={evt}
                    className="rounded-md border border-white/[0.06] bg-zinc-950 px-3 py-1.5 font-mono text-xs text-zinc-400"
                  >
                    {evt}
                  </code>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Additional capabilities */}
        <section className="py-24">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto grid md:grid-cols-3 gap-6">
              <div className="rounded-xl border border-white/[0.06] bg-[#0c0c0e] p-7">
                <Package className="h-5 w-5 text-[#c8892a] mb-4" />
                <h3 className="font-semibold text-white mb-2">MCP (stdio)</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">
                  Connect any Model Context Protocol server via stdio. Browse tools, call them
                  inline in agent loops.
                </p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-[#0c0c0e] p-7">
                <Zap className="h-5 w-5 text-[#c8892a] mb-4" />
                <h3 className="font-semibold text-white mb-2">Sandbox</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">
                  macOS Seatbelt and Linux bwrap ship by default. Every tool call runs in a
                  policy-gated sandbox.
                </p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-[#0c0c0e] p-7">
                <Plug className="h-5 w-5 text-[#c8892a] mb-4" />
                <h3 className="font-semibold text-white mb-2">JSON Events</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">
                  Structured event stream with{' '}
                  <code className="font-mono text-xs text-zinc-300">--json-events</code>. Pipe into
                  CI, scripts, or observability tooling.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 border-t border-white/[0.05] bg-[#0c0c0e]">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
              Install in one line.
            </h2>
            <div className="max-w-lg mx-auto mb-8">
              <div className="rounded-xl border border-white/10 bg-zinc-950 p-4 flex items-center gap-3 text-left">
                <Terminal className="h-4 w-4 text-[#c8892a] shrink-0" />
                <code className="font-mono text-sm text-zinc-200 flex-1">
                  brew install siddharthanagula3/tap/agiworkforce
                </code>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/docs"
                className="inline-flex h-12 items-center gap-2 rounded-md bg-[#c8892a] px-8 text-sm font-semibold text-black hover:bg-[#d4993a] transition-all"
              >
                Read the docs
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="https://github.com/siddharthanagula3/agiworkforce/releases"
                className="inline-flex h-12 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-8 text-sm font-medium text-zinc-400 hover:border-white/20 hover:text-white transition-all"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub Releases
              </Link>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
