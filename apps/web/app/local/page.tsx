import type { Metadata } from 'next';

import { EditorialPage } from '../../components/marketing/editorial/EditorialPage';
import { RuledSection } from '../../components/marketing/editorial/RuledSection';
import { Slug } from '../../components/marketing/editorial/Slug';
import { Specimen } from '../../components/marketing/editorial/Specimen';
import { OpsizMorph } from '../../components/marketing/editorial/OpsizMorph';
import { MonoButton } from '../../components/marketing/editorial/MonoButton';
import { DispatchSection } from '../../components/marketing/editorial/DispatchSection';

export const metadata: Metadata = {
  title: 'Local | AGI Workforce',
  description:
    'Run AI offline. Free forever. Ollama and LM Studio integrated. No internet required.',
  alternates: { canonical: 'https://agiworkforce.com/local' },
  openGraph: {
    title: 'Local | AGI Workforce',
    description:
      'Run AI offline. Free forever. Ollama and LM Studio integrated. SQLite storage. No cloud.',
    url: 'https://agiworkforce.com/local',
    type: 'website',
    images: [
      { url: '/app-preview.png', width: 1200, height: 630, alt: 'AGI Workforce Local Mode' },
    ],
  },
};

const REASONS: { kicker: string; body: string }[] = [
  {
    kicker: '01 · PRIVACY',
    body: 'Nothing leaves your machine. No API logs anywhere -- yours or theirs.',
  },
  {
    kicker: '02 · LATENCY',
    body: 'First-token latency under 200ms on M-series Apple Silicon for 7B models.',
  },
  {
    kicker: '03 · COST',
    body: 'Free forever. No per-token billing, no rate limits, no subscriptions.',
  },
  {
    kicker: '04 · OFFLINE',
    body: 'Works on a plane, in a SCIF, on a boat. The CLI does not notice the network is down.',
  },
  {
    kicker: '05 · CONTROL',
    body: 'Pin a specific model version. No vendor deprecation surprises.',
  },
];

