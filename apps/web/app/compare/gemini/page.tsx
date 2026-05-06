import type { Metadata } from 'next';
import Link from 'next/link';

import { MARKETING } from '@/lib/marketing-constants';
import { EditorialPage } from '@/components/marketing/editorial/EditorialPage';
import { RuledSection } from '@/components/marketing/editorial/RuledSection';
import { Slug } from '@/components/marketing/editorial/Slug';
import { Specimen } from '@/components/marketing/editorial/Specimen';
import { MonoButton } from '@/components/marketing/editorial/MonoButton';
import { DispatchSection } from '@/components/marketing/editorial/DispatchSection';

export const metadata: Metadata = {
  title: 'AGI Workforce vs Gemini | Honest Comparison',
  description:
    'AGI Workforce vs Google Gemini: multi-provider support, BYOK, local LLM, cross-provider thread, CLI, desktop, and pricing compared honestly.',
  alternates: { canonical: '/compare/gemini' },
  openGraph: {
    title: 'AGI Workforce vs Gemini | Honest Comparison',
    description:
      'Gemini has the longest context window in production and deep Google Workspace integration. Our lane is running Gemini alongside eleven other providers.',
    type: 'website',
    url: 'https://agiworkforce.com/compare/gemini',
  },
};

interface ScorecardRow {
  capability: string;
  us: string;
  them: string;
}

const scorecard: ScorecardRow[] = [
  {
    capability: 'Models available',
    us: `${MARKETING.providers.display} providers (Gemini, Claude, GPT, Grok, DeepSeek, and more)`,
    them: 'Gemini family only',
  },
  {
    capability: 'BYOK support',
    us: `All ${MARKETING.providers.display} cloud providers`,
    them: 'Subscription-only; no API key passthrough',
  },
  {
    capability: 'Local LLM',
    us: 'Yes — Ollama + LM Studio (Desktop, free forever)',
    them: 'Not supported',
  },
  {
    capability: 'Cross-provider thread',
    us: 'Yes — mid-conversation, context preserved',
    them: 'Gemini models only',
  },
  {
    capability: 'CLI',
    us: 'Yes — Rust, 22 subcommands, TUI',
    them: 'Yes — Gemini CLI (Node.js)',
  },
  {
    capability: 'Desktop app',
    us: 'Yes — Tauri, macOS / Windows / Linux',
    them: 'No — web app only',
  },
  {
    capability: 'Mobile app',
    us: 'Partial — iOS + Android (Expo, in progress)',
    them: 'Yes — Google Gemini iOS + Android',
  },
  {
    capability: 'Computer use',
    us: 'Partial — browser, terminal, file I/O',
    them: 'Partial — Project Astra features, limited GA',
  },
  {
    capability: 'Browser extension',
    us: 'Yes — Chrome MV3 v1.2.0',
    them: 'Partial — Gemini in Chrome sidebar',
  },
  {
    capability: 'VS Code extension',
    us: 'Yes — v0.3.0, multi-provider',
    them: 'Yes — Gemini Code Assist for VS Code',
  },
  {
    capability: 'Google Workspace integration',
    us: 'Not built-in (route via BYOK)',
    them: 'Yes — deep Docs/Sheets/Gmail/Calendar',
  },
  {
    capability: 'Free tier',
    us: 'Local mode: free forever. BYOK: free forever.',
    them: 'Gemini free tier exists',
  },
];

