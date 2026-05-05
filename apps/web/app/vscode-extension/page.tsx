import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Code2,
  MessageSquare,
  Sliders,
  Keyboard,
  BookOpen,
  GitBranch,
  Plug,
  CheckCircle2,
  Layers,
  Zap,
  Settings,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { MARKETING } from '@/lib/marketing-constants';

export const metadata: Metadata = {
  title: 'VS Code Extension | AGI Workforce',
  description:
    'AGI Workforce VS Code Extension v0.3.0. Multi-provider AI coding assistant — 10+ providers, 53 commands, inline completions, code lens, @agi chat participant. Install via VSIX from GitHub Releases.',
  alternates: { canonical: 'https://agiworkforce.com/vscode-extension' },
  openGraph: {
    title: 'VS Code Extension | AGI Workforce',
    description:
      'Multi-provider AI coding assistant. v0.3.0, 53 commands, 314 tests, inline completions, @agi chat participant.',
    url: 'https://agiworkforce.com/vscode-extension',
    type: 'website',
    images: [
      { url: '/app-preview.png', width: 1200, height: 630, alt: 'AGI Workforce VS Code Extension' },
    ],
  },
};

const extStats = [
  { label: 'Version', value: 'v0.3.0', sub: 'stable' },
  { label: 'Commands', value: '53', sub: 'unique' },
  { label: 'Tests', value: '314', sub: '17 suites' },
  { label: 'Settings', value: '21', sub: 'configurable' },
];

const features = [
  {
    icon: MessageSquare,
    title: '@agi Chat Participant',
    desc: "Use @agi inside VS Code's built-in Copilot Chat panel. Ask questions, request refactors, or run slash commands without leaving the chat view.",
  },
  {
    icon: Layers,
    title: 'Sidebar Webview',
    desc: 'Full-featured chat panel in the VS Code sidebar. History tree and Context Files tree for managing multi-turn sessions with file context.',
  },
  {
    icon: Sliders,
    title: 'Model Picker',
    desc:
      MARKETING.providers.display +
      ' providers in one picker. Auto-balanced default selects the best available model. Switch per file, per project, or globally.',
  },
  {
    icon: Zap,
    title: 'Inline Completions',
    desc: 'Ghost-text completions as you type. Powered by the same provider you have configured — not locked to a single model.',
  },
  {
    icon: Code2,
    title: 'Code Lens',
    desc: 'Inline actions above functions: Explain, Fix, Refactor, Add Tests, Add Docs. One click to run any slash command on the selected symbol.',
  },
  {
    icon: BookOpen,
    title: 'Hover Provider',
    desc: 'Hover over any symbol to get an AI-generated explanation from your configured provider. No copy-paste needed.',
  },
  {
    icon: GitBranch,
    title: 'Context Files Tree',
    desc: 'Pin files and directories as context for the current session. The model sees what you choose — nothing more.',
  },
  {
    icon: Plug,
    title: 'Desktop Bridge (optional)',
    desc: 'Connect to the AGI Workforce desktop app on port 8787. Unlock full computer use and agentic tool execution from within VS Code.',
  },
];

const slashCommands = [
  { cmd: '/explain', desc: 'Explain the selected code in plain language.' },
  { cmd: '/fix', desc: 'Find and fix bugs in the selection.' },
  { cmd: '/refactor', desc: 'Suggest or apply refactoring improvements.' },
  { cmd: '/tests', desc: 'Generate unit tests for the selected code.' },
  { cmd: '/docs', desc: 'Write JSDoc / docstrings for the selection.' },
  { cmd: '/model', desc: 'Switch the active provider and model.' },
];

const keybindings = [
  { keys: 'Ctrl+Shift+A', desc: 'Open AGI chat panel (when no diff open)' },
  { keys: 'Ctrl+Shift+A', desc: 'Accept diff suggestion (when diff open, editor focused)' },
  { keys: 'Ctrl+Shift+I', desc: 'Inline completion trigger' },
];

