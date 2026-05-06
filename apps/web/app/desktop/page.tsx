import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  Monitor,
  Cpu,
  Shield,
  Zap,
  Globe,
  Terminal,
  Package,
  Layers,
  RefreshCw,
  Bot,
  Lock,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { MARKETING } from '@/lib/marketing-constants';

export const metadata: Metadata = {
  title: 'Desktop App | AGI Workforce',
  description:
    'Native desktop AI workspace for Mac, Windows, and Linux. Tauri v2 + Rust backend — not Electron. Local or Cloud mode. ' +
    MARKETING.appSize.display +
    ' app, 10+ providers, BYOK, computer use, MCP plugins.',
  alternates: { canonical: 'https://agiworkforce.com/desktop' },
  openGraph: {
    title: 'Desktop App | AGI Workforce',
    description:
      'Native AI workspace. Rust + Tauri v2, ' +
      MARKETING.appSize.display +
      ', 10+ providers, computer use, MCP plugins.',
    url: 'https://agiworkforce.com/desktop',
    type: 'website',
    images: [{ url: '/app-preview.png', width: 1200, height: 630, alt: 'AGI Workforce Desktop' }],
  },
};

const techStats = [
  { label: 'Binary size', value: MARKETING.appSize.display, sub: 'compiled Rust binary' },
  { label: 'Rust files', value: '737', sub: 'backend source' },
  { label: 'IPC commands', value: '1,469', sub: 'Tauri bindings' },
  { label: 'Component dirs', value: '84', sub: 'React frontend' },
];

const features = [
  {
    icon: Globe,
    title: MARKETING.providers.display + ' Providers',
    desc: 'Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Qwen, Moonshot, Zhipu, Ollama, LM Studio. Switch mid-conversation.',
  },
  {
    icon: Lock,
    title: 'BYOK + Local Mode',
    desc: 'Bring your own API keys (AES-256 encrypted locally) or run fully offline with Ollama and LM Studio. Zero data through AGI Workforce servers.',
  },
  {
    icon: Monitor,
    title: 'Computer Use',
    desc: 'Browser automation, keyboard control, screen capture, file I/O, terminal access. Six-layer ToolGuard safety tiers.',
  },
  {
    icon: Package,
    title: 'MCP Plugins',
    desc: 'Connect any MCP server over stdio, SSE, or HTTP. File systems, databases, APIs, browsers. No tool caps.',
  },
  {
    icon: Layers,
    title: 'Skills Marketplace',
    desc:
      MARKETING.skills.display +
      ' pre-built AI specialists across ' +
      MARKETING.categories.display +
      ' categories — engineering, marketing, finance, legal, creative, and more.',
  },
  {
    icon: RefreshCw,
    title: 'Conversation Sync',
    desc: 'Cloud mode enables cross-device sync and Dispatch: send a task from mobile, execute on desktop, watch results in real time.',
  },
  {
    icon: Bot,
    title: 'Agent Dispatch',
    desc: 'Spawn parallel AI agents for complex tasks. Decompose work into concurrent workstreams executed simultaneously.',
  },
  {
    icon: Shield,
    title: 'Privacy-First',
    desc: 'API keys encrypted with Argon2id + AES-GCM. Conversations stored locally. No training on your data.',
  },
];

const platforms = [
  {
    name: 'macOS',
    detail: 'DMG, signed Apple Developer ID D2PR62RLT4',
    status:
      'Pending — macOS signing secrets gap blocks shipping for v1.2.1. Check GitHub Releases for current artifacts.',
    statusColor: 'text-amber-400',
  },
  {
    name: 'Windows',
    detail: 'EXE installer',
    status: 'EV certificate pending.',
    statusColor: 'text-amber-400',
  },
  {
    name: 'Linux',
    detail: 'AppImage',
    status: 'Live now — v-desktop-1.2.0 ships Linux.',
    statusColor: 'text-emerald-400',
  },
];