export default function CompareGeminiPage() {
  return (
    <EditorialPage tier="mixed">
      {/* S1 — Review masthead */}
      <RuledSection tier="paper" id="compare-gemini-hero">
        <div className="py-4 pb-2">
          <Link
            href="/compare"
            className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-fg-quiet)] hover:text-[var(--color-ink)] transition-colors"
          >
            ← All comparisons
          </Link>
        </div>
        <div className="pt-4 pb-16 md:pb-24 max-w-3xl">
          <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-fg-quiet)] mb-6">
            REVIEW · 2026-05-05
          </div>

          <h1 className="font-display leading-[0.95] tracking-tight">
            <span
              className="block text-[clamp(2rem,6vw,4rem)]"
              style={{ fontVariationSettings: '"wght" 400' }}
            >
              AGI Workforce
            </span>
            <span
              className="block italic text-[clamp(2rem,6vw,4rem)] border-b-[3px] border-[var(--color-rule)] pb-1 mt-1"
              style={{ fontVariationSettings: '"wght" 700' }}
            >
              vs Gemini.
            </span>
          </h1>

          <div className="mt-10">
            <Specimen dropCap columns={2}>
              <p>
                Gemini has the longest context window in production and Google integration is
                unmatched. Drive, Gmail, Calendar, Docs, and Sheets all connect natively. Gemini
                Code Assist is solid in JetBrains and VS Code. The multimodal capabilities across
                image, audio, and video are genuinely ahead of most alternatives. None of that is in
                dispute.
              </p>
              <p>
                The case for AGI Workforce is multi-provider routing. Gemini becomes one of twelve
                providers in one thread. When context fits in 200K and you would rather route to
                Claude or GPT for a specific turn, the interface handles it. When Google account is
                not the auth boundary you want, AGI Workforce does not require it.
              </p>
            </Specimen>
          </div>
        </div>
      </RuledSection>

      {/* S2 — When Gemini wins */}
      <RuledSection tier="paper" slug={<Slug index="01" kicker="WHEN GEMINI WINS" />}>
        <div className="py-14 md:py-20">
          <h2
            className="font-display text-2xl md:text-3xl mb-8"
            style={{ fontVariationSettings: '"wght" 600' }}
          >
            When to use Gemini instead.
          </h2>

          <Specimen columns={2}>
            <p>
              The 2M-token context window is Gemini's most defensible edge. If your task genuinely
              requires scanning a full codebase or a long document collection in one context,
              Gemini's native infrastructure handles that at scale in a way that has no equivalent
              elsewhere.
            </p>
            <p>
              Deep Google Workspace integration is the other unambiguous win. If your entire
              workflow lives in Docs, Sheets, Gmail, and Calendar and you want AI natively in those
              surfaces, Gemini Advanced is the right choice. Cheapest frontier-tier inference via
              Google AI API is also worth noting for cost-sensitive workloads.
            </p>
          </Specimen>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-0">
            {[
              'You live in Google Workspace and want deep Docs/Sheets/Gmail integration.',
              'Your task requires the 2M-token context window at scale.',
              'You rely on Gemini Code Assist and it covers your IDE needs.',
              "You need Google's native multimodal features (image, audio, video) natively.",
              'Google-managed privacy and compliance are required for your enterprise data.',
            ].map((item) => (
              <div
                key={item}
                className="border-b border-[var(--color-rule-soft)] py-4 pr-8 flex items-start gap-3"
              >
                <span className="font-mono text-[var(--color-fg-quiet)] mt-0.5 shrink-0">—</span>
                <span className="text-sm leading-relaxed text-[var(--color-fg-muted)]">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </RuledSection>

      {/* S3 — When AGI Workforce wins */}
      <RuledSection tier="paper" slug={<Slug index="02" kicker="WHEN AGI WORKFORCE WINS" />}>
        <div className="py-14 md:py-20">
          <h2
            className="font-display text-2xl md:text-3xl mb-8"
            style={{ fontVariationSettings: '"wght" 600' }}
          >
            When the multi-provider lane wins.
          </h2>

          <Specimen columns={2}>
            <p>
              When context fits in 200K and you would rather route to Claude for reasoning or GPT
              for code on that specific turn, AGI Workforce handles the routing. Use Gemini for
              long-document analysis, Claude for planning, GPT for code review. One thread, no
              context loss.
            </p>
            <p>
              BYOK means your Google API key stays your key. You pay Google directly at published
              rates. No Gemini Advanced subscription needed for API access. And when Google account
              is not the auth boundary you want, local mode on Desktop requires no account at all.
            </p>
          </Specimen>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                title: 'Gemini alongside every other provider',
                desc: 'Gemini for long-document analysis, Claude for reasoning, GPT for code review. One thread, no context loss.',
              },
              {
                title: 'BYOK: your Google key, your cost',
                desc: 'Bring your Google AI API key. Pay Google directly at published rates. No Gemini Advanced subscription required.',
              },
              {
                title: 'Native desktop app',
                desc: 'Gemini has no native desktop app. AGI Workforce Desktop runs natively on macOS, Windows, and Linux with local storage.',
              },
              {
                title: 'Local fallback when offline',
                desc: 'No internet? Ollama or LM Studio runs on your machine. Same AGI Workforce interface, zero cloud dependency.',
              },
            ].map(({ title, desc }) => (
              <div key={title} className="border border-[var(--color-rule-soft)] p-6">
                <div
                  className="font-display text-base mb-2"
                  style={{ fontVariationSettings: '"wght" 600' }}
                >
                  {title}
                </div>
                <p className="text-sm leading-relaxed text-[var(--color-fg-muted)]">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </RuledSection>

      {/* S4 — Scorecard */}
      <RuledSection tier="graphite" slug={<Slug index="03" kicker="SCORECARD" />}>
        <div className="py-14 md:py-20">
          <h2
            className="font-display text-2xl md:text-3xl mb-6 text-[var(--color-cream-on-graphite)]"
            style={{ fontVariationSettings: '"wght" 600' }}
          >
            Side by side.
          </h2>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-fg-quiet)] mb-8">
            Accurate as of May 2026. Google ships Gemini mobile, VS Code ext (Code Assist), Chrome
            sidebar, Gemini CLI. We acknowledge all of these.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-rule-soft)]">
                  <th className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-fg-quiet)] text-left py-3 pr-6 w-[30%]">
                    Capability
                  </th>
                  <th className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-amber-text)] text-left py-3 px-4 w-[35%]">
                    AGI Workforce
                  </th>
                  <th className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-fg-quiet)] text-left py-3 px-4 w-[35%]">
                    Gemini
                  </th>
                </tr>
              </thead>
              <tbody>
                {scorecard.map((row, i) => (
                  <tr
                    key={row.capability}
                    className={[
                      'border-b border-[var(--color-rule-soft)]',
                      i % 2 === 0 ? 'bg-white/[0.02]' : '',
                    ].join(' ')}
                  >
                    <td className="font-mono text-[11px] text-[var(--color-fg-muted)] py-3 pr-6 align-top">
                      {row.capability}
                    </td>
                    <td className="text-[13px] text-[var(--color-amber-text)] py-3 px-4 align-top leading-snug">
                      {row.us}
                    </td>
                    <td className="text-[13px] text-[var(--color-fg-muted)] py-3 px-4 align-top leading-snug">
                      {row.them}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-10 flex flex-col sm:flex-row gap-4">
            <MonoButton href="/byok" variant="primary" prefix="./">
              Learn about BYOK
            </MonoButton>
            <MonoButton href="/download" variant="ghost" prefix="./">
              Download free
            </MonoButton>
          </div>
        </div>
      </RuledSection>

      {/* S5 — Dispatch */}
      <DispatchSection slugIndex="04" slugKicker="DISPATCH" />
    </EditorialPage>
  );
}
