import type { Metadata } from 'next';

import { MARKETING } from '@/lib/marketing-constants';
import { EditorialPage } from '@/components/marketing/editorial/EditorialPage';
import { RuledSection } from '@/components/marketing/editorial/RuledSection';
import { Slug } from '@/components/marketing/editorial/Slug';
import { Specimen } from '@/components/marketing/editorial/Specimen';
import { OpsizMorph } from '@/components/marketing/editorial/OpsizMorph';
import { MonoButton } from '@/components/marketing/editorial/MonoButton';
import { DispatchSection } from '@/components/marketing/editorial/DispatchSection';

export const metadata: Metadata = {
  title: 'How we compare | AGI Workforce',
  description:
    'Comparative reviews. AGI Workforce vs Claude, ChatGPT, Gemini, Perplexity — honestly.',
  alternates: { canonical: '/compare' },
  openGraph: {
    title: 'How we compare | AGI Workforce',
    description:
      'Comparative reviews. AGI Workforce vs Claude, ChatGPT, Gemini, Perplexity — honestly.',
    type: 'website',
    url: 'https://agiworkforce.com/compare',
  },
};

const reviews = [
  {
    slug: 'claude',
    kicker: 'VS · CLAUDE',
    headline: "Anthropic's Claude.",
    summary:
      "The strongest single model for nuanced reasoning and long-context work. Anthropic's product polish is exceptional.",
    href: '/compare/claude',
  },
  {
    slug: 'chatgpt',
    kicker: 'VS · CHATGPT',
    headline: "OpenAI's ChatGPT.",
    summary:
      'The most polished consumer AI product in the world. Ships GPT models broadly with voice, image gen, and custom GPTs.',
    href: '/compare/chatgpt',
  },
  {
    slug: 'gemini',
    kicker: 'VS · GEMINI',
    headline: "Google's Gemini.",
    summary:
      'Longest context window in production. Deep Google Workspace integration and multimodal capabilities.',
    href: '/compare/gemini',
  },
  {
    slug: 'perplexity',
    kicker: 'VS · PERPLEXITY',
    headline: 'Perplexity Search.',
    summary:
      'The strongest answer-engine for current-knowledge queries. Real-time web search with citations is genuinely best-in-class.',
    href: '/compare/perplexity',
  },
];

type ScorecardCell = string;

interface ScorecardRow {
  capability: string;
  us: ScorecardCell;
  claude: ScorecardCell;
  chatgpt: ScorecardCell;
  gemini: ScorecardCell;
  perplexity: ScorecardCell;
}

const scorecard: ScorecardRow[] = [
  {
    capability: 'Provider lock-in',
    us: 'None — 12 wired',
    claude: 'Anthropic only',
    chatgpt: 'OpenAI only',
    gemini: 'Google only',
    perplexity: 'OpenAI/Anthropic, no BYOK',
  },
  {
    capability: 'BYOK support',
    us: 'Yes',
    claude: 'No',
    chatgpt: 'Partial (API only)',
    gemini: 'No',
    perplexity: 'No',
  },
  {
    capability: 'Local LLM',
    us: 'Yes — Ollama + LM Studio',
    claude: 'No',
    chatgpt: 'No',
    gemini: 'No',
    perplexity: 'No',
  },
  {
    capability: 'Cross-provider thread',
    us: 'Yes',
    claude: 'No',
    chatgpt: 'No',
    gemini: 'No',
    perplexity: 'No',
  },
  {
    capability: 'Native CLI',
    us: 'Yes — Rust',
    claude: 'Yes — Claude Code',
    chatgpt: 'Yes — Codex CLI',
    gemini: 'Yes — Code Assist',
    perplexity: 'No',
  },
  {
    capability: 'Native desktop',
    us: 'Yes — Tauri',
    claude: 'Yes',
    chatgpt: 'No (web only)',
    gemini: 'No',
    perplexity: 'Yes',
  },
  {
    capability: 'Mobile companion',
    us: 'Partial',
    claude: 'Yes — Dispatch',
    chatgpt: 'Yes',
    gemini: 'Yes',
    perplexity: 'Yes',
  },
  {
    capability: 'Computer use',
    us: 'Partial',
    claude: 'Yes — Cowork (GA)',
    chatgpt: 'No',
    gemini: 'No',
    perplexity: 'Yes — Comet',
  },
  {
    capability: 'Browser extension',
    us: 'Yes',
    claude: 'Yes',
    chatgpt: 'No',
    gemini: 'No',
    perplexity: 'Yes',
  },
  {
    capability: 'VS Code extension',
    us: 'Yes',
    claude: 'Yes',
    chatgpt: 'Yes — Copilot',
    gemini: 'Yes — Code Assist',
    perplexity: 'No',
  },
];

