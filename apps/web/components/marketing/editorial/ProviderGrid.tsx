import type { ReactNode } from 'react';

interface ProviderCell {
  key: string;
  label: string;
  display: string;
  badge?: 'LOCAL' | 'BYO';
  mark: ReactNode;
}

/**
 * Inline SVG/text marks for each provider.
 * Monochrome ink — rendered in current color via `fill-current` / `currentColor`.
 */

function MarkAnthropic() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8 fill-current" aria-hidden="true">
      <path d="M13.827 3.52h3.603L24 20.48h-3.603l-6.57-16.96zm-7.258 0h3.767L16.906 20.48h-3.674l-1.343-3.461H5.017l-1.344 3.46H0L6.57 3.522zm4.132 10.86L8.453 7.687 6.205 14.38h4.496z" />
    </svg>
  );
}

function MarkOpenAI() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8 fill-current" aria-hidden="true">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.998 5.998 0 0 0-3.998 2.9 6.042 6.042 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.602 1.5v3.003l-2.602 1.5-2.602-1.5z" />
    </svg>
  );
}

function MarkGoogle() {
  /* Monochrome "G" — simplified path, fills with currentColor */
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8 fill-current" aria-hidden="true">
      <path d="M21.805 10.023H12v3.954h5.618c-.532 2.618-2.797 4.5-5.618 4.5-3.314 0-6-2.686-6-6s2.686-6 6-6c1.48 0 2.83.54 3.868 1.428l2.828-2.828C17.11 3.59 14.677 2.5 12 2.5 6.477 2.5 2 6.977 2 12.5S6.477 22.5 12 22.5c5.523 0 10-4.477 10-10 0-.83-.105-1.637-.195-2.477z" />
    </svg>
  );
}

function MarkXAI() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8 fill-current" aria-hidden="true">
      <path d="M3.005 6.3h3.2l5.59 8.24L6.36 22H3.005l5.735-7.735L3.005 6.3zm8.25 0h3.2L22 22h-3.2L11.255 6.3zm5.545 0H20l-3.5 4.7-1.6-2.35L16.8 6.3z" />
    </svg>
  );
}

function MarkDeepSeek() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8 fill-current" aria-hidden="true">
      <path d="M9.143 0C4.093 0 0 4.093 0 9.143c0 2.414.943 4.608 2.478 6.238.058-.067.117-.13.179-.192a8.08 8.08 0 0 1 1.601-1.27c-.72-1.399-1.115-2.96-1.115-4.586C3.143 5.66 5.702 2.572 9.143 2.143V0zm5.714 0v2.143c3.441.429 6 3.517 6 7.19 0 1.626-.395 3.187-1.115 4.586a8.08 8.08 0 0 1 1.601 1.27c.062.062.121.125.179.192A9.098 9.098 0 0 0 24 9.143C24 4.093 19.907 0 14.857 0zM12 3.429a5.71 5.71 0 0 0-5.714 5.714c0 2.005 1.038 3.768 2.604 4.779C7.27 14.896 6 16.557 6 18.514c0 .293.03.583.086.871C7.614 21.857 9.67 24 12 24s4.386-2.143 5.914-4.615c.057-.288.086-.578.086-.87 0-1.958-1.27-3.619-2.89-4.593A5.705 5.705 0 0 0 17.714 9.143 5.71 5.71 0 0 0 12 3.429zm0 2.142a3.572 3.572 0 1 1 0 7.143 3.572 3.572 0 0 1 0-7.143z" />
    </svg>
  );
}

function MarkPerplexity() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8 fill-current" aria-hidden="true">
      <path d="M8.854 2v6.257L3.804 3.75v6.886H1.5v4.728h2.304v6.886l5.05-4.507V24h6.292v-6.257l5.05 4.507v-6.886H22.5v-4.728h-2.304V3.75l-5.05 4.507V2H8.854zm1.273 1.509v5.813l-4.78 4.266h4.78v5.403H9.89L5.077 14.94v4.05H2.773v-2.182h3.93L5.077 15.37v-2.74h6.677V8.257L5.077 3.563v4.051l4.813 4.051H5.077V9.483h3.93l-3.93-3.508v-2.19l5.05 4.507V1.51zm4.746 0v6.783l5.05-4.507v2.19l-3.93 3.508h3.93v2.182H15.11l4.813-4.051v-4.05l-6.677 4.374V12.63h6.677v2.74l-1.626 1.437h3.93v2.182h-2.304v-4.05L15.11 19.01h-1.237v-5.403h4.78l-4.78-4.266z" />
    </svg>
  );
}

