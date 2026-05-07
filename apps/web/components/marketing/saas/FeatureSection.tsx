import type { ReactNode } from 'react';
import { MARKETING, MARKETING_MODEL_PILLS } from '../../../lib/marketing-constants';

export function FeatureSection() {
  const [pill0, pill1, pill2, pill3] = MARKETING_MODEL_PILLS;

  return (
    <section className="py-32" style={{ background: 'var(--color-saas-bg)' }}>
      <div className="container mx-auto px-4">
        {/* Section label */}
        <div className="mb-24">
          <p
            className="font-mono text-[10px] tracking-[0.26em] uppercase mb-4"
            style={{ color: 'var(--color-saas-mint)' }}
          >
            Why AGI Workforce
          </p>
          <h2
            className="leading-tight"
            style={{
              fontFamily: 'var(--font-syne)',
              fontWeight: 700,
              fontSize: 'clamp(2rem, 4.5vw, 3.5rem)',
              letterSpacing: '-0.04em',
              color: 'var(--color-saas-text)',
            }}
          >
            Three differences.{' '}
            <span style={{ color: '#52525b' }}>That&apos;s the whole pitch.</span>
          </h2>
        </div>

        {/* ── Feature 01: Multi-provider ── */}
        <FeatureRow
          index="01"
          kicker="Multi-Provider"
          title="One thread. Every AI model."
          body={`Start in Claude, switch to GPT, finish in Gemini — all in one conversation. Anthropic locks you to Claude only. We don't. The CLI ships with ${MARKETING.providers.display} named provider registrations and a router that picks by cost, latency, or capability.`}
          flip={false}
          visual={
            <div
              className="saas-card-hover rounded-2xl border p-7"
              style={{
                background: 'var(--color-saas-surface)',
                borderColor: 'rgba(255,255,255,0.07)',
              }}
            >
              <p
                className="font-mono text-[9px] tracking-[0.22em] uppercase mb-6"
                style={{ color: '#3f3f46' }}
              >
                Active conversation thread
              </p>

              {/* Model pill chain */}
              <div className="flex flex-wrap items-center gap-2.5 mb-6">
                {[pill0, pill1, pill2, pill3].map((model, i, arr) => (
                  <span key={model} className="flex items-center gap-2.5">
                    <span
                      className="inline-flex items-center rounded-lg border px-3 py-1.5 font-mono text-[11px] tracking-tight"
                      style={{
                        borderColor: 'rgba(109,255,172,0.18)',
                        background: 'rgba(109,255,172,0.06)',
                        color: 'var(--color-saas-mint)',
                      }}
                    >
                      {model}
                    </span>
                    {i < arr.length - 1 && (
                      <span className="font-mono text-xs" style={{ color: '#3f3f46' }}>
                        →
                      </span>
                    )}
                  </span>
                ))}
              </div>

              {/* Status line */}
              <div
                className="rounded-lg px-4 py-3 font-mono text-[11px] leading-relaxed"
                style={{
                  background: 'rgba(109,255,172,0.04)',
                  borderLeft: '2px solid rgba(109,255,172,0.3)',
                }}
              >
                <span style={{ color: 'var(--color-saas-mint)' }}>✓ </span>
                <span style={{ color: '#71717a' }}>
                  Token-level continuity — not &quot;summarize and re-prompt.&quot;
                </span>
              </div>
            </div>
          }
        />

        <Divider />

        {/* ── Feature 02: BYOK & Local ── */}
        <FeatureRow
          index="02"
          kicker="BYOK + Local"
          title="Your keys. Your machine."
          body="Bring your own API keys to Anthropic, OpenAI, Google, and the rest — pay them directly, we add zero markup. Or run fully offline with Ollama or LM Studio. Free forever. No rate limits. No per-token cost."
          flip={true}
          visual={
            <div
              className="saas-card-hover rounded-2xl border overflow-hidden"
              style={{
                background: 'var(--color-saas-surface)',
                borderColor: 'rgba(255,255,255,0.07)',
              }}
            >
              {/* Table header */}
              <div
                className="grid grid-cols-4 px-5 py-3 border-b font-mono text-[9px] tracking-[0.18em] uppercase"
                style={{ borderColor: 'rgba(255,255,255,0.05)', color: '#3f3f46' }}
              >
                {['Mode', 'Local', 'BYOK', 'Hobby'].map((h) => (
                  <span key={h}>{h}</span>
                ))}
              </div>
              {/* Rows */}
              {[
                { label: 'Convos', local: 'SQLite on disk', byok: 'Supabase', hobby: 'Supabase' },
                {
                  label: 'API keys',
                  local: 'Encrypted disk',
                  byok: 'Encrypted disk',
                  hobby: 'Managed',
                },
                {
                  label: 'Model calls',
                  local: 'Localhost only',
                  byok: 'Direct',
                  hobby: 'Via proxy',
                },
                {
                  label: 'Files',
                  local: 'Never leave',
                  byok: 'Provider only',
                  hobby: 'Provider only',
                },
              ].map((row, i) => (
                <div
                  key={row.label}
                  className="grid grid-cols-4 px-5 py-3 font-mono text-[11px]"
                  style={{
                    borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.04)' : undefined,
                    color: '#71717a',
                  }}
                >
                  <span style={{ color: '#3f3f46' }}>{row.label}</span>
                  <span style={{ color: 'var(--color-saas-text)' }}>{row.local}</span>
                  <span>{row.byok}</span>
                  <span>{row.hobby}</span>
                </div>
              ))}
            </div>
          }
        />

        <Divider />

        {/* ── Feature 03: Continuity ── */}
        <FeatureRow
          index="03"
          kicker="Cross-Provider Memory"
          title="Context follows you across models."
          body={`Start a thread in Claude. Switch to GPT for the next turn. Finish in Gemini. The full conversation history travels with you: system prompt, tool calls, intermediate reasoning. Works across all ${MARKETING.providers.display} providers, including local Ollama.`}
          flip={false}
          visual={
            <div
              className="saas-card-hover rounded-2xl border overflow-hidden"
              style={{
                background: 'var(--color-saas-surface)',
                borderColor: 'rgba(255,255,255,0.07)',
              }}
            >
              {/* Header */}
              <div
                className="px-5 py-3 border-b font-mono text-[9px] tracking-[0.18em] uppercase"
                style={{ borderColor: 'rgba(255,255,255,0.05)', color: '#3f3f46' }}
              >
                Conversation handoff log
              </div>
              {/* Log body */}
              <div className="p-5 font-mono text-[12px] leading-[2]">
                <div style={{ color: '#3f3f46' }}>14:02 · {pill1}</div>
                <div style={{ color: '#71717a' }}>{'  > sketch the architecture'}</div>
                <div style={{ color: '#3f3f46' }}>{'  → 1,042 tokens returned'}</div>

                {/* Handoff — visually prominent */}
                <div
                  className="my-3 rounded-lg px-4 py-2.5"
                  style={{
                    background: 'rgba(109,255,172,0.05)',
                    borderLeft: '2px solid var(--color-saas-mint)',
                  }}
                >
                  <span className="font-semibold" style={{ color: 'var(--color-saas-mint)' }}>
                    ↻ HANDOFF
                  </span>
                  <span className="ml-3" style={{ color: '#3f3f46' }}>
                    context preserved · 1 thread
                  </span>
                </div>

                <div style={{ color: '#3f3f46' }}>14:04 · {pill0}</div>
                <div style={{ color: '#71717a' }}>{'  > now implement it'}</div>
                <div style={{ color: '#3f3f46' }}>{'  → continuing from outline...'}</div>
              </div>
            </div>
          }
        />
      </div>
    </section>
  );
}