export default function DesktopPage() {
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
                <Cpu className="h-3.5 w-3.5" />
                Tauri v2 + Rust — not Electron
              </div>

              <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[0.95] mb-6">
                Native desktop
                <br />
                <span className="bg-gradient-to-r from-[#c8892a] via-[#e8af50] to-[#c8892a] bg-clip-text text-transparent">
                  AI workspace.
                </span>
              </h1>

              <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-4 leading-relaxed">
                Mac, Windows, Linux. Local or Cloud.
              </p>
              <p className="text-base text-zinc-500 max-w-xl mx-auto mb-10">
                A {MARKETING.appSize.display} Rust binary that runs {MARKETING.providers.display} AI
                providers natively. No Chromium overhead. No 400 MB installer.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
                <Link
                  href="/download"
                  className="group inline-flex h-12 items-center gap-2 rounded-md bg-[#c8892a] px-8 text-sm font-semibold text-black transition-all hover:bg-[#d4993a]"
                >
                  Download
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="https://github.com/siddharthanagula3/agiworkforce"
                  className="inline-flex h-12 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-8 text-sm font-medium text-zinc-400 hover:border-white/20 hover:text-white transition-all"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub Releases
                </Link>
              </div>

              {/* Tech stats strip */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/[0.05] rounded-2xl overflow-hidden border border-white/[0.05]">
                {techStats.map(({ label, value, sub }) => (
                  <div key={label} className="bg-[#09090b] p-6 text-center">
                    <div className="font-mono text-2xl font-bold text-[#c8892a] mb-1">{value}</div>
                    <div className="text-sm font-medium text-white mb-0.5">{label}</div>
                    <div className="text-xs text-zinc-600">{sub}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Screenshots placeholder */}
        <section className="py-16 border-y border-white/[0.05] bg-[#0c0c0e]">
          <div className="container mx-auto px-4">
            <p className="text-center text-xs font-semibold uppercase tracking-[0.22em] text-[#c8892a] mb-10">
              App screenshots
            </p>
            <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
              <div className="aspect-video bg-zinc-900 rounded-lg border border-white/10 flex items-center justify-center text-zinc-600 text-sm">
                Screenshot: Chat interface
              </div>
              <div className="aspect-video bg-zinc-900 rounded-lg border border-white/10 flex items-center justify-center text-zinc-600 text-sm">
                Screenshot: Computer use in action
              </div>
              <div className="aspect-video bg-zinc-900 rounded-lg border border-white/10 flex items-center justify-center text-zinc-600 text-sm">
                Screenshot: Skills marketplace
              </div>
              <div className="aspect-video bg-zinc-900 rounded-lg border border-white/10 flex items-center justify-center text-zinc-600 text-sm">
                Screenshot: MCP plugin browser
              </div>
            </div>
          </div>
        </section>

        {/* Features grid */}
        <section className="py-24 md:py-32">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#c8892a] mb-3">
                Capabilities
              </p>
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
                Everything in one app
              </h2>
              <p className="text-zinc-400 mt-4 max-w-xl mx-auto">
                Not a wrapper around a single model. A full AI workforce platform.
              </p>
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

        {/* Rust vs Electron callout */}
        <section className="py-20 border-y border-white/[0.05] bg-[#0c0c0e]">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#c8892a]/20 bg-[#c8892a]/[0.06] px-3 py-1 text-sm text-[#c8892a] mb-6">
                <Zap className="h-3.5 w-3.5" />
                Built on Rust
              </div>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-6">
                {MARKETING.appSize.display} binary, not a 550 MB Electron bundle.
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  {
                    label: 'Binary size',
                    agi: MARKETING.appSize.display + ' Rust binary',
                    electron: '~550 MB (Chromium + Node)',
                  },
                  { label: 'RAM on startup', agi: '~80 MB', electron: '~400 MB' },
                  { label: 'Cold start', agi: '<1 sec', electron: '3-5 sec' },
                  { label: 'Memory safety', agi: 'Compile-time (Rust)', electron: 'Runtime GC' },
                ].map(({ label, agi, electron }) => (
                  <div
                    key={label}
                    className="rounded-xl border border-white/[0.06] bg-[#111114] p-5"
                  >
                    <div className="text-xs text-zinc-600 uppercase tracking-wider mb-3">
                      {label}
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-[10px] text-zinc-600 mb-0.5">AGI Workforce</div>
                        <div className="font-mono text-sm font-semibold text-emerald-400">
                          {agi}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-zinc-600 mb-0.5">Electron</div>
                        <div className="font-mono text-sm text-zinc-600">{electron}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Platform availability */}
        <section className="py-24">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-3xl font-bold tracking-tight mb-2">Download</h2>
              <p className="text-zinc-500 mb-10">
                Binaries are available through GitHub Releases. See below for platform-specific
                notes.
              </p>

              <div className="space-y-4 mb-10">
                {platforms.map(({ name, detail, status, statusColor }) => (
                  <div
                    key={name}
                    className="rounded-xl border border-white/[0.06] bg-[#0c0c0e] p-6 flex flex-col sm:flex-row sm:items-center gap-4"
                  >
                    <Terminal className="h-6 w-6 text-[#c8892a] shrink-0" />
                    <div className="flex-1">
                      <div className="font-semibold text-white mb-0.5">{name}</div>
                      <div className="text-sm text-zinc-500 mb-1">{detail}</div>
                      <div className={`text-xs ${statusColor}`}>{status}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 text-sm text-zinc-500 rounded-lg border border-white/[0.05] bg-[#0c0c0e] p-4">
                <Check className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>
                  Always check{' '}
                  <Link href="/download" className="text-[#c8892a] hover:underline">
                    agiworkforce.com/download
                  </Link>{' '}
                  or{' '}
                  <a
                    href="https://github.com/siddharthanagula3/agiworkforce/releases"
                    className="text-[#c8892a] hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    GitHub Releases
                  </a>{' '}
                  for the latest artifacts.
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 border-t border-white/[0.05] bg-[#0c0c0e]">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Ready to try it?</h2>
            <p className="text-zinc-400 mb-8 max-w-md mx-auto">
              Free download. No credit card. Connect any provider or run fully offline.
            </p>
            <Link
              href="/download"
              className="inline-flex h-12 items-center gap-2 rounded-md bg-[#c8892a] px-8 text-sm font-semibold text-black hover:bg-[#d4993a] transition-all"
            >
              Download free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
