import type { Metadata } from 'next';

import { EditorialPage } from '../components/marketing/editorial/EditorialPage';
import { RuledSection } from '../components/marketing/editorial/RuledSection';
import { Slug } from '../components/marketing/editorial/Slug';
import { Specimen } from '../components/marketing/editorial/Specimen';
import { MonoButton } from '../components/marketing/editorial/MonoButton';
import { Caret } from '../components/marketing/editorial/Caret';
import { OpsizMorph } from '../components/marketing/editorial/OpsizMorph';
import { ProviderGrid } from '../components/marketing/editorial/ProviderGrid';
import { SurfaceIndex } from '../components/marketing/editorial/SurfaceIndex';
import { OperatorConsole } from '../components/marketing/editorial/OperatorConsole';
import { StampComingSoon } from '../components/marketing/editorial/StampComingSoon';
import { DispatchSection } from '../components/marketing/editorial/DispatchSection';
import { MARKETING } from '../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'AGI Workforce — Beyond one model. Beyond one surface.',
  description:
    'Beyond one model. Beyond one surface. AGI in your hands. ' +
    `${MARKETING.providers.display} AI providers in one thread — ` +
    'across desktop, web, mobile, CLI, VS Code, and Chrome. BYOK or run fully offline with Ollama and LM Studio.',
  keywords: [
    'AI agent',
    'AI automation',
    'desktop AI app',
    'privacy-first AI',
    'local AI',
    'BYOK AI',
    'offline AI',
    'multi-provider AI',
    'Tauri desktop app',
    'Ollama',
    'LM Studio',
    'OpenAI',
    'Anthropic',
    'Gemini',
    'data privacy',
  ],
  openGraph: {
    title: 'AGI Workforce — Beyond one model. Beyond one surface.',
    description:
      'Beyond one model. Beyond one surface. AGI in your hands. ' +
      `${MARKETING.providers.display} AI providers in one thread.`,
    type: 'website',
    url: 'https://agiworkforce.com',
    images: [{ url: '/app-preview.png', width: 1200, height: 630, alt: 'AGI Workforce' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AGI Workforce — Beyond one model. Beyond one surface.',
    description:
      'Beyond one model. Beyond one surface. AGI in your hands. ' +
      `${MARKETING.providers.display} providers, ${MARKETING.surfaces.display} surfaces, one workforce.`,
    images: ['/app-preview.png'],
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'AGI Workforce',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'macOS, Windows, Linux',
  featureList: [
    `${MARKETING.providers.display} AI providers in one chat thread`,
    `${MARKETING.surfaces.display} surfaces: Desktop, Web, Mobile, CLI, VS Code, Chrome`,
    `${MARKETING.models.display} AI models`,
    'BYOK — bring your own API keys',
    'Run fully offline with Ollama or LM Studio',
    'Cross-provider session continuity — switch models mid-conversation',
    'AES-256-GCM encrypted key storage',
    'No training on your data',
  ],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <EditorialPage tier="mixed">
        {/* ── S1 — MASTHEAD HERO (paper, full-bleed) ── */}
        <RuledSection tier="paper" id="hero" fullBleed>
          <div className="container mx-auto px-4 pt-20 pb-12 md:pt-28 md:pb-16">
            {/* Two-column grid */}
            <div className="grid grid-cols-1 gap-10 md:grid-cols-5 md:gap-16">
              {/* Left: headline (60% width = 3/5 cols) */}
              <div className="md:col-span-3">
                <h1 className="font-display text-left leading-[0.95] tracking-[-0.022em]">
                  <span
                    className="block font-light text-[var(--color-ink)]"
                    style={{ fontSize: 'clamp(2.75rem,7vw,5.5rem)' }}
                  >
                    Beyond one model.
                  </span>
                  <span
                    className="block font-light text-[var(--color-ink)]"
                    style={{ fontSize: 'clamp(2.75rem,7vw,5.5rem)' }}
                  >
                    Beyond one surface.
                  </span>
                  <span className="block" style={{ fontSize: 'clamp(2.75rem,7vw,5.5rem)' }}>
                    <span className="border-b-[3px] border-[var(--color-rule)] pb-1">
                      <em className="font-display italic font-extrabold text-[var(--color-ink)]">
                        AGI in your hands.
                      </em>
                    </span>
                    <Caret />
                  </span>
                </h1>
              </div>

              {/* Right: lede (40% width = 2/5 cols) */}
              <div className="md:col-span-2 flex flex-col justify-end pb-2">
                <p className="font-mono text-[14px] leading-[22px] text-[var(--color-ink-2)]">
                  Twelve providers. One thread. Zero lock-in.
                </p>
                <p className="mt-4 font-mono text-[14px] leading-[22px] text-[var(--color-ink-2)]">
                  Bring your own keys, run fully offline, or use our managed cloud. The CLI is the
                  engine; the apps are surfaces over it.
                </p>
                <p className="mt-4 font-mono text-[14px] leading-[22px] text-[var(--color-fg-quiet)]">
                  — THE EDITORS
                </p>
              </div>
            </div>

            {/* Trust strip */}
            <div className="mt-10 border-t border-[var(--color-rule)]" />
            <p className="mt-4 font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-fg-quiet)]">
              NO TRAINING ON YOUR DATA · MULTI-PROVIDER · BYOK + LOCAL · CROSS-PLATFORM
            </p>

            {/* CTAs */}
            <div className="mt-6 flex flex-wrap gap-4">
              <MonoButton variant="primary" href="/download" prefix="./">
                install
              </MonoButton>
              <MonoButton variant="ghost" href="/docs">
                read the docs →
              </MonoButton>
            </div>

            {/* Provider grid */}
            <div className="mt-10 border-t border-[var(--color-rule)]" />
            <div className="mt-8">
              <ProviderGrid
                caption={`${MARKETING.providers.display} PROVIDERS · ONE THREAD · ZERO LOCK-IN`}
              />
            </div>
          </div>
        </RuledSection>

        {/* ── S2 — THREE DIFFERENTIATORS (paper) ── */}
        <RuledSection
          tier="paper"
          id="differentiators"
          slug={<Slug index="01" kicker="DIFFERENTIATORS" />}
        >
          <div className="container mx-auto px-4 py-16 md:py-24">
            <OpsizMorph as="h2" className="font-bold text-[var(--color-ink)] mb-16">
              Three differences. <em className="italic">That&apos;s the whole pitch.</em>
            </OpsizMorph>

            {/* Row 1 — Multi-provider */}
            <div className="border-t border-[var(--color-rule-soft)] pt-10 pb-12">
              <Slug index="01" kicker="MULTI-PROVIDER" />
              <h3 className="mt-4 mb-6 font-display font-bold leading-[1.04] tracking-[-0.018em] text-[var(--color-ink)] text-3xl md:text-5xl">
                One thread. Twelve providers.
              </h3>
              <Specimen columns={3} dropCap>
                <p>
                  Switch between Claude, GPT, Gemini, Grok, and 8 more — all in one conversation.
                  Anthropic locks you to Claude only; we don&apos;t.
                </p>
                <p>
                  The CLI ships with 13 named provider registrations. Pick one per turn or let the
                  router choose by cost, latency, or capability.
                </p>
                <p>
                  Your conversation history follows you across model swaps. Token-level continuity,
                  not &quot;summarize and re-prompt.&quot;
                </p>
              </Specimen>

              {/* Model pill chain */}
              <div className="mt-8 flex flex-wrap items-center gap-2 font-mono text-sm tracking-tight">
                {['gpt-4o', 'claude-opus-4-7', 'gemini-2.5-pro', 'llama-3.3-70b'].map(
                  (model, i, arr) => (
                    <span key={model} className="flex items-center gap-2">
                      <span className="inline-flex items-center px-2 py-0.5 border border-[var(--color-rule-soft)] text-[var(--color-ink)]">
                        {model}
                      </span>
                      {i < arr.length - 1 && (
                        <span className="text-[var(--color-rule)]" aria-hidden="true">
                          →
                        </span>
                      )}
                    </span>
                  ),
                )}
              </div>

              <div className="mt-6">
                <a
                  href="/providers"
                  className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--color-rule)] hover:underline"
                >
                  → Read the dispatch
                </a>
              </div>
            </div>

            {/* Row 2 — Keys and local */}
            <div className="border-t border-[var(--color-rule-soft)] pt-10 pb-12">
              <Slug index="02" kicker="KEYS &amp; LOCAL" />
              <h3 className="mt-4 mb-6 font-display font-bold leading-[1.04] tracking-[-0.018em] text-[var(--color-ink)] text-3xl md:text-5xl">
                Your keys. Your machine.
              </h3>
              <Specimen columns={3} dropCap>
                <p>
                  Bring your own keys to Anthropic, OpenAI, Google, and the rest. Pay them directly.
                  We add zero markup and store nothing in the middle.
                </p>
                <p>
                  Run fully offline with Ollama or LM Studio. No API calls leave your laptop. Free
                  forever, with zero rate limits and zero per-token cost.
                </p>
                <p>
                  When you do use cloud mode, your keys are AES-256-GCM encrypted at rest with your
                  master password — never on our servers in plaintext.
                </p>
              </Specimen>

              {/* Ledger table */}
              <div className="mt-8 overflow-x-auto">
                <table className="w-full font-mono text-xs border-collapse text-[var(--color-ink)]">
                  <thead>
                    <tr className="border-b border-[var(--color-rule-soft)]">
                      <th className="text-left py-2 pr-4 font-semibold tracking-[0.1em] uppercase text-[var(--color-fg-quiet)]">
                        WHERE
                      </th>
                      <th className="text-left py-2 pr-4 font-semibold tracking-[0.1em] uppercase text-[var(--color-fg-quiet)]">
                        LOCAL MODE
                      </th>
                      <th className="text-left py-2 pr-4 font-semibold tracking-[0.1em] uppercase text-[var(--color-fg-quiet)]">
                        BYOK CLOUD
                      </th>
                      <th className="text-left py-2 font-semibold tracking-[0.1em] uppercase text-[var(--color-fg-quiet)]">
                        HOBBY MANAGED
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {
                        label: 'Conversations',
                        local: 'SQLite, on disk',
                        byok: 'Supabase us-east-2',
                        hobby: 'Supabase us-east-2',
                      },
                      {
                        label: 'API keys',
                        local: 'Encrypted on disk',
                        byok: 'Encrypted on disk',
                        hobby: 'Managed by us',
                      },
                      {
                        label: 'Model calls',
                        local: 'Localhost only',
                        byok: 'Direct to provider',
                        hobby: 'Through our proxy',
                      },
                      {
                        label: 'Files',
                        local: 'Never leave laptop',
                        byok: 'Provider only on send',
                        hobby: 'Provider only on send',
                      },
                    ].map((row) => (
                      <tr
                        key={row.label}
                        className="border-b border-[var(--color-rule-soft)] last:border-0"
                      >
                        <td className="py-2 pr-4 text-[var(--color-fg-quiet)]">{row.label}</td>
                        <td className="py-2 pr-4">{row.local}</td>
                        <td className="py-2 pr-4">{row.byok}</td>
                        <td className="py-2">{row.hobby}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-6">
                <a
                  href="/byok"
                  className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--color-rule)] hover:underline"
                >
                  → Read /byok
                </a>
              </div>
            </div>

            {/* Row 3 — Continuity */}
            <div className="border-t border-[var(--color-rule-soft)] pt-10 pb-4">
              <Slug index="03" kicker="CONTINUITY" />
              <h3 className="mt-4 mb-6 font-display font-bold leading-[1.04] tracking-[-0.018em] text-[var(--color-ink)] text-3xl md:text-5xl">
                Cross-provider memory.
              </h3>
              <Specimen columns={3} dropCap>
                <p>
                  Start a thread in Claude. Switch to GPT for the next turn. Finish in Gemini. The
                  full conversation history travels with you — system prompt, tool calls,
                  intermediate reasoning.
                </p>
                <p>
                  Each handoff is an explicit token-level event, not a summary. The receiving model
                  sees what the sender saw.
                </p>
                <p>
                  Continuity works across all 12 providers, including local Ollama. One thread,
                  twelve brains.
                </p>
              </Specimen>

              {/* Inline transcript */}
              <div className="mt-8 bg-[var(--color-graphite)] border-l-[3px] border-[var(--color-rule)] p-6">
                <pre className="font-mono text-[12px] leading-[1.8] text-[var(--color-fg-muted)] whitespace-pre-wrap">
                  <span className="text-[var(--color-fg-quiet)]">
                    14:02 · CLAUDE OPUS 4-7{'\n'}
                  </span>
                  <span>{'  > sketch the architecture for the new feature\n'}</span>
                  <span>{'  → reading 142 files...\n'}</span>
                  <span className="text-[var(--color-fg-quiet)]">
                    {'  → claude-opus-4-7: returned 1042 tokens\n'}
                  </span>
                  <span>{'\n'}</span>
                  <span className="text-[var(--color-cream-on-graphite)] font-semibold">
                    {'14:04 · ↻ HANDOFF\n'}
                  </span>
                  <span className="text-[var(--color-rule)]">{'  ┃ '}</span>
                  <span className="text-[var(--color-fg-quiet)]">
                    {'context preserved · 1 thread · 142 files\n'}
                  </span>
                  <span>{'\n'}</span>
                  <span className="text-[var(--color-fg-quiet)]">14:04 · GPT-4O{'\n'}</span>
                  <span>{'  > now implement it\n'}</span>
                  <span className="text-[var(--color-fg-quiet)]">
                    {"  → continuing from claude's outline..."}
                  </span>
                </pre>
              </div>

              <div className="mt-6">
                <a
                  href="/local"
                  className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--color-rule)] hover:underline"
                >
                  → Read /local
                </a>
              </div>
            </div>
          </div>
        </RuledSection>

        {/* ── S3 — SIX SURFACES (graphite) ── */}
        <RuledSection
          tier="graphite"
          id="surfaces"
          slug={<Slug index="04" kicker="SIX SURFACES" />}
        >
          <div className="container mx-auto px-4">
            <SurfaceIndex slug={<Slug index="04" kicker="SIX SURFACES" />} />
          </div>
        </RuledSection>

        {/* ── S4 — OPERATOR CONSOLE (graphite) ── */}
        {/*
          OperatorConsole has its own section wrapper and internal slug/headline.
          It renders as a standalone graphite section — placed directly, not nested
          in RuledSection, to avoid double-section nesting.
        */}
        <OperatorConsole slugIndex="05" slugKicker="THE ENGINE" />

        {/* ── S5 — RATE CARD (paper) ── */}
        <RuledSection tier="paper" id="pricing" slug={<Slug index="06" kicker="RATES" />}>
          <div className="container mx-auto px-4 py-16 md:py-24">
            <OpsizMorph as="h2" className="font-bold text-[var(--color-ink)] mb-12">
              Honest pricing. <em className="italic">No tier theatre.</em>
            </OpsizMorph>

            <div className="overflow-x-auto">
              <table className="w-full font-mono text-sm border-collapse text-[var(--color-ink)]">
                <thead>
                  <tr className="border-b-2 border-[var(--color-rule)]">
                    {['LOCAL FREE', 'BYOK FREE', `HOBBY $5/MO`, 'PRO', 'ENTERPRISE'].map((col) => (
                      <th
                        key={col}
                        className="text-left py-3 pr-6 last:pr-0 font-semibold tracking-[0.1em] uppercase text-[var(--color-ink)] text-xs"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      label: 'Capability',
                      local: 'Local LLMs only',
                      byok: 'Bring your own keys',
                      hobby: 'Managed cloud, basic models',
                      pro: 'Full models, advanced features',
                      enterprise: 'Custom contracts, SSO, SCIM',
                    },
                    {
                      label: 'Encryption',
                      local: 'At rest',
                      byok: 'At rest',
                      hobby: 'At rest + transit',
                      pro: 'At rest + transit',
                      enterprise: 'At rest + transit + custom',
                    },
                    {
                      label: 'Support',
                      local: 'Community',
                      byok: 'Community',
                      hobby: 'Email, 48h',
                      pro: 'Priority email, 24h',
                      enterprise: 'Dedicated, 4h SLA',
                    },
                    {
                      label: 'Price',
                      local: '$0',
                      byok: '$0',
                      hobby: '$5/mo',
                      pro: 'TBD',
                      enterprise: 'Custom',
                    },
                  ].map((row) => (
                    <tr
                      key={row.label}
                      className="border-b border-[var(--color-rule-soft)] last:border-0"
                    >
                      <td className="py-3 pr-6 text-[var(--color-fg-quiet)] text-xs tracking-[0.08em] uppercase">
                        {row.label}
                      </td>
                      <td className="py-3 pr-6 text-[var(--color-ink-2)]">{row.local}</td>
                      <td className="py-3 pr-6 text-[var(--color-ink-2)]">{row.byok}</td>
                      <td className="py-3 pr-6 text-[var(--color-ink-2)]">{row.hobby}</td>
                      <td className="py-3 pr-6 text-[var(--color-ink-2)]">{row.pro}</td>
                      <td className="py-3 text-[var(--color-ink-2)]">{row.enterprise}</td>
                    </tr>
                  ))}
                  {/* Status row */}
                  <tr className="border-b border-[var(--color-rule-soft)]">
                    <td className="py-3 pr-6 text-[var(--color-fg-quiet)] text-xs tracking-[0.08em] uppercase">
                      Status
                    </td>
                    <td className="py-3 pr-6">
                      <StampComingSoon variant="shipped" />
                    </td>
                    <td className="py-3 pr-6">
                      <StampComingSoon variant="shipped" />
                    </td>
                    <td className="py-3 pr-6">
                      <StampComingSoon variant="shipped" />
                    </td>
                    <td className="py-3 pr-6">
                      <StampComingSoon variant="waitlist" />
                    </td>
                    <td className="py-3">
                      <a
                        href="/enterprise"
                        className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--color-rule)] hover:underline"
                      >
                        Contact sales
                      </a>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="mt-8 font-display italic text-lg text-[var(--color-ink-2)] max-w-prose">
              <em>Pro and Max are not yet open. Hobby is. Enterprise is bespoke.</em>
            </p>
          </div>
        </RuledSection>

        {/* ── S6 — FINAL DISPATCH / CTA (graphite) ── */}
        <DispatchSection slugIndex="07" slugKicker="DISPATCH" />

        {/* ── FORTHCOMING STRIP (no slug, graphite-adjacent) ── */}
        <div className="bg-[var(--color-graphite)] border-t border-[var(--color-rule-soft)] py-10">
          <div className="container mx-auto px-4">
            <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-fg-quiet)] mb-6">
              FORTHCOMING IN NEXT EDITIONS
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-0 border border-[var(--color-rule-soft)]">
              {[
                'Mobile detail. App Store and Play Store listings — Q3 2026.',
                'Chrome extension. CWS submission once visual review clears — Q3 2026.',
                'VS Code extension. Marketplace listing once private beta clears — Q3 2026.',
                'Integrations marketplace. MCP server directory — Q4 2026.',
                'Customer cohort. First case studies — Q4 2026.',
              ].map((text, i) => (
                <div
                  key={i}
                  className="p-4 border-b sm:border-b-0 sm:border-r border-[var(--color-rule-soft)] xl:last:border-r-0 last:border-b-0 font-mono text-[12px] text-[var(--color-fg-quiet)] leading-[1.6]"
                >
                  {text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </EditorialPage>
    </>
  );
}
