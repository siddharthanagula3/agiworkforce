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
  title: 'AGI Workforce vs Claude | Honest Comparison',
  description:
    'AGI Workforce vs Claude: multi-provider support, BYOK, local LLM, cross-provider thread, CLI, desktop, mobile, and computer use compared honestly.',
  alternates: { canonical: '/compare/claude' },
  openGraph: {
    title: 'AGI Workforce vs Claude | Honest Comparison',
    description:
      'Claude is the strongest single model for reasoning. Our lane is running Claude alongside eleven other providers in one thread.',
    type: 'website',
    url: 'https://agiworkforce.com/compare/claude',
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
    us: `${MARKETING.providers.display} providers (Claude, GPT, Gemini, Grok, DeepSeek, and more)`,
    them: 'Claude family only',
  },
  {
    capability: 'BYOK support',
    us: `All ${MARKETING.providers.display} cloud providers`,
    them: 'No — subscription-only',
  },
  {
    capability: 'Local LLM',
    us: 'Yes — Ollama + LM Studio (Desktop, free forever)',
    them: 'Not supported',
  },
  {
    capability: 'Cross-provider thread',
    us: 'Yes — mid-conversation, context preserved',
    them: 'Claude only; no switching',
  },
  {
    capability: 'CLI',
    us: 'Yes — Rust, 22 subcommands, TUI',
    them: 'Yes — Claude Code (Rust, agentic)',
  },
  {
    capability: 'Desktop app',
    us: 'Yes — Tauri, macOS / Windows / Linux',
    them: 'Yes — Claude Desktop, macOS / Windows',
  },
  {
    capability: 'Mobile app',
    us: 'Partial — iOS + Android (Expo, in progress)',
    them: 'Yes — Claude iOS + Android',
  },
  {
    capability: 'Computer use',
    us: 'Partial — browser, terminal, file I/O',
    them: 'Yes — Claude Cowork (GA April 2026)',
  },
  {
    capability: 'Browser extension',
    us: 'Yes — Chrome MV3 v1.2.0',
    them: 'Yes — Anthropic ships Chrome extension',
  },
  {
    capability: 'VS Code extension',
    us: 'Yes — v0.3.0, multi-provider',
    them: 'Yes — Anthropic ships VS Code extension',
  },
  {
    capability: 'Free tier',
    us: 'Local mode: free forever. BYOK: free forever.',
    them: 'Free tier exists, rate-limited',
  },
];

export default function CompareClaudePage() {
  return (
    <EditorialPage tier="mixed">
      {/* S1 — Review masthead */}
      <RuledSection tier="paper" id="compare-claude-hero">
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
              vs Claude.
            </span>
          </h1>

          <div className="mt-10">
            <Specimen dropCap columns={2}>
              <p>
                Claude is the strongest single model for nuanced reasoning, long-context coding
                work, and aligned-conversation use cases. Anthropic's product polish is exceptional:
                Claude Desktop, Claude Code, Cowork computer use, and a full mobile suite are all
                shipping. None of that is in dispute.
              </p>
              <p>
                The case for AGI Workforce is not &ldquo;we are better at Claude than
                Anthropic.&rdquo; It is &ldquo;we run Claude alongside the eleven other providers,
                in one thread.&rdquo; If your work ever requires comparing Claude to GPT on the same
                input, or switching to a local model when keys run out, that lane is ours.
              </p>
            </Specimen>
          </div>
        </div>
      </RuledSection>

      {/* S2 — When Claude wins */}
      <RuledSection tier="paper" slug={<Slug index="01" kicker="WHEN CLAUDE WINS" />}>
        <div className="py-14 md:py-20">
          <h2
            className="font-display text-2xl md:text-3xl mb-8"
            style={{ fontVariationSettings: '"wght" 600' }}
          >
            When to use Claude instead.
          </h2>

          <Specimen columns={2}>
            <p>
              Pure Claude users who never need another provider have no reason to layer in AGI
              Workforce. Claude.ai has the tightest integration with Anthropic's own features:
              Projects, Memory, Artifacts, and the Cowork computer-use suite. If Constitutional AI
              tooling and Anthropic's safety posture are your primary selection criteria, stay on
              Claude.ai.
            </p>
            <p>
              Long-context edge cases where Anthropic's 200K window is the actual constraint are
              best served by Claude directly, with Anthropic's own infrastructure and rate-limit
              agreements. Cowork GA computer use parity is also ahead of ours at present.
            </p>
          </Specimen>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-0">
            {[
              'You exclusively use Claude models and never need to switch.',
              "You need deep integration with Anthropic's Projects and Memory features.",
              'You rely on Claude Cowork for full computer-use automation.',
              'You prefer the Claude.ai UI or have existing workflows built around it.',
              'Simplicity matters more than multi-provider flexibility.',
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
              When your task spans Claude and GPT and a local model in the same thread, AGI
              Workforce is the only wired option. Start a conversation with Claude for planning,
              hand off to GPT for code generation, verify with Gemini for document analysis. Context
              carries across every switch.
            </p>
            <p>
              BYOK means your keys stay your keys. You pay Anthropic directly at their rates with no
              markup. When you need one of the other eleven providers for a specific subtask, the
              same interface handles the routing.
            </p>
          </Specimen>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                title: `${MARKETING.providers.display} providers, one thread`,
                desc: 'Switch Claude and GPT and Gemini mid-conversation. Context preserved across every hop.',
              },
              {
                title: 'Keys not on Anthropic servers',
                desc: 'BYOK: your Anthropic key, your OpenAI key, your Google key. Pay providers directly.',
              },
              {
                title: 'Local LLM fallback',
                desc: 'Rate-limited? Run Ollama or LM Studio locally at zero cost. Same interface.',
              },
              {
                title: `${MARKETING.surfaces.display} surfaces, one account`,
                desc: 'Desktop, Web, Mobile, CLI, VS Code, Chrome. One conversation history.',
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
            Accurate as of May 2026. Anthropic ships desktop, mobile, CLI, Chrome ext, VS Code ext,
            Cowork. We acknowledge all of these.
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
                    Claude
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
