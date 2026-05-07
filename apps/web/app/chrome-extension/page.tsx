import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Globe,
  Shield,
  Layers,
  Plug,
  MessageSquare,
  Bell,
  Code2,
  CheckCircle2,
  Lock,
  PuzzleIcon,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Chrome Extension | AGI Workforce',
  description:
    'AGI Workforce Chrome Extension — AI alongside every webpage. Manifest V3 v1.2.0. Side panel, content scripts, native messaging bridge. LinkedIn and Lever autofill. Chrome Web Store listing coming soon.',
  alternates: { canonical: 'https://agiworkforce.com/chrome-extension' },
  openGraph: {
    title: 'Chrome Extension | AGI Workforce',
    description:
      'AI alongside every webpage. Manifest V3 v1.2.0, 16 test suites, 521 tests. CWS listing coming soon.',
    url: 'https://agiworkforce.com/chrome-extension',
    type: 'website',
    images: [
      { url: '/app-preview.png', width: 1200, height: 630, alt: 'AGI Workforce Chrome Extension' },
    ],
  },
};

const extStats = [
  { label: 'Manifest', value: 'V3', sub: 'v1.2.0' },
  { label: 'Test suites', value: '16', sub: '521 tests' },
  { label: 'Package size', value: '101 KB', sub: 'no source maps' },
  { label: 'Build date', value: '2026-05-05', sub: 'CWS-ready' },
];

const features = [
  {
    icon: Layers,
    title: 'Side Panel',
    desc: 'Full-width side panel alongside any page. Chat, research, and take actions without leaving your current tab.',
  },
  {
    icon: MessageSquare,
    title: 'Popup + Content Scripts',
    desc: 'Quick-access popup for one-off questions. Content scripts read page context and inject actions directly.',
  },
  {
    icon: Plug,
    title: 'Native Messaging Bridge',
    desc: 'Connects to the AGI Workforce desktop app on port 8787. The extension sends intent; your desktop executes with full tool access. No LLM runs in the browser.',
  },
  {
    icon: Globe,
    title: 'Platform Assistants',
    desc: 'Context-aware assistants for Slack, Gmail, Google Calendar, Google Docs, and GitHub. Triggered automatically when you navigate to supported sites.',
  },
  {
    icon: Code2,
    title: 'LinkedIn + Lever Autofill',
    desc: 'One-click job application autofill on LinkedIn and Lever. Pulls your profile context and fills fields accurately.',
  },
  {
    icon: Shield,
    title: 'Security-First Architecture',
    desc: 'No LLM runs inside the extension. All inference goes through your desktop or cloud subscription. 50 innerHTML sites audited — all static or DOMPurify-sanitized.',
  },
  {
    icon: Lock,
    title: 'No Keys in Browser',
    desc: 'API keys never touch the Chrome extension process. Credentials live in the desktop vault, encrypted at rest.',
  },
  {
    icon: Bell,
    title: 'Background Service Worker',
    desc: 'Persistent service worker handles tab events, message routing, and desktop bridge communication without blocking the main thread.',
  },
];

const platformAssistants = [
  { name: 'Slack', desc: 'Compose messages, summarize threads, draft replies.' },
  { name: 'Gmail', desc: 'Write emails, summarize threads, suggest responses.' },
  { name: 'Google Calendar', desc: 'Prepare for meetings, draft agendas, summarize invites.' },
  { name: 'Google Docs', desc: 'Edit, expand, rewrite, or summarize document content.' },
  { name: 'GitHub', desc: 'Explain PRs, review diffs, suggest commit messages.' },
  { name: 'LinkedIn', desc: 'Autofill job applications. Draft outreach messages.' },
];

