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
  title: 'AGI Workforce vs ChatGPT | Honest Comparison',
  description:
    'AGI Workforce vs ChatGPT: multi-provider support, BYOK, local LLM, cross-provider thread, CLI, desktop, and pricing compared honestly.',
  alternates: { canonical: '/compare/chatgpt' },
  openGraph: {
    title: 'AGI Workforce vs ChatGPT | Honest Comparison',
    description:
      'ChatGPT is the most polished consumer AI product. Our lane is multi-provider routing, BYOK, and local LLM — none of which OpenAI offers.',
    type: 'website',
    url: 'https://agiworkforce.com/compare/chatgpt',
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
    us: `${MARKETING.providers.display} providers (GPT, Claude, Gemini, Grok, DeepSeek, and more)`,
    them: 'GPT family + some partner models',
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
    them: 'OpenAI models only; no cross-provider',
  },
  {
    capability: 'CLI',
    us: 'Yes — Rust, 22 subcommands, TUI',
    them: 'Yes — OpenAI Codex CLI (Rust, agentic, MCP)',
  },
  {
    capability: 'Desktop app',
    us: 'Yes — Tauri, macOS / Windows / Linux',
    them: 'Yes — ChatGPT desktop, macOS / Windows',
  },
  {
    capability: 'Mobile app',
    us: 'Partial — iOS + Android (Expo, in progress)',
    them: 'Yes — ChatGPT iOS + Android',
  },
  {
    capability: 'Computer use',
    us: 'Partial — browser, terminal, file I/O',
    them: 'No — Operator / canvas features; not full computer use',
  },
  {
    capability: 'Browser extension',
    us: 'Yes — Chrome MV3 v1.2.0',
    them: 'Yes — OpenAI ships Chrome extension',
  },
  {
    capability: 'VS Code extension',
    us: 'Yes — v0.3.0, multi-provider',
    them: 'Yes — GitHub Copilot (OpenAI-backed)',
  },
  {
    capability: 'Free tier',
    us: 'Local mode: free forever. BYOK: free forever.',
    them: 'Free tier with usage limits',
  },
  {
    capability: 'Image generation',
    us: 'Not built-in (route to providers via BYOK)',
    them: 'Yes — DALL-E natively integrated',
  },
];

export default function CompareChatGPTPage() {
  return (
    <EditorialPage tier="mixed">
      {/* S1 — Review masthead */}
      <RuledSection tier="paper" id="compare-chatgpt-hero">
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
              vs ChatGPT.
            </span>
          </h1>

          <div className="mt-10">
            <Specimen dropCap columns={2}>
              <p>
                ChatGPT is the most polished consumer product in the AI space. OpenAI ships GPT
                models broadly. Codex CLI is genuinely good. The ChatGPT desktop app, voice mode,
                custom GPTs, and DALL-E integration are all real products that work well. None of
                that is in dispute.
              </p>
              <p>
                The case for AGI Workforce is multi-provider routing, BYOK, and local LLM. None of
                those are things OpenAI offers. If your work spans GPT and Claude and local models
                in the same thread, or if you need keys to stay yours at provider rates, that lane
                is ours.
              </p>
            </Specimen>
          </div>
        </div>
      </RuledSection>

      {/* S2 — When ChatGPT wins */}
      <RuledSection tier="paper" slug={<Slug index="01" kicker="WHEN CHATGPT WINS" />}>
        <div className="py-14 md:py-20">
          <h2
            className="font-display text-2xl md:text-3xl mb-8"
            style={{ fontVariationSettings: '"wght" 600' }}
          >
            When to use ChatGPT instead.
          </h2>

          <Specimen columns={2}>
            <p>
              Pure GPT users who never need another provider have no reason to add AGI Workforce.
              ChatGPT has the most polished consumer interface, the largest user base, and OpenAI's
              tightest integration of their own features: custom GPTs, GPT Store, Sora video, DALL-E
              image generation, and voice mode.
            </p>
            <p>
              If you are already in the ChatGPT Team or Enterprise workflow with managed accounts
              and compliance controls, staying there is the simpler choice. GitHub Copilot is also a
              mature, deeply integrated VS Code AI — if that covers your IDE needs, no reason to
              switch.
            </p>
          </Specimen>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-0">
            {[
              'You exclusively use GPT models and never need alternatives.',
              'You rely on ChatGPT custom GPTs, DALL-E image gen, or Sora video.',
              'You want GPT Voice or the native ChatGPT voice experience.',
              'You use ChatGPT Team or Enterprise with managed accounts.',
              'GitHub Copilot is already your VS Code AI and GPT covers everything else.',
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
              When one model lock-in is the wrong abstraction for your workflow, AGI Workforce is
              the answer. Use GPT for code generation, ask Claude to review it, verify factual
              claims with Perplexity Sonar. One thread. Full context across every hop.
            </p>
            <p>
              BYOK means your OpenAI API key stays your OpenAI API key. You pay OpenAI directly at
              their published rates with no markup. When local LLM is required, Ollama or LM Studio
              runs on your machine at zero cost through the same interface.
            </p>
          </Specimen>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                title: 'GPT and Claude in the same thread',
                desc: 'Use GPT for code generation. Ask Claude to review it. Both in one conversation, context intact.',
              },
              {
                title: 'BYOK without subscriptions',
                desc: 'Bring your OpenAI API key. No ChatGPT Plus needed. Pay per token at OpenAI rates.',
              },
              {
                title: 'Local LLM when API limits hit',
                desc: 'Rate-limited on the API? Run Ollama locally at zero cost. Same interface.',
              },
              {
                title: `${MARKETING.surfaces.display} surfaces, one account`,
                desc: 'Desktop, Web, Mobile, CLI, VS Code, Chrome. One conversation history across all.',
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
            Accurate as of May 2026. OpenAI ships desktop, mobile, Codex CLI, Chrome ext. GitHub
            Copilot ships VS Code ext. We acknowledge all of these.
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
                    ChatGPT
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
