'use client';

import { CheckCircle2, HardDrive, Info, Monitor, RotateCcw, Shield, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { DirectDownloadButtons } from '../../components/DirectDownloadButtons';
import { DownloadSection } from '../../components/DownloadSection';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

const APP_VERSION = '1.1.5';
const LAST_UPDATED = 'March 2026';

function getDownloadUrls() {
  return {
    mac: process.env['NEXT_PUBLIC_DOWNLOAD_URL_MAC'] || '/downloads/agiworkforce.dmg',
    windows: process.env['NEXT_PUBLIC_DOWNLOAD_URL_WINDOWS'] || '/api/download?platform=windows',
    linux: process.env['NEXT_PUBLIC_DOWNLOAD_URL_LINUX'] || '/api/download?platform=linux',
  };
}

interface TrustItem {
  label: string;
  value: string;
}

const releaseInfo: TrustItem[] = [
  { label: 'Version', value: `${APP_VERSION} (Early Access)` },
  { label: 'Last updated', value: LAST_UPDATED },
  { label: 'macOS', value: 'Universal binary (Apple Silicon + Intel), .dmg, ~120 MB' },
  { label: 'Windows', value: '64-bit installer, .exe, ~90 MB' },
  { label: 'Linux', value: 'AppImage, ~110 MB' },
];

interface SafetyItem {
  icon: React.ElementType;
  title: string;
  description: string;
}

const safetyItems: SafetyItem[] = [
  {
    icon: Shield,
    title: 'Code-signed by Apple',
    description:
      'The macOS build is signed with a Developer ID certificate (AGI Automation LLC) and notarized with Apple, so Gatekeeper will not block it.',
  },
  {
    icon: HardDrive,
    title: 'Your data stays local',
    description:
      'Conversations, API keys, and files never leave your machine. API keys are encrypted at rest with Argon2id + AES-256-GCM.',
  },
  {
    icon: RotateCcw,
    title: 'Every action is reversible',
    description:
      'The built-in undo manager tracks all AI actions - file writes, edits, and automations can be rolled back from inside the app.',
  },
  {
    icon: Trash2,
    title: 'Easy to uninstall',
    description:
      'macOS: drag AGI Workforce to Trash. Windows: standard Add/Remove Programs uninstaller. Linux: delete the AppImage file.',
  },
];

interface FirstLaunchItem {
  text: string;
}

const firstLaunchItems: FirstLaunchItem[] = [
  { text: 'Open the app and start chatting immediately - no configuration required.' },
  {
    text: 'Connect your own API key (OpenAI, Anthropic, Google, etc.) or use local models via Ollama.',
  },
  {
    text: 'No account required to try the app - sign up only if you want cloud sync and mobile access.',
  },
];

export default function DownloadPage() {
  const downloads = getDownloadUrls();

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <Header />

      <main className="flex flex-1 flex-col items-center px-4 pt-24 pb-20">
        <div className="w-full max-w-5xl space-y-16">
          {/* Page header */}
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-bold tracking-tight md:text-6xl bg-clip-text text-transparent bg-gradient-to-b from-white to-white/50">
              Download AGI Workforce
            </h1>
            <p className="text-zinc-400 text-lg max-w-2xl mx-auto leading-relaxed">
              A native desktop app for AI chat, browser automation, and task execution. Free during
              early access.
            </p>
          </div>

          {/* Download buttons */}
          <DownloadSection downloads={downloads} />

          {/* Direct download buttons */}
          <DirectDownloadButtons />

          {/* Release info grid */}
          <section aria-label="Release information">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 divide-y divide-zinc-800">
              {releaseInfo.map((item) => (
                <div
                  key={item.label}
                  className="flex flex-col sm:flex-row sm:items-center gap-1 px-6 py-4"
                >
                  <span className="w-36 shrink-0 text-sm font-medium text-zinc-400">
                    {item.label}
                  </span>
                  <span className="text-sm text-white">{item.value}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Before you install */}
          <section aria-label="Before you install">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-8 space-y-6">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#c8892a]/10">
                  <Info className="h-5 w-5 text-[#c8892a]" />
                </div>
                <h2 className="text-xl font-semibold">Before you install</h2>
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                {safetyItems.map((item) => (
                  <div key={item.title} className="flex gap-4">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                      <item.icon className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-white">{item.title}</p>
                      <p className="text-sm text-zinc-400 leading-relaxed">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* What to expect on first launch */}
          <section aria-label="What to expect on first launch">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-8 space-y-6">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#c8892a]/10">
                  <Monitor className="h-5 w-5 text-[#c8892a]" />
                </div>
                <h2 className="text-xl font-semibold">What to expect on first launch</h2>
              </div>

              <ul className="space-y-4">
                {firstLaunchItems.map((item) => (
                  <li key={item.text} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                    <span className="text-sm text-zinc-300 leading-relaxed">{item.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Terms / Privacy */}
          <div className="text-center text-sm text-zinc-500">
            <p>
              By downloading, you agree to our{' '}
              <Link
                href="/terms"
                className="text-zinc-400 underline underline-offset-2 hover:text-white transition-colors"
              >
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link
                href="/privacy"
                className="text-zinc-400 underline underline-offset-2 hover:text-white transition-colors"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