/* ── Divider ── */
function Divider() {
  return <div className="my-28 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }} />;
}

/* ── FeatureRow ── */
interface FeatureRowProps {
  index: string;
  kicker: string;
  title: string;
  body: string;
  flip: boolean;
  visual: ReactNode;
}

function FeatureRow({ index, kicker, title, body, flip, visual }: FeatureRowProps) {
  return (
    <div
      className={`grid grid-cols-1 lg:grid-cols-2 gap-14 lg:gap-24 items-center${flip ? ' [&>*:nth-child(1)]:lg:order-2' : ''}`}
    >
      <div>
        <p
          className="font-mono text-[10px] tracking-[0.22em] uppercase mb-3"
          style={{ color: 'var(--color-saas-mint)' }}
        >
          {index} / {kicker}
        </p>
        <h3
          className="leading-tight mb-5"
          style={{
            fontFamily: 'var(--font-syne)',
            fontWeight: 700,
            fontSize: 'clamp(1.6rem, 3vw, 2.4rem)',
            letterSpacing: '-0.035em',
            color: 'var(--color-saas-text)',
          }}
        >
          {title}
        </h3>
        <p
          className="leading-relaxed"
          style={{
            fontFamily: 'var(--font-outfit)',
            fontSize: '1rem',
            color: 'var(--color-saas-text-muted)',
            lineHeight: 1.75,
          }}
        >
          {body}
        </p>
      </div>
      <div>{visual}</div>
    </div>
  );
}