export default function VscodeExtensionPage() {
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
                <Code2 className="h-3.5 w-3.5" />
                VS Code Extension v0.3.0
              </div>

              <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[0.95] mb-6">
                Multi-provider AI
                <br />
                <span className="bg-gradient-to-r from-[#c8892a] via-[#e8af50] to-[#c8892a] bg-clip-text text-transparent">
                  coding assistant.
                </span>
              </h1>

              <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-4 leading-relaxed">
                {MARKETING.providers.display} providers in VS Code. Not locked to one model.
              </p>
              <p className="text-base text-zinc-500 max-w-xl mx-auto mb-6">
                53 commands, inline completions, code lens, @agi chat, and an optional bridge to
                your desktop agent.
              </p>

              {/* Honest marketplace status */}
              <div className="inline-flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-5 py-4 text-sm text-amber-300 mb-10 text-left max-w-xl">
                <Settings className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  <strong>VS Code Marketplace listing: not yet live.</strong> Install the current
                  build as a VSIX from GitHub Releases.
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href="https://github.com/siddharthanagula3/agiworkforce/releases"
                  className="group inline-flex h-12 items-center gap-2 rounded-md bg-[#c8892a] px-8 text-sm font-semibold text-black hover:bg-[#d4993a] transition-all"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Install via VSIX
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
              {extStats.map(({ label, value, sub }) => (
                <div key={label} className="bg-[#0c0c0e] p-6 text-center">
                  <div className="font-mono text-2xl font-bold text-[#c8892a] mb-1">{value}</div>
                  <div className="text-sm font-medium text-white mb-0.5">{label}</div>
                  <div className="text-xs text-zinc-600">{sub}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-24">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#c8892a] mb-3">
                Features
              </p>
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
                Every coding surface covered
              </h2>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-px bg-white/[0.05] max-w-7xl mx-auto">
              {features.map(({ icon: Icon, title, desc }) => (
                <div
                  key={title}
                  className="bg-[#09090b] p-7 flex flex-col hover:bg-[#0f0e0c] transition-colors"
                >
                  <Icon className="h-5 w-5 text-[#c8892a] mb-4" />
                  <h3 className="text-base font-semibold text-white mb-2">{title}</h3>
                  <p className="text-sm text-zinc-500 leading-relaxed flex-1">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Slash commands */}
        <section className="py-20 border-y border-white/[0.05] bg-[#0c0c0e]">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <div className="mb-10">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#c8892a] mb-2">
                  Slash commands
                </p>
                <h2 className="text-3xl font-bold tracking-tight">Inline actions</h2>
                <p className="text-zinc-500 text-sm mt-2">
                  Available in @agi chat, sidebar, and via code lens. Select code first, then run.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                {slashCommands.map(({ cmd, desc }) => (
                  <div key={cmd} className="rounded-xl border border-white/[0.06] bg-[#111114] p-5">
                    <code className="font-mono text-sm font-bold text-[#c8892a] block mb-2">
                      {cmd}
                    </code>
                    <p className="text-xs text-zinc-500 leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Keybindings */}
        <section className="py-24">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center gap-2 mb-8">
                <Keyboard className="h-5 w-5 text-[#c8892a]" />
                <h2 className="text-2xl font-bold">Keybindings</h2>
              </div>
              <p className="text-zinc-500 text-sm mb-8">
                13 keybindings total. The Ctrl+Shift+A binding has two mutually-exclusive contexts:
                chat (when no diff is open) and accept-diff (when a diff is open and editor is
                focused). No conflict.
              </p>

              <div className="space-y-3">
                {keybindings.map(({ keys, desc }) => (
                  <div
                    key={desc}
                    className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-[#0c0c0e] px-5 py-4"
                  >
                    <code className="font-mono text-sm font-medium text-zinc-200">{keys}</code>
                    <span className="text-sm text-zinc-500 text-right max-w-xs">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Providers */}
        <section className="py-20 border-y border-white/[0.05] bg-[#0c0c0e]">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#c8892a] mb-3">
                Provider support
              </p>
              <h2 className="text-3xl font-bold tracking-tight mb-2">
                {MARKETING.providers.display} providers, one picker
              </h2>
              <p className="text-zinc-500 text-sm mb-10 max-w-lg mx-auto">
                Same provider lineup as desktop and web. The auto-balanced default switches to the
                best available model per request type.
              </p>

              <div className="flex flex-wrap justify-center gap-3">
                {[
                  'Anthropic',
                  'OpenAI',
                  'Google',
                  'xAI',
                  'DeepSeek',
                  'Perplexity',
                  'Qwen',
                  'Moonshot',
                  'Zhipu',
                  'Ollama',
                  'LM Studio',
                ].map((p) => (
                  <div
                    key={p}
                    className="flex items-center gap-2 rounded-full border border-white/[0.06] bg-[#111114] px-4 py-2 text-sm text-zinc-300"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    {p}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Install VSIX steps */}
        <section className="py-24">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-2xl font-bold mb-2">Install via VSIX</h2>
              <p className="text-zinc-500 text-sm mb-8">
                The VS Code Marketplace listing is not yet live. Use VSIX from GitHub Releases.
              </p>

              <div className="space-y-4 mb-8">
                {[
                  'Download the latest .vsix file from GitHub Releases.',
                  'Open VS Code and go to the Extensions panel (Ctrl+Shift+X).',
                  'Click the "..." menu in the Extensions panel header.',
                  'Select "Install from VSIX..." and choose the downloaded file.',
                  'Reload VS Code. The AGI Workforce panel appears in the sidebar.',
                ].map((step, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-4 rounded-lg border border-white/[0.05] bg-[#0c0c0e] px-5 py-4"
                  >
                    <span className="shrink-0 w-6 h-6 rounded-full bg-[#c8892a]/20 flex items-center justify-center text-xs font-bold text-[#c8892a]">
                      {i + 1}
                    </span>
                    <p className="text-sm text-zinc-400 pt-0.5">{step}</p>
                  </div>
                ))}
              </div>

              <Link
                href="https://github.com/siddharthanagula3/agiworkforce/releases"
                className="inline-flex h-11 items-center gap-2 rounded-md bg-[#c8892a] px-7 text-sm font-semibold text-black hover:bg-[#d4993a] transition-all"
                target="_blank"
                rel="noopener noreferrer"
              >
                Download VSIX from GitHub
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 border-t border-white/[0.05] bg-[#0c0c0e]">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl font-bold tracking-tight mb-4">
              Already using the desktop app?
            </h2>
            <p className="text-zinc-400 mb-8 max-w-md mx-auto">
              Enable the desktop bridge in the extension settings to unlock full agentic tool
              execution from within VS Code.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="https://github.com/siddharthanagula3/agiworkforce/releases"
                className="inline-flex h-12 items-center gap-2 rounded-md bg-[#c8892a] px-8 text-sm font-semibold text-black hover:bg-[#d4993a] transition-all"
                target="_blank"
                rel="noopener noreferrer"
              >
                Install via VSIX
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/desktop"
                className="inline-flex h-12 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-8 text-sm font-medium text-zinc-400 hover:border-white/20 hover:text-white transition-all"
              >
                Get Desktop app
              </Link>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