function MarkOllama() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8 fill-current" aria-hidden="true">
      <path d="M15.832 3.076c-.247-.026-.498.063-.68.245-.29.29-.329.743-.093 1.078.014.02.143.235.27.569.127.332.254.784.3 1.308.057.657-.017 1.456-.386 2.282-.735 1.645-1.175 2.343-1.175 3.872 0 1.04.204 1.774.506 2.312a3.856 3.856 0 0 0 .908 1.073c-.07.06-.263.198-.652.38-.506.234-1.08.394-1.554.394-.473 0-1.047-.16-1.553-.395-.39-.181-.582-.319-.652-.379a3.856 3.856 0 0 0 .908-1.073c.302-.538.506-1.272.506-2.312 0-1.53-.44-2.227-1.175-3.872-.369-.826-.443-1.625-.385-2.282.046-.524.172-.976.299-1.308.127-.334.256-.548.27-.569.236-.335.197-.788-.093-1.078a.753.753 0 0 0-.68-.245c-.248.026-.473.17-.591.395 0 0-.465.891-.593 1.912-.128 1.02-.027 2.243.485 3.389.577 1.29.898 1.776.898 2.658 0 .674-.13 1.117-.314 1.445-.185.328-.416.543-.618.7-.201.157-.373.26-.472.378a.684.684 0 0 0-.168.452c0 .39.305.756.83 1.09.527.332 1.279.62 2.123.62.845 0 1.597-.288 2.124-.62.526-.334.83-.7.83-1.09a.684.684 0 0 0-.168-.452c-.099-.118-.27-.221-.472-.379a2.87 2.87 0 0 1-.618-.699c-.183-.328-.314-.771-.314-1.445 0-.882.321-1.369.898-2.658.512-1.146.613-2.37.485-3.39-.128-1.02-.593-1.911-.593-1.911a.77.77 0 0 0-.591-.395zm-2.556 8.08a.4.4 0 0 1 .4.399.4.4 0 0 1-.4.4.4.4 0 0 1-.399-.4.4.4 0 0 1 .4-.4zm-2.552 0a.4.4 0 0 1 .4.399.4.4 0 0 1-.4.4.4.4 0 0 1-.4-.4.4.4 0 0 1 .4-.4z" />
    </svg>
  );
}

/** Text-mark fallback for providers without distinct SVG glyphs */
function MarkText({ text }: { text: string }) {
  return (
    <span className="font-mono text-[11px] font-semibold tracking-[0.12em] uppercase leading-none">
      {text}
    </span>
  );
}

const PROVIDERS: ProviderCell[] = [
  { key: 'anthropic', label: 'ANTHROPIC', display: 'Anthropic', mark: <MarkAnthropic /> },
  { key: 'openai', label: 'OPENAI', display: 'OpenAI', mark: <MarkOpenAI /> },
  { key: 'google', label: 'GOOGLE', display: 'Google', mark: <MarkGoogle /> },
  { key: 'xai', label: 'XAI', display: 'xAI', mark: <MarkXAI /> },
  { key: 'deepseek', label: 'DEEPSEEK', display: 'DeepSeek', mark: <MarkDeepSeek /> },
  { key: 'perplexity', label: 'PERPLEXITY', display: 'Perplexity', mark: <MarkPerplexity /> },
  { key: 'qwen', label: 'QWEN', display: 'Qwen', mark: <MarkText text="Qwen" /> },
  { key: 'moonshot', label: 'MOONSHOT', display: 'Moonshot', mark: <MarkText text="Kimi" /> },
  { key: 'zhipu', label: 'ZHIPU', display: 'Zhipu', mark: <MarkText text="Zhipu" /> },
  { key: 'ollama', label: 'OLLAMA', display: 'Ollama', badge: 'LOCAL', mark: <MarkOllama /> },
  {
    key: 'lmstudio',
    label: 'LM STUDIO',
    display: 'LM Studio',
    badge: 'LOCAL',
    mark: <MarkText text="LM" />,
  },
  {
    key: 'custom',
    label: 'CUSTOM',
    display: 'Custom',
    badge: 'BYO',
    mark: <MarkText text="BYO" />,
  },
];

interface ProviderGridProps {
  caption?: string;
  dense?: boolean;
}

/**
 * 12-cell hairline-ruled provider grid.
 * 6x2 on md+, 4x3 on sm, 3x4 on <sm.
 * Server-rendered, zero JS, zero animation.
 */
export function ProviderGrid({
  caption = '12 PROVIDERS · ONE THREAD · ZERO LOCK-IN',
  dense = false,
}: ProviderGridProps): ReactNode {
  const cellSize = dense ? 'h-14 w-14' : 'h-16 w-16';

  return (
    <div className="w-full">
      {/* Grid */}
      <div
        className={['grid w-full', 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6'].join(' ')}
        role="list"
        aria-label="Supported AI providers"
      >
        {PROVIDERS.map((provider) => (
          <div
            key={provider.key}
            role="listitem"
            className={[
              'flex flex-col items-center justify-center gap-1 p-3',
              'border border-[var(--color-rule-soft)]',
              '-mt-px -ml-px', // collapse borders
              'relative',
              'group',
            ].join(' ')}
          >
            {/* Provider mark */}
            <div
              className={[
                'flex items-center justify-center',
                cellSize,
                'text-[var(--color-cream-on-graphite)]',
                'opacity-70 group-hover:opacity-100',
                'transition-opacity duration-[var(--dur-fast)]',
              ].join(' ')}
              aria-hidden="true"
            >
              {provider.mark}
            </div>

            {/* Caption strip */}
            <span
              className={[
                'font-mono text-[9px] tracking-[0.16em] uppercase',
                'text-[var(--color-fg-quiet)]',
                'text-center leading-none',
                'truncate w-full text-center',
              ].join(' ')}
            >
              {provider.label}
            </span>

            {/* LOCAL / BYO badge */}
            {provider.badge && (
              <span
                className={[
                  'absolute bottom-1 right-1',
                  'font-mono text-[8px] tracking-[0.1em] uppercase',
                  'px-1 py-px',
                  'border border-[var(--color-rule-soft)]',
                  'text-[var(--color-fg-quiet)]',
                  'leading-none',
                ].join(' ')}
                aria-label={provider.badge === 'LOCAL' ? 'Local model' : 'Bring your own endpoint'}
              >
                {provider.badge}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Hairline rule */}
      <div className="mt-0 border-t border-[var(--color-rule-soft)]" aria-hidden="true" />

      {/* Caption */}
      <p
        className={[
          'mt-4 text-center',
          'font-mono text-[11px] tracking-[0.2em] uppercase',
          'text-[var(--color-fg-quiet)]',
        ].join(' ')}
      >
        {caption}
      </p>
    </div>
  );
}
