import Link from 'next/link';
import type { Metadata } from 'next';
import { Download, ArrowRight, Newspaper, User } from 'lucide-react';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { MARKETING } from '../../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'Press & Brand | AGI Workforce',
  description:
    'AGI Workforce press resources: logo downloads, brand colors, tagline, founder bio, and press contact.',
  alternates: { canonical: 'https://agiworkforce.com/press' },
};

const colorPalette = [
  { name: 'Primary Accent', hex: '#c8892a', sample: 'bg-[#c8892a]', text: 'text-black' },
  {
    name: 'Background Black',
    hex: '#09090b',
    sample: 'bg-[#09090b] border border-[#1a1917]',
    text: 'text-[#edebe8]',
  },
  { name: 'Off-white', hex: '#edebe8', sample: 'bg-[#edebe8]', text: 'text-[#09090b]' },
  { name: 'Subtle Gray', hex: '#888480', sample: 'bg-[#888480]', text: 'text-black' },
  { name: 'Dark Border', hex: '#1a1917', sample: 'bg-[#1a1917]', text: 'text-[#edebe8]' },
];

export default function PressPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#09090b] text-[#edebe8]">
      <Header />
      <main className="flex-1 pt-24">
        {/* Hero */}
        <section className="py-16 md:py-24">
          <div className="container mx-auto px-4 text-center">
            <div className="mb-4 inline-flex items-center rounded-md border border-[#555150]/40 bg-[#555150]/10 px-3 py-1 text-sm text-[#c8892a]">
              <Newspaper className="mr-2 h-4 w-4" />
              Press
            </div>
            <h1 className="mx-auto max-w-2xl text-4xl font-bold tracking-tight text-[#edebe8] md:text-5xl">
              Press and brand resources.
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-[#888480]">
              Everything you need to write about AGI Workforce accurately and quickly.
            </p>
          </div>
        </section>

        <div className="container mx-auto px-4 pb-24">
          <div className="mx-auto max-w-3xl space-y-12">
            {/* About section */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-[#edebe8]">About AGI Workforce</h2>
              <div className="rounded-xl border border-[#1a1917] bg-black/50 p-6 text-sm text-[#888480] leading-relaxed space-y-3">
                <p>
                  <strong className="text-[#edebe8]">AGI Workforce</strong> is a multi-surface AI
                  agent platform built by AGI Automation LLC (Austin, TX). It unifies{' '}
                  {MARKETING.providers.display} AI providers (including Anthropic, OpenAI, Google,
                  xAI, DeepSeek, Perplexity, Ollama, and more) into one interface across{' '}
                  {MARKETING.surfaces.display} surfaces: Desktop, Web, Mobile, CLI, Chrome
                  extension, and VS Code extension.
                </p>
                <p>
                  Unlike single-provider tools, AGI Workforce lets users switch between AI models
                  mid-conversation, bring their own API keys (BYOK), or run entirely locally with
                  Ollama or LM Studio at no cost.
                </p>
                <p>
                  <strong className="text-[#edebe8]">Tagline:</strong> &ldquo;{MARKETING.tagline}
                  &rdquo;
                </p>
                <p>
                  <strong className="text-[#edebe8]">Founded:</strong> 2025.{' '}
                  <strong className="text-[#edebe8]">Headquarters:</strong> Austin, TX, USA.
                </p>
              </div>
            </section>

            {/* Tagline */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-[#edebe8]">Official tagline</h2>
              <div className="rounded-xl border border-[#c8892a]/30 bg-[#c8892a]/5 p-6">
                <p className="font-serif text-2xl text-[#edebe8] italic">
                  &ldquo;{MARKETING.tagline}&rdquo;
                </p>
                <p className="mt-2 text-xs text-[#888480]">
                  Please use this tagline verbatim in coverage.
                </p>
              </div>
            </section>

            {/* Brand colors */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-[#edebe8]">Brand colors</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {colorPalette.map((color) => (
                  <div
                    key={color.name}
                    className="overflow-hidden rounded-xl border border-[#1a1917]"
                  >
                    <div className={`h-16 ${color.sample} flex items-center justify-center`}>
                      <span className={`font-mono text-sm font-bold ${color.text}`}>
                        {color.hex}
                      </span>
                    </div>
                    <div className="bg-black/50 px-3 py-2">
                      <div className="text-sm font-medium text-[#edebe8]">{color.name}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Logo download */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-[#edebe8]">Logo downloads</h2>
              <div className="rounded-xl border border-[#1a1917] bg-black/50 p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#c8892a]/10 border border-[#c8892a]/20">
                      <Download className="h-5 w-5 text-[#c8892a]" />
                    </div>
                    <div>
                      <div className="font-medium text-[#edebe8]">Brand assets (ZIP)</div>
                      <div className="text-xs text-[#555150]">
                        Logo (SVG + PNG), wordmark, icon variants
                      </div>
                    </div>
                  </div>
                  <span className="rounded-full border border-[#555150]/40 px-3 py-1 text-xs text-[#888480]">
                    Coming soon
                  </span>
                </div>
                <p className="mt-3 text-xs text-[#555150]">
                  Logo package is being finalized. Contact press@agiworkforce.com to request assets
                  before then.
                </p>
              </div>
            </section>

            {/* Founder bio */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-[#edebe8]">Founder</h2>
              <div className="flex items-start gap-4 rounded-xl border border-[#1a1917] bg-black/50 p-6">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#c8892a]/10 border border-[#c8892a]/20">
                  <User className="h-6 w-6 text-[#c8892a]" />
                </div>
                <div>
                  <div className="font-semibold text-[#edebe8]">Siddhartha Nagula</div>
                  <div className="mb-2 text-sm text-[#c8892a]">
                    Founder and CEO, AGI Automation LLC
                  </div>
                  <p className="text-sm text-[#888480]">
                    Building AGI Workforce from Austin, TX. Focused on multi-provider AI tooling
                    that gives teams control over which models they use, on which surfaces, without
                    vendor lock-in.
                  </p>
                </div>
              </div>
            </section>

            {/* Press contact */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-[#edebe8]">Press contact</h2>
              <div className="rounded-xl border border-[#1a1917] bg-[#09090b] p-6">
                <p className="mb-4 text-sm text-[#888480]">
                  For press inquiries, interview requests, and media partnerships, please contact us
                  directly. We respond to all press inquiries.
                </p>
                <div className="flex flex-wrap gap-3">
                  <a
                    href="mailto:press@agiworkforce.com"
                    className="inline-flex items-center gap-2 rounded-md bg-[#c8892a] px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-[#c8892a]/90"
                  >
                    press@agiworkforce.com
                  </a>
                  <Link
                    href="/contact"
                    className="inline-flex items-center gap-2 rounded-md border border-[#1a1917] px-4 py-2 text-sm font-medium text-[#888480] transition-colors hover:bg-[#1a1917] hover:text-[#edebe8]"
                  >
                    Contact form
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
