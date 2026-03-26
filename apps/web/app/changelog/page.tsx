import Link from 'next/link';
import type { Metadata } from 'next';
import { Bot, ArrowRight } from 'lucide-react';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Changelog',
  description:
    'See what is new in AGI Workforce. Release notes, new features, bug fixes, and improvements for the desktop AI assistant.',
  alternates: { canonical: '/changelog' },
  openGraph: {
    title: 'Changelog | AGI Workforce',
    description:
      'Release notes and updates for AGI Workforce. New features, improvements, and bug fixes.',
    type: 'website',
    url: '/changelog',
  },
  twitter: {
    card: 'summary',
    title: 'Changelog | AGI Workforce',
    description: 'Release notes and updates for AGI Workforce.',
  },
};

interface Release {
  version: string;
  date: string;
  tag: 'latest' | 'stable' | 'beta';
  highlights: string[];
}

const releases: Release[] = [
  {
    version: '1.1.5',
    date: 'March 2026',
    tag: 'latest',
    highlights: [
      'Stabilization sprint: 484 commands, 150 skills, 8 security fixes',
      'Resolved 10 failing Rust tests for CI',
      'Fixed imageproc dependency (yanked crate audit)',
      'Address 34 code review findings across 13 files',
    ],
  },
  {
    version: '1.1.0',
    date: 'February 2026',
    tag: 'stable',
    highlights: [
      'Multi-model chat with 25+ providers',
      'Parallel agent orchestration (swarm engine)',
      'AI skills across multiple categories',
      'Unlimited MCP tool support (stdio + SSE + HTTP)',
      'Mobile companion app with QR pairing',
    ],
  },
  {
    version: '1.0.0',
    date: 'January 2026',
    tag: 'stable',
    highlights: [
      'Initial public release',
      'Native desktop app for macOS, Windows, and Linux',
      'Browser automation with Playwright',
      'Terminal and file system tools',
      'Voice input with Whisper transcription',
    ],
  },
];

function TagBadge({ tag }: { tag: Release['tag'] }) {
  const styles = {
    latest: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    stable: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    beta: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[tag]}`}
    >
      {tag}
    </span>
  );
}

export default function ChangelogPage() {
  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: 'Changelog',
            description:
              'Release notes and updates for AGI Workforce. New features, improvements, and bug fixes.',
            url: 'https://agiworkforce.com/changelog',
          }),
        }}
      />
      <Header />

      <main className="flex-1 pt-24 pb-12">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="mb-12 text-center">
            <div className="mb-4 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-blue-400">
              <Bot className="mr-2 h-4 w-4" />
              Release Notes
            </div>
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Changelog</h1>
            <p className="mt-4 text-lg text-zinc-400">
              New features, improvements, and fixes in each release of AGI Workforce.
            </p>
          </div>

          <div className="space-y-12">
            {releases.map((release) => (
              <article
                key={release.version}
                className="relative rounded-2xl border border-zinc-800 bg-zinc-950/50 p-8"
              >
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-bold">v{release.version}</h2>
                  <TagBadge tag={release.tag} />
                  <span className="text-sm text-zinc-500">{release.date}</span>
                </div>
                <ul className="space-y-3">
                  {release.highlights.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-zinc-300">
                      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-blue-500" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <div className="mt-16 text-center">
            <p className="text-zinc-500">
              Want to try the latest version?{' '}
              <Link
                href="/download"
                className="text-blue-400 underline underline-offset-2 hover:text-blue-300 transition-colors"
              >
                Download AGI Workforce
              </Link>
            </p>
          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