export default function ComparePage() {
  return (
    <EditorialPage tier="mixed">
      {/* S1 — Masthead */}
      <RuledSection tier="paper" id="compare-hero">
        <div className="py-16 md:py-24 max-w-3xl">
          <h1 className="font-display leading-[0.95] tracking-tight">
            <span
              className="block text-[clamp(2.5rem,7vw,4.5rem)]"
              style={{ fontVariationSettings: '"wght" 400' }}
            >
              Comparative
            </span>
            <span
              className="block italic text-[clamp(2.5rem,7vw,4.5rem)] border-b-[3px] border-[var(--color-rule)] pb-1 mt-1"
              style={{ fontVariationSettings: '"wght" 700' }}
            >
              Reviews.
            </span>
          </h1>

          <div className="mt-10 max-w-2xl">
            <Specimen columns={2}>
              <p>
                The other AI tools are not bad. Each ships real value at its lane. The case for AGI
                Workforce is the routing across all of them — that lane was empty until we shipped.
              </p>
            </Specimen>
          </div>
        </div>
      </RuledSection>

      {/* S2 — Index of reviews */}
      <RuledSection tier="paper" slug={<Slug index="01" kicker="REVIEWS" />}>
        <div className="py-14 md:py-20">
          <OpsizMorph as="h2" className="text-2xl md:text-3xl mb-10">
            Four reviews. One honest lane.
          </OpsizMorph>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
            {reviews.map((r) => (
              <div key={r.slug} className="border border-[var(--color-rule-soft)] p-8 group">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-fg-quiet)] mb-4">
                  {r.kicker}
                </div>
                <h3
                  className="font-display text-xl md:text-2xl mb-3"
                  style={{ fontVariationSettings: '"wght" 600' }}
                >
                  {r.headline}
                </h3>
                <p className="text-sm leading-relaxed text-[var(--color-fg-muted)] mb-6">
                  {r.summary}
                </p>
                <MonoButton variant="ghost" href={r.href} prefix="→">
                  Read review
                </MonoButton>
              </div>
            ))}
          </div>
        </div>
      </RuledSection>

      {/* S3 — Shared scorecard */}
      <RuledSection tier="graphite" slug={<Slug index="02" kicker="SCORECARD" />}>
        <div className="py-14 md:py-20">
          <h2
            className="font-display text-2xl md:text-3xl mb-8 text-[var(--color-cream-on-graphite)]"
            style={{ fontVariationSettings: '"wght" 600' }}
          >
            All four at once.
          </h2>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-fg-quiet)] mb-8">
            Accurate as of May 2026. We acknowledge every product listed.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-rule-soft)]">
                  <th className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-fg-quiet)] text-left py-3 pr-4 w-[22%]">
                    Capability
                  </th>
                  <th className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-amber-text)] text-left py-3 px-3 w-[18%]">
                    AGI Workforce
                  </th>
                  <th className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-fg-quiet)] text-left py-3 px-3 w-[15%]">
                    Claude
                  </th>
                  <th className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-fg-quiet)] text-left py-3 px-3 w-[15%]">
                    ChatGPT
                  </th>
                  <th className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-fg-quiet)] text-left py-3 px-3 w-[15%]">
                    Gemini
                  </th>
                  <th className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-fg-quiet)] text-left py-3 px-3 w-[15%]">
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
                    <td className="font-mono text-[11px] text-[var(--color-fg-muted)] py-3 pr-4 align-top">
                      {row.capability}
                    </td>
                    <td className="text-[13px] text-[var(--color-amber-text)] py-3 px-3 align-top leading-snug">
                      {row.us}
                    </td>
                    <td className="text-[13px] text-[var(--color-fg-muted)] py-3 px-3 align-top leading-snug">
                      {row.claude}
                    </td>
                    <td className="text-[13px] text-[var(--color-fg-muted)] py-3 px-3 align-top leading-snug">
                      {row.chatgpt}
                    </td>
                    <td className="text-[13px] text-[var(--color-fg-muted)] py-3 px-3 align-top leading-snug">
                      {row.gemini}
                    </td>
                    <td className="text-[13px] text-[var(--color-fg-muted)] py-3 px-3 align-top leading-snug">
                      {row.perplexity}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="font-mono text-[10px] tracking-[0.12em] text-[var(--color-fg-quiet)] mt-6">
            {MARKETING.providers.display} providers wired. {MARKETING.surfaces.display} surfaces.
            Our differentiation is multi-provider routing — not single-product superiority.
          </p>
        </div>
      </RuledSection>

      {/* S4 — Dispatch */}
      <DispatchSection slugIndex="03" slugKicker="DISPATCH" />
    </EditorialPage>
  );
}
