import Link from 'next/link';
import { MARKETING, MARKETING_MODEL_PILLS } from '../../../lib/marketing-constants';

const PROVIDERS_LIST = [
  'Anthropic',
  'OpenAI',
  'Google',
  'xAI',
  'DeepSeek',
  'Perplexity',
  'Qwen',
  'Moonshot',
  'Zhipu',
  'Ollama',
  'LM Studio',
  'Custom BYO',
];

// Dot-grid background pattern — faint mint dots on dark canvas
const DOT_GRID = `radial-gradient(circle, rgba(109,255,172,0.18) 1px, transparent 1px)`;

export function HeroSection() {
  const [pill0, pill1, pill2] = MARKETING_MODEL_PILLS;

  return (
    <section className="relative overflow-hidden" style={{ background: 'var(--color-saas-bg)' }}>
      {/* Dot-grid texture */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: DOT_GRID,
          backgroundSize: '36px 36px',
          opacity: 0.035,
        }}
      />

      {/* Ambient radial glow — top-center */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[640px]"
        style={{
          background:
            'radial-gradient(ellipse 70% 55% at 50% 0%, rgba(109,255,172,0.13), transparent 72%)',
        }}
      />

      {/* ── Main content ── */}
      <div className="relative container mx-auto px-4 pt-28 pb-0">
        {/* Badge — left-aligned, no longer centered */}
        <div
          className="saas-reveal inline-flex items-center gap-2 rounded-full border px-3 py-1.5 mb-10"
          style={{
            borderColor: 'rgba(109,255,172,0.2)',
            background: 'rgba(109,255,172,0.07)',
            animationDelay: '0s',
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: 'var(--color-saas-mint)' }}
          />
          <span
            className="font-mono text-[10px] tracking-[0.2em] uppercase"
            style={{ color: 'var(--color-saas-mint)' }}
          >
            Desktop v1.2.0 — Now shipping
          </span>
        </div>

        {/* ── Split layout: text left, terminal right ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_480px] xl:grid-cols-[1fr_540px] gap-12 lg:gap-16 items-center pb-16">
          {/* Left — headline + CTAs */}
          <div>
            {/* Headline: massive Syne display type */}
            <h1
              className="saas-reveal leading-[0.88] tracking-tight mb-7"
              style={{
                fontFamily: 'var(--font-syne)',
                fontSize: 'clamp(3.25rem, 7.5vw, 7rem)',
                fontWeight: 800,
                letterSpacing: '-0.05em',
                color: 'var(--color-saas-text)',
                animationDelay: '0.08s',
              }}
            >
              Every AI model.
              <br />
              <span style={{ color: 'var(--color-saas-mint)' }}>One workforce.</span>
            </h1>

            {/* Subtitle */}
            <p
              className="saas-reveal max-w-[480px] leading-relaxed mb-8"
              style={{
                fontFamily: 'var(--font-outfit)',
                fontSize: 'clamp(1rem, 1.8vw, 1.15rem)',
                color: 'var(--color-saas-text-muted)',
                fontWeight: 400,
                animationDelay: '0.2s',
              }}
            >
              Switch between Claude, GPT, Gemini, and {MARKETING.providers.display} more
              mid-conversation. Bring your own API keys, or run fully offline with Ollama or LM
              Studio. Zero lock-in.
            </p>

            {/* CTAs */}
            <div
              className="saas-reveal flex flex-wrap gap-3 mb-7"
              style={{ animationDelay: '0.32s' }}
            >
              <Link
                href="/download"
                className="inline-flex items-center rounded-full px-6 py-2.5 text-sm font-semibold transition-all hover:opacity-90 hover:scale-[1.02]"
                style={{
                  fontFamily: 'var(--font-outfit)',
                  fontWeight: 600,
                  background: 'var(--color-saas-mint)',
                  color: '#09090b',
                }}
              >
                Download free
              </Link>
              <Link
                href="/docs"
                className="inline-flex items-center rounded-full border px-6 py-2.5 text-sm font-medium transition-all hover:bg-white/5"
                style={{
                  fontFamily: 'var(--font-outfit)',
                  borderColor: 'var(--color-saas-border-strong)',
                  color: 'var(--color-saas-text)',
                }}
              >
                View docs →
              </Link>
            </div>

            {/* Trust line */}
            <p
              className="saas-reveal font-mono text-[10px] tracking-[0.22em] uppercase"
              style={{
                color: 'var(--color-saas-text-faint)',
                animationDelay: '0.44s',
              }}
            >
              No training on your data · BYOK free forever · Local LLMs
            </p>
          </div>

          {/* Right — terminal card, floating with glow */}
          <div className="saas-reveal-fade relative" style={{ animationDelay: '0.18s' }}>
            {/* Glow behind the card */}
            <div
              aria-hidden="true"
              className="absolute -inset-8 rounded-3xl"
              style={{
                background:
                  'radial-gradient(ellipse at center, rgba(109,255,172,0.07) 0%, transparent 70%)',
              }}
            />

            <div
              className="relative rounded-2xl overflow-hidden border"
              style={{
                background: 'var(--color-saas-surface)',
                borderColor: 'rgba(255,255,255,0.08)',
                boxShadow: '0 32px 80px -20px rgba(0,0,0,0.7), 0 0 1px rgba(255,255,255,0.05)',
              }}
            >
              {/* Traffic lights + titlebar */}
              <div
                className="flex items-center gap-2 px-4 py-3 border-b"
                style={{ borderColor: 'rgba(255,255,255,0.05)' }}
              >
                <span className="h-3 w-3 rounded-full" style={{ background: '#ff5f57' }} />
                <span className="h-3 w-3 rounded-full" style={{ background: '#febc2e' }} />
                <span className="h-3 w-3 rounded-full" style={{ background: '#28c840' }} />
                <span
                  className="flex-1 text-center font-mono text-[11px]"
                  style={{ color: '#3f3f46' }}
                >
                  ~/agiworkforce — bash
                </span>
              </div>

              {/* Terminal body */}
              <div
                className="p-5 font-mono text-[12.5px] leading-[1.9]"
                aria-label="CLI demo: cross-provider task execution"
              >
                <TermLine prompt="$" text='agiworkforce exec "summarize and fix"' color="faint" />
                <TermLine
                  prefix={`→ `}
                  highlight={pill0}
                  text="      reading 142 files..."
                  color="muted"
                />
                <TermLine
                  prefix={`→ `}
                  highlight={pill1}
                  text=" refining structure..."
                  color="muted"
                />
                <TermLine prefix={`→ `} highlight={pill2} text=" cross-checking..." color="muted" />
                <div className="mt-1" />
                <TermLine
                  text="✓ context preserved · 3 providers · 142 files · 1 thread"
                  color="white"
                />
                <TermLine prompt="▸" text="" color="mint" blink />
              </div>

              {/* Bottom stats strip */}
              <div
                className="flex items-center justify-between px-5 py-3 border-t font-mono text-[10px] tracking-[0.1em]"
                style={{ borderColor: 'rgba(255,255,255,0.05)', color: '#3f3f46' }}
              >
                <span>{MARKETING.providers.display} providers wired</span>
                <span style={{ color: 'rgba(109,255,172,0.6)' }}>● READY</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Provider strip ── */}
      <div
        className="border-t py-7"
        style={{ borderColor: 'rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.015)' }}
      >
        <div className="container mx-auto px-4">
          <p
            className="font-mono text-[9px] tracking-[0.26em] uppercase mb-4 text-center"
            style={{ color: 'var(--color-saas-text-faint)' }}
          >
            Works with {MARKETING.providers.display} providers
          </p>
          <div className="flex flex-wrap justify-center gap-x-7 gap-y-2">
            {PROVIDERS_LIST.map((name) => (
              <span
                key={name}
                className="font-mono text-[11px] tracking-wide"
                style={{ color: '#3f3f46' }}
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── helpers ── */

interface TermLineProps {
  prompt?: string;
  prefix?: string;
  highlight?: string;
  text: string;
  color: 'faint' | 'muted' | 'white' | 'mint';
  blink?: boolean;
}

function TermLine({ prompt, prefix, highlight, text, color, blink }: TermLineProps) {
  const textColor =
    color === 'faint'
      ? '#3f3f46'
      : color === 'muted'
        ? '#71717a'
        : color === 'mint'
          ? 'var(--color-saas-mint)'
          : '#fafafa';

  return (
    <div className="flex items-start">
      {prompt && (
        <span className="mr-2 select-none" style={{ color: '#3f3f46' }}>
          {prompt}
        </span>
      )}
      <span style={{ color: textColor }}>
        {prefix && <span style={{ color: '#52525b' }}>{prefix}</span>}
        {highlight && <span style={{ color: 'var(--color-saas-mint)' }}>{highlight}</span>}
        {text}
        {blink && (
          <span
            style={{
              display: 'inline-block',
              width: '7px',
              height: '14px',
              background: 'var(--color-saas-mint)',
              marginLeft: '2px',
              verticalAlign: 'text-bottom',
              animation: 'saas-mint-pulse 1.1s ease-in-out infinite',
            }}
          />
        )}
      </span>
    </div>
  );
}
