import type { Metadata } from 'next';

import { EditorialPage } from '../../components/marketing/editorial/EditorialPage';
import { RuledSection } from '../../components/marketing/editorial/RuledSection';
import { Slug } from '../../components/marketing/editorial/Slug';
import { Specimen } from '../../components/marketing/editorial/Specimen';
import { OpsizMorph } from '../../components/marketing/editorial/OpsizMorph';
import { MonoButton } from '../../components/marketing/editorial/MonoButton';
import { DispatchSection } from '../../components/marketing/editorial/DispatchSection';

export const metadata: Metadata = {
  title: 'BYOK | AGI Workforce',
  description:
    'Bring your own keys. Pay providers directly. AES-256-GCM encrypted at rest. Free forever.',
  alternates: { canonical: 'https://agiworkforce.com/byok' },
  openGraph: {
    title: 'BYOK | AGI Workforce',
    description:
      'Your keys. Your data. Your cost. AES-256-GCM encrypted at rest. Pay providers directly with no markup.',
    url: 'https://agiworkforce.com/byok',
    type: 'website',
    images: [{ url: '/app-preview.png', width: 1200, height: 630, alt: 'AGI Workforce BYOK' }],
  },
};

export default function ByokPage() {
  return (
    <EditorialPage tier="mixed">
      {/* S1 — Masthead Hero */}
      <RuledSection tier="paper" id="byok-hero">
        <div className="py-20 md:py-32">
          <div className="grid grid-cols-1 gap-12 md:grid-cols-2 md:gap-16">
            {/* Left: asymmetric headline */}
            <div>
              <h1 className="leading-[1.02] tracking-[-0.018em]">
                <span
                  className="block font-[var(--font-newsreader)] font-light text-[var(--color-ink)]"
                  style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)' }}
                >
                  Your keys.
                </span>
                <span
                  className="block font-[var(--font-newsreader)] font-light text-[var(--color-ink)]"
                  style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)' }}
                >
                  Your data.
                </span>
                <span
                  className={[
                    'block font-[var(--font-newsreader)] font-extrabold italic',
                    'text-[var(--color-ink)]',
                    'underline decoration-[var(--color-rule)] underline-offset-4',
                  ].join(' ')}
                  style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)' }}
                >
                  Your cost.
                </span>
              </h1>
            </div>

            {/* Right: lede */}
            <div className="flex flex-col justify-end">
              <Specimen columns={2} dropCap>
                <p>
                  We never markup your provider bill. Pay Anthropic, OpenAI, Google, and the rest
                  directly; we are transparent about every API call.
                </p>
                <p>
                  Your keys are AES-256-GCM encrypted at rest with your master password. They never
                  leave your device unencrypted, and never reach our servers in plaintext.
                </p>
              </Specimen>

              {/* CTAs */}
              <div className="mt-8 flex flex-wrap gap-3">
                <MonoButton variant="primary" href="/download" prefix="./">
                  install
                </MonoButton>
                <MonoButton variant="ghost" href="/providers">
                  supported providers
                </MonoButton>
              </div>
            </div>
          </div>
        </div>
      </RuledSection>

      {/* S2 — How BYOK works */}
      <RuledSection tier="paper" slug={<Slug index="01" kicker="WORKFLOW" />}>
        <div className="py-20 md:py-28">
          <OpsizMorph as="h2" className="text-[var(--color-ink)] mb-14">
            Three steps. <em>Zero markup.</em>
          </OpsizMorph>

          {/* Block 01.A */}
          <div className="border-t border-[var(--color-rule-soft)] py-10">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-16">
              <div>
                <p
                  className={[
                    'font-mono text-[11px] tracking-[0.18em] uppercase mb-3',
                    'text-[var(--color-fg-quiet)]',
                  ].join(' ')}
                >
                  § 01.A
                </p>
                <h3
                  className={[
                    'font-[var(--font-newsreader)] font-semibold text-2xl',
                    'text-[var(--color-ink)] mb-4',
                  ].join(' ')}
                >
                  Paste your key.
                </h3>
              </div>
              <div>
                <Specimen columns={2}>
                  <p>
                    Open Settings, select your provider, and paste your API key. The key is
                    encrypted immediately on your device using AES-256-GCM with a key derived from
                    your master password via Argon2id. The plaintext key is zeroed from memory after
                    encryption.
                  </p>
                </Specimen>
              </div>
            </div>
          </div>

          {/* Block 01.B */}
          <div className="border-t border-[var(--color-rule-soft)] py-10">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-16">
              <div className="md:order-2">
                <p
                  className={[
                    'font-mono text-[11px] tracking-[0.18em] uppercase mb-3',
                    'text-[var(--color-fg-quiet)]',
                  ].join(' ')}
                >
                  § 01.B
                </p>
                <h3
                  className={[
                    'font-[var(--font-newsreader)] font-semibold text-2xl',
                    'text-[var(--color-ink)] mb-4',
                  ].join(' ')}
                >
                  Pick a model.
                </h3>
              </div>
              <div className="md:order-1">
                <Specimen columns={2}>
                  <p>
                    Any model your key unlocks is available: the full provider catalog, not a
                    curated subset. Claude, GPT, Gemini, Grok, DeepSeek, Qwen, and more. Switch
                    providers mid-conversation without losing context.
                  </p>
                </Specimen>
              </div>
            </div>
          </div>

          {/* Block 01.C */}
          <div className="border-t border-[var(--color-rule-soft)] py-10">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-16">
              <div>
                <p
                  className={[
                    'font-mono text-[11px] tracking-[0.18em] uppercase mb-3',
                    'text-[var(--color-fg-quiet)]',
                  ].join(' ')}
                >
                  § 01.C
                </p>
                <h3
                  className={[
                    'font-[var(--font-newsreader)] font-semibold text-2xl',
                    'text-[var(--color-ink)] mb-4',
                  ].join(' ')}
                >
                  Chat. Watch the costs accrue in your provider dashboard, not ours.
                </h3>
              </div>
              <div>
                <Specimen columns={2}>
                  <p>
                    Requests go directly from AGI Workforce to the provider API. We are not in the
                    billing chain; we are not marking up tokens. Your usage appears exactly where
                    your provider shows it, because we send to them directly.
                  </p>
                </Specimen>
              </div>
            </div>
          </div>
        </div>
      </RuledSection>

      {/* S3 — Comparison ledger */}
      <RuledSection tier="paper" slug={<Slug index="02" kicker="COMPARISON" />}>
        <div className="py-20 md:py-28">
          <h2
            className={[
              'font-[var(--font-newsreader)] font-light',
              'text-[var(--color-ink)]',
              'mb-12',
            ].join(' ')}
            style={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}
          >
            Who else lets you bring keys?
          </h2>

          <div className="overflow-x-auto border border-[var(--color-rule-soft)]">
            <table className="w-full" aria-label="BYOK feature comparison">
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
                    AGI Workforce
                  </th>
                  <th
                    scope="col"
                    className={[
                      'py-3 px-4 text-left',
                      'font-mono text-[10px] tracking-[0.18em] uppercase',
                      'text-[var(--color-fg-faint)]',
                    ].join(' ')}
                  >
                    Anthropic
                  </th>
                  <th
                    scope="col"
                    className={[
                      'py-3 px-4 text-left',
                      'font-mono text-[10px] tracking-[0.18em] uppercase',
                      'text-[var(--color-fg-faint)]',
                    ].join(' ')}
                  >
                    OpenAI
                  </th>
                  <th
                    scope="col"
                    className={[
                      'py-3 px-4 text-left',
                      'font-mono text-[10px] tracking-[0.18em] uppercase',
                      'text-[var(--color-fg-faint)]',
                    ].join(' ')}
                  >
                    Google AI Studio
                  </th>
                  <th
                    scope="col"
                    className={[
                      'py-3 px-4 text-left',
                      'font-mono text-[10px] tracking-[0.18em] uppercase',
                      'text-[var(--color-fg-faint)]',
                    ].join(' ')}
                  >
                    ChatGPT
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-rule-soft)]">
                {[
                  {
                    feature: 'BYOK',
                    us: '✓',
                    anthropic: '✗',
                    openai: 'partial',
                    google: '✗',
                    chatgpt: '✗',
                  },
                  {
                    feature: 'Run other providers',
                    us: '✓ (12)',
                    anthropic: '✗',
                    openai: '✗',
                    google: '✗',
                    chatgpt: '✗',
                  },
                  {
                    feature: 'Local LLM (Ollama, LM Studio)',
                    us: '✓',
                    anthropic: '✗',
                    openai: '✗',
                    google: '✗',
                    chatgpt: '✗',
                  },
                  {
                    feature: 'Cross-provider thread',
                    us: '✓',
                    anthropic: '✗',
                    openai: '✗',
                    google: '✗',
                    chatgpt: '✗',
                  },
                  {
                    feature: 'Encryption at rest',
                    us: 'AES-256-GCM',
                    anthropic: 'per-customer (Bedrock only)',
                    openai: 'per-customer',
                    google: 'per-customer',
                    chatgpt: 'server-only',
                  },
                  {
                    feature: 'Pricing',
                    us: 'Free with BYOK',
                    anthropic: '$20/mo Pro',
                    openai: '$20/mo Plus',
                    google: 'Pay per token',
                    chatgpt: '$20/mo',
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
                      {row.us}
                    </td>
                    <td className="py-3 px-4 font-mono text-[12px] text-[var(--color-fg-quiet)]">
                      {row.anthropic}
                    </td>
                    <td className="py-3 px-4 font-mono text-[12px] text-[var(--color-fg-quiet)]">
                      {row.openai}
                    </td>
                    <td className="py-3 px-4 font-mono text-[12px] text-[var(--color-fg-quiet)]">
                      {row.google}
                    </td>
                    <td className="py-3 px-4 font-mono text-[12px] text-[var(--color-fg-quiet)]">
                      {row.chatgpt}
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
            We are not better than Anthropic at Claude. We are the only place you can run Claude
            alongside the eleven other providers.
          </p>
        </div>
      </RuledSection>

      {/* S4 — Where keys live */}
      <RuledSection tier="paper" slug={<Slug index="03" kicker="STORAGE" />}>
        <div className="py-20 md:py-28">
          <h2
            className={[
              'font-[var(--font-newsreader)] font-light',
              'text-[var(--color-ink)]',
              'mb-10',
            ].join(' ')}
            style={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}
          >
            Where your keys actually live.
          </h2>

          <Specimen columns={3}>
            <p>
              <strong>Local mode.</strong> Encrypted in{' '}
              <code className="font-mono text-[13px]">~/.agiworkforce/keys/</code> on disk with your
              master password. Nothing on our servers. Nothing in transit.
            </p>
            <p>
              <strong>Cloud mode (BYOK).</strong> Keys are encrypted client-side before being sent
              to Supabase. Decryption happens on your device. The plaintext key never reaches us.
            </p>
            <p>
              <strong>Hobby tier.</strong> We manage the keys; we provide the cloud LLM access. You
              do not bring keys. Different tier, different tradeoff.
            </p>
          </Specimen>

          {/* Master password warning callout */}
          <div className="mt-10 border border-[var(--color-rule-soft)] p-5">
            <p
              className={[
                'font-mono text-[11px] tracking-[0.18em] uppercase',
                'text-[var(--color-stamp-oxblood)]',
              ].join(' ')}
            >
              MASTER PASSWORD CANNOT BE RECOVERED. WE DON&apos;T KNOW IT. BACK IT UP.
            </p>
          </div>
        </div>
      </RuledSection>

      {/* S5 — Dispatch */}
      <DispatchSection slugIndex="04" slugKicker="DISPATCH" />
    </EditorialPage>
  );
}