export default function LocalPage() {
  return (
    <EditorialPage tier="mixed">
      {/* S1 — Masthead Hero */}
      <RuledSection tier="paper" id="local-hero">
        <div className="py-20 md:py-32">
          <div className="grid grid-cols-1 gap-12 md:grid-cols-2 md:gap-16">
            {/* Left: headline */}
            <div>
              <h1 className="leading-[1.02] tracking-[-0.018em]">
                <span
                  className="block font-[var(--font-newsreader)] font-light text-[var(--color-ink)]"
                  style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)' }}
                >
                  Run AI offline.
                </span>
                <span
                  className={[
                    'block font-[var(--font-newsreader)] font-extrabold italic',
                    'text-[var(--color-ink)]',
                    'underline decoration-[var(--color-rule)] underline-offset-4',
                  ].join(' ')}
                  style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)' }}
                >
                  Free forever.
                </span>
              </h1>
            </div>

            {/* Right: lede */}
            <div className="flex flex-col justify-end">
              <Specimen columns={2} dropCap>
                <p>
                  No internet. No keys. No quotas. Just your laptop, Ollama or LM Studio, and a
                  model file.
                </p>
                <p>
                  Local-only mode is shipped today and free forever. SQLite for storage. No
                  Supabase. No auth. No cross-device sync. No Dispatch; but also no leakage.
                </p>
              </Specimen>

              {/* CTAs */}
              <div className="mt-8 flex flex-wrap gap-3">
                <MonoButton variant="primary" href="/download" prefix="./">
                  install desktop
                </MonoButton>
                <MonoButton variant="ghost" href="https://ollama.ai">
                  get ollama
                </MonoButton>
              </div>
            </div>
          </div>
        </div>
      </RuledSection>

      {/* S2 — Why local */}
      <RuledSection tier="paper" slug={<Slug index="01" kicker="WHY LOCAL" />}>
        <div className="py-20 md:py-28">
          <OpsizMorph as="h2" className="text-[var(--color-ink)] mb-14">
            Five reasons. <em>One tradeoff.</em>
          </OpsizMorph>

          <ul className="flex flex-col divide-y divide-[var(--color-rule-soft)]" role="list">
            {REASONS.map(({ kicker, body }) => (
              <li key={kicker} className="flex flex-col gap-2 py-6 md:flex-row md:gap-10">
                <p
                  className={[
                    'font-mono text-[11px] tracking-[0.18em] uppercase shrink-0',
                    'text-[var(--color-rule)] md:w-36',
                  ].join(' ')}
                >
                  {kicker}
                </p>
                <p
                  className={[
                    'font-[var(--font-newsreader)] text-[1.0625rem] leading-[1.65]',
                    'text-[var(--color-ink-2)]',
                  ].join(' ')}
                >
                  {body}
                </p>
              </li>
            ))}
          </ul>

          <p
            className={[
              'mt-8 font-[var(--font-newsreader)] italic text-lg',
              'text-[var(--color-fg-quiet)]',
            ].join(' ')}
          >
            The tradeoff: smaller models, slower than frontier cloud, GPU helps a lot.
          </p>
        </div>
      </RuledSection>

      {/* S3 — Setup (graphite) */}
      <RuledSection tier="graphite" slug={<Slug index="02" kicker="SETUP" />}>
        <div className="py-20 md:py-28">
          <h2
            className={[
              'font-[var(--font-newsreader)] italic',
              'text-[var(--color-cream-on-graphite)]',
              'mb-12',
            ].join(' ')}
            style={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}
          >
            Three commands. Five minutes.
          </h2>

          {/* Terminal block */}
          <div className="bg-[var(--color-graphite-2)] border border-[var(--color-rule-soft)] p-6 md:p-8 font-mono text-[13px] leading-[1.8] max-w-3xl">
            <div className="text-[var(--color-fg-quiet)]">{`$ # 1. install ollama`}</div>
            <div className="text-[var(--color-cream-on-graphite)]">{`$ brew install ollama`}</div>
            <div className="mt-3 text-[var(--color-fg-quiet)]">{`$ # 2. pull a model — start with 7B for speed`}</div>
            <div className="text-[var(--color-cream-on-graphite)]">{`$ ollama pull qwen2.5:7b`}</div>
            <div className="mt-3 text-[var(--color-fg-quiet)]">{`$ # 3. point AGI Workforce at it`}</div>
            <div className="text-[var(--color-cream-on-graphite)]">{`$ agiworkforce config set provider local`}</div>
            <div className="text-[var(--color-amber-text)]">{`$ agiworkforce exec "summarize the last commit"`}</div>
          </div>

          {/* Caption */}
          <p
            className={[
              'mt-6 font-mono text-[10px] tracking-[0.15em] uppercase',
              'text-[var(--color-fg-faint)]',
            ].join(' ')}
          >
            MODELS ALSO WORK WITH LM STUDIO — JUST ENABLE THE LOCAL SERVER ON :1234.
          </p>
        </div>
      </RuledSection>

      {/* S4 — Modes comparison (paper) */}
      <RuledSection tier="paper" slug={<Slug index="03" kicker="MODES" />}>
        <div className="py-20 md:py-28">
          <h2
            className={[
              'font-[var(--font-newsreader)] font-light',
              'text-[var(--color-ink)]',
              'mb-12',
            ].join(' ')}
            style={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}
          >
            Local mode vs Cloud mode.
          </h2>

          <div className="overflow-x-auto border border-[var(--color-rule-soft)]">
            <table className="w-full" aria-label="Local mode vs cloud mode comparison">
              <thead>
                <tr className="border-b border-[var(--color-rule-soft)]">
                  <th
                    scope="col"
                    className={[
                      'py-3 px-4 text-left',
                      'font-mono text-[10px] tracking-[0.18em] uppercase',
                      'text-[var(--color-fg-faint)]',
                    ].join(' ')}
                  >
                    Feature
                  </th>
                  <th
                    scope="col"
                    className={[
                      'py-3 px-4 text-left',
                      'font-mono text-[10px] tracking-[0.18em] uppercase',
                      'text-[var(--color-rule)]',
                    ].join(' ')}
                  >
                    Local Mode
                  </th>
                  <th
                    scope="col"
                    className={[
                      'py-3 px-4 text-left',
                      'font-mono text-[10px] tracking-[0.18em] uppercase',
                      'text-[var(--color-fg-faint)]',
                    ].join(' ')}
                  >
                    Cloud Mode (BYOK)
                  </th>
                  <th
                    scope="col"
                    className={[
                      'py-3 px-4 text-left',
                      'font-mono text-[10px] tracking-[0.18em] uppercase',
                      'text-[var(--color-fg-faint)]',
                    ].join(' ')}
                  >
                    Cloud Mode (Hobby)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-rule-soft)]">
                {[
                  {
                    feature: 'Storage',
                    local: 'SQLite, on disk',
                    byok: 'Supabase us-east-2',
                    hobby: 'Supabase us-east-2',
                  },
                  {
                    feature: 'Auth',
                    local: 'None',
                    byok: 'Supabase OAuth',
                    hobby: 'Supabase OAuth',
                  },
                  {
                    feature: 'Cross-device sync',
                    local: '✗',
                    byok: '✓',
                    hobby: '✓',
                  },
                  {
                    feature: 'Mobile dispatch',
                    local: '✗',
                    byok: '✓',
                    hobby: '✓',
                  },
                  {
                    feature: 'LLM',
                    local: 'Ollama / LM Studio',
                    byok: 'Provider directly (BYOK)',
                    hobby: 'Managed cloud',
                  },
                  {
                    feature: 'Network required',
                    local: '✗',
                    byok: '✓ (provider calls)',
                    hobby: '✓',
                  },
                  {
                    feature: 'Cost',
                    local: '$0',
                    byok: "Provider's rate",
                    hobby: '~$5/mo',
                  },
                  {
                    feature: 'Privacy',
                    local: 'Maximum',
                    byok: "Provider's policy",
                    hobby: "Provider's policy",
                  },
                ].map((row, i) => (
                  <tr
                    key={row.feature}
                    className={i % 2 === 0 ? 'bg-[var(--color-paper-2)]/40' : ''}
                  >
                    <td
                      className={[
                        'py-3 px-4',
                        'font-mono text-[12px]',
                        'text-[var(--color-ink-2)]',
                      ].join(' ')}
                    >
                      {row.feature}
                    </td>
                    <td
                      className={[
                        'py-3 px-4',
                        'font-mono text-[12px] font-semibold',
                        'text-[var(--color-rule)]',
                      ].join(' ')}
                    >
                      {row.local}
                    </td>
                    <td className="py-3 px-4 font-mono text-[12px] text-[var(--color-fg-quiet)]">
                      {row.byok}
                    </td>
                    <td className="py-3 px-4 font-mono text-[12px] text-[var(--color-fg-quiet)]">
                      {row.hobby}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p
            className={[
              'mt-8 font-[var(--font-newsreader)] italic text-lg',
              'text-[var(--color-fg-quiet)]',
            ].join(' ')}
          >
            Local mode is desktop-only; there is no point running offline on a hosted web app.
          </p>
        </div>
      </RuledSection>

      {/* S5 — Dispatch */}
      <DispatchSection slugIndex="04" slugKicker="DISPATCH" />
    </EditorialPage>
  );
}
