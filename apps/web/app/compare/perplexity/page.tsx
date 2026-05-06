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
  title: 'AGI Workforce vs Perplexity | Honest Comparison',
  description:
    'AGI Workforce vs Perplexity: web search, multi-provider support, BYOK, local LLM, CLI, desktop, and pricing compared honestly.',
  alternates: { canonical: '/compare/perplexity' },
  openGraph: {
    title: 'AGI Workforce vs Perplexity | Honest Comparison',
    description:
      'Perplexity Search is the strongest answer-engine for current-knowledge queries. Our lane is multi-provider agent work, not Q&A search.',
    type: 'website',
    url: 'https://agiworkforce.com/compare/perplexity',
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
    us: `${MARKETING.providers.display} providers (Perplexity Sonar, Claude, GPT, Gemini, and more)`,
    them: 'Perplexity Sonar models with web search',
  },
  {
    capability: 'Live web search',
    us: 'Partial — via Perplexity Sonar (BYOK); not built-in for other providers',
    them: 'Yes — core product; real-time citations',
  },
  {
    capability: 'BYOK support',
    us: `All ${MARKETING.providers.display} cloud providers including Perplexity`,
    them: 'Subscription-only; no API key passthrough in chat',
  },
  {
    capability: 'Local LLM',
    us: 'Yes — Ollama + LM Studio (Desktop, free forever)',
    them: 'Not supported',
  },
  {
    capability: 'Cross-provider thread',
    us: 'Yes — mid-conversation, context preserved',
    them: 'Sonar models only; no cross-provider',
  },
  {
    capability: 'CLI',
    us: 'Yes — Rust, 22 subcommands, TUI',
    them: 'No CLI product',
  },
  {
    capability: 'Desktop app',
    us: 'Yes — Tauri, macOS / Windows / Linux',
    them: 'Yes — Perplexity desktop (Electron)',
  },
  {
    capability: 'Mobile app',
    us: 'Partial — iOS + Android (Expo, in progress)',
    them: 'Yes — Perplexity iOS + Android',
  },
  {
    capability: 'Computer use',
    us: 'Partial — browser, terminal, file I/O',
    them: 'Yes — Comet computer use',
  },
  {
    capability: 'Browser extension',
    us: 'Yes — Chrome MV3 v1.2.0',
    them: 'Yes — Perplexity Chrome extension',
  },
  {
    capability: 'VS Code extension',
    us: 'Yes — v0.3.0, multi-provider',
    them: 'No VS Code extension',
  },
  {
    capability: 'Free tier',
    us: 'Local mode: free forever. BYOK: free forever.',
    them: 'Free tier with limited searches',
  },
];

export default function ComparePerplexityPage() {
  return (
    <EditorialPage tier="mixed">
      {/* S1 — Review masthead */}
      <RuledSection tier="paper" id="compare-perplexity-hero">
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
              vs Perplexity.
            </span>
          </h1>

          <div className="mt-10">
            <Specimen dropCap columns={2}>
              <p>
                Perplexity Search is the strongest answer-engine for current-knowledge queries.
                Real-time web search with citations is genuinely better than anything a generalist
                platform offers for that specific workflow. Comet is a real computer-use product.
                The product polish on the search experience is exceptional. None of that is in
                dispute.
              </p>
              <p>
                The case for AGI Workforce is multi-provider agent work, not Q&amp;A search. When
                search is one tool in a longer agent chain, we can hand off to Perplexity's API as
                one of the providers. When local LLM is required, or when your task is coding and
                reasoning rather than web lookup, the multi-provider lane is ours.
              </p>
            </Specimen>
          </div>
        </div>
      </RuledSection>

      {/* S2 — When Perplexity wins */}
      <RuledSection tier="paper" slug={<Slug index="01" kicker="WHEN PERPLEXITY WINS" />}>
        <div className="py-14 md:py-20">
          <h2
            className="font-display text-2xl md:text-3xl mb-8"
            style={{ fontVariationSettings: '"wght" 600' }}
          >
            When to use Perplexity instead.
          </h2>

          <Specimen columns={2}>
            <p>
              If fact-checked search with real-time citations is your primary workflow, Perplexity
              is the purpose-built tool and currently does it better than any generalist platform.
              Perplexity Pro Search features (deeper research, more sources, academic mode) have no
              equivalent in AGI Workforce at present.
            </p>
            <p>
              Comet computer use for browsing is a real product. If browser-native computer use with
              search integration is the workflow, Perplexity's vertical focus on that use case makes
              it the right choice. Academic or factual research where source attribution is critical
              is also a Perplexity-first scenario.
            </p>
          </Specimen>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-0">
            {[
              'Live web search with real-time citations is your primary use case.',
              'You need Perplexity Pro Search features (deeper research, more sources).',
              'You want the most polished search-first interface optimized for Sonar.',
              'Academic or factual research where source attribution is critical.',
              'Comet browser computer use is the specific workflow you need.',
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

          {/* Honest callout */}
          <div className="mt-8 border border-[var(--color-rule-soft)] p-6">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-fg-quiet)] mb-3">
              Honest note
            </div>
            <p className="text-sm leading-relaxed text-[var(--color-fg-muted)]">
              For live search with citations, Perplexity is the purpose-built tool. If that is your
              main workflow, use Perplexity directly. AGI Workforce is the right choice when you
              need web search as one tool among many, not the entire product.
            </p>
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
              When search is one tool in a longer agent chain, bring your Perplexity API key, use
              Sonar for web research, then switch to Claude for writing and GPT for code. Full
              context preserved across every hop.
            </p>
            <p>
              Perplexity has no CLI, no VS Code extension, and no local model support. AGI Workforce
              covers the full developer surface: Rust CLI with 22 subcommands, VS Code extension at
              v0.3.0, and Ollama or LM Studio running locally at zero cost. When offline operation
              is required, Perplexity's core search product cannot function by definition.
            </p>
          </Specimen>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                title: 'Perplexity Sonar plus everything else',
                desc: 'Bring your Perplexity key. Use Sonar for web research, Claude for writing, GPT for code. One thread, full context.',
              },
              {
                title: 'Coding and development workflows',
                desc: 'No Perplexity CLI, no VS Code ext, no local model support. AGI Workforce covers the full developer surface.',
              },
              {
                title: 'Offline operation',
                desc: 'Live search requires internet by definition. Ollama and LM Studio run locally in AGI Workforce Desktop when offline.',
              },
              {
                title: 'Multi-provider strategy',
                desc: `Use the right model for each subtask. ${MARKETING.providers.display} providers in one thread. Perplexity is one of them.`,
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
            Accurate as of May 2026. Perplexity ships desktop app, mobile, Chrome ext, Comet
            computer use. Live search with real-time citations is their core strength.
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
                    Perplexity
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
            <MonoButton href="/providers" variant="ghost" prefix="./">
              See all providers
            </MonoButton>
          </div>
        </div>
      </RuledSection>

      {/* S5 — Dispatch */}
      <DispatchSection slugIndex="04" slugKicker="DISPATCH" />
    </EditorialPage>
  );
}