export default function ChromeExtensionPage() {
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
                <PuzzleIcon className="h-3.5 w-3.5" />
                Manifest V3 — v1.2.0
              </div>

              <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[0.95] mb-6">
                AI alongside
                <br />
                <span className="bg-gradient-to-r from-[#c8892a] via-[#e8af50] to-[#c8892a] bg-clip-text text-transparent">
                  every webpage.
                </span>
              </h1>

              <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-4 leading-relaxed">
                Side panel, content scripts, platform assistants, and a native messaging bridge to
                your desktop.
              </p>

              <p className="text-sm text-zinc-500 max-w-lg mx-auto mb-6">
                The extension is the interface. Your desktop is the brain. No LLM runs in the
                browser.
              </p>

              {/* Honest CWS status */}
              <div className="inline-flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-5 py-4 text-sm text-amber-300 mb-10 text-left max-w-xl">
                <PuzzleIcon className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  <strong>Chrome Web Store listing: not yet live.</strong> The extension.zip is
                  built and CWS-ready (2026-05-05). Install the dev build via GitHub Releases while
                  the listing is pending.
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                {/* Disabled/coming-soon primary CTA */}
                <div className="inline-flex h-12 items-center gap-2 rounded-md bg-zinc-800 px-8 text-sm font-semibold text-zinc-500 cursor-not-allowed select-none">
                  <PuzzleIcon className="h-4 w-4" />
                  Add to Chrome — coming soon
                </div>
                <Link
                  href="https://github.com/siddharthanagula3/agiworkforce/releases"
                  className="inline-flex h-12 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-8 text-sm font-medium text-zinc-400 hover:border-white/20 hover:text-white transition-all"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Install dev build
                  <ArrowRight className="h-4 w-4" />
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

        {/* Architecture callout */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto rounded-2xl border border-[#c8892a]/20 bg-[#c8892a]/[0.04] p-8 md:p-10">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#c8892a]/25 bg-[#c8892a]/[0.08] px-3 py-1 text-xs font-medium text-[#c8892a] mb-5">
                Architecture decision
              </div>
              <h2 className="text-2xl font-bold mb-3">No LLM in the extension.</h2>
              <p className="text-zinc-400 leading-relaxed mb-4">
                Running LLM inference inside a Chrome extension requires shipping API keys to the
                browser process — visible to other extensions, page scripts, and browser internals.
                We chose a different architecture: the extension is a thin UI layer that routes
                intent to your desktop app over a native messaging bridge on port 8787.
              </p>
              <p className="text-zinc-500 text-sm leading-relaxed">
                Your desktop has full tool access (browser automation, terminal, files), encrypted
                key storage, and a sandbox. The extension gets the results, not the keys.
              </p>
            </div>
          </div>
        </section>

        {/* Features grid */}
        <section className="py-16 border-y border-white/[0.05] bg-[#0c0c0e]">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#c8892a] mb-3">
                What it does
              </p>
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight">Features</h2>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-px bg-white/[0.05] max-w-7xl mx-auto">
              {features.map(({ icon: Icon, title, desc }) => (
                <div
                  key={title}
                  className="bg-[#0c0c0e] p-7 flex flex-col hover:bg-[#0f0e0c] transition-colors"
                >
                  <Icon className="h-5 w-5 text-[#c8892a] mb-4" />
                  <h3 className="text-base font-semibold text-white mb-2">{title}</h3>
                  <p className="text-sm text-zinc-500 leading-relaxed flex-1">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Platform assistants */}
        <section className="py-24">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-12">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#c8892a] mb-3">
                  Platform integrations
                </p>
                <h2 className="text-3xl font-bold tracking-tight mb-2">Context-aware assistants</h2>
                <p className="text-zinc-500 text-sm max-w-xl mx-auto">
                  The extension detects which site you are on and surfaces the right assistant
                  automatically.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                {platformAssistants.map(({ name, desc }) => (
                  <div
                    key={name}
                    className="rounded-xl border border-white/[0.06] bg-[#0c0c0e] p-5"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                      <span className="font-semibold text-white text-sm">{name}</span>
                    </div>
                    <p className="text-xs text-zinc-500 leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Install instructions */}
        <section className="py-20 border-y border-white/[0.05] bg-[#0c0c0e]">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-2xl font-bold mb-2">How to install the dev build</h2>
              <p className="text-zinc-500 text-sm mb-8">
                While the Chrome Web Store listing is pending, use the unpacked VSIX from GitHub
                Releases.
              </p>

              <div className="space-y-4">
                {[
                  'Download the latest extension.zip from GitHub Releases.',
                  'Unzip to a local folder.',
                  'Open Chrome and navigate to chrome://extensions.',
                  'Enable "Developer mode" in the top right.',
                  'Click "Load unpacked" and select the unzipped folder.',
                ].map((step, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-4 rounded-lg border border-white/[0.05] bg-[#111114] px-5 py-4"
                  >
                    <span className="shrink-0 w-6 h-6 rounded-full bg-[#c8892a]/20 flex items-center justify-center text-xs font-bold text-[#c8892a]">
                      {i + 1}
                    </span>
                    <p className="text-sm text-zinc-400 pt-0.5">{step}</p>
                  </div>
                ))}
              </div>

              <div className="mt-8">
                <Link
                  href="https://github.com/siddharthanagula3/agiworkforce/releases"
                  className="inline-flex h-11 items-center gap-2 rounded-md bg-[#c8892a] px-7 text-sm font-semibold text-black hover:bg-[#d4993a] transition-all"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Download from GitHub Releases
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl font-bold tracking-tight mb-4">Try the desktop app now.</h2>
            <p className="text-zinc-400 mb-8 max-w-md mx-auto">
              The extension works best alongside the desktop app. Download it first and set up your
              preferred provider.
            </p>
            <Link
              href="/desktop"
              className="inline-flex h-12 items-center gap-2 rounded-md bg-[#c8892a] px-8 text-sm font-semibold text-black hover:bg-[#d4993a] transition-all"
            >
              Get the desktop app
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
