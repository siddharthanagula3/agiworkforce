/**
 * @agiworkforce/utils — logger facade (FIX-024)
 *
 * Replaces ad-hoc `console.log` / `console.error` across the desktop +
 * web codebases. Provides four levels (debug, info, warn, error) with:
 *
 *   - dev: forwards to console.* with the same level
 *   - prod: routes warn/error to Sentry (when wired); info/debug dropped
 *   - always: redacts well-known secret patterns from message + args
 *
 * The redaction list is a TypeScript port of the Rust patterns in
 * `apps/desktop/src-tauri/src/sys/security/log_redaction.rs` so the same
 * keys never leak into Sentry / browser DevTools / log files regardless
 * of which side of the IPC boundary emitted them.
 */

const REDACTION_PATTERNS: readonly { pattern: RegExp; replacement: string }[] = [
  // Order matters — more specific patterns first.
  { pattern: /sk-ant-[a-zA-Z0-9_-]{20,}/g, replacement: '[REDACTED_ANTHROPIC_KEY]' },
  { pattern: /sk-[a-zA-Z0-9_-]{20,}/g, replacement: '[REDACTED_API_KEY]' },
  { pattern: /AIzaSy[a-zA-Z0-9_-]{33}/g, replacement: '[REDACTED_GOOGLE_KEY]' },
  { pattern: /gsk_[a-zA-Z0-9]{48,}/g, replacement: '[REDACTED_GROQ_KEY]' },
  { pattern: /(?:sk|pk|rk)_(?:test|live)_[a-zA-Z0-9]{24,}/g, replacement: '[REDACTED_STRIPE_KEY]' },
  { pattern: /AKIA[A-Z0-9]{16}/g, replacement: '[REDACTED_AWS_KEY]' },
  { pattern: /gh[ps]_[a-zA-Z0-9]{36,}/g, replacement: '[REDACTED_GITHUB_TOKEN]' },
  { pattern: /github_pat_[a-zA-Z0-9_]{22,}/g, replacement: '[REDACTED_GITHUB_TOKEN]' },
  { pattern: /xai-[a-zA-Z0-9]{20,}/g, replacement: '[REDACTED_XAI_KEY]' },
  { pattern: /bearer\s+[a-zA-Z0-9._\-/+=]{20,}/gi, replacement: 'Bearer [REDACTED_TOKEN]' },
  {
    pattern:
      /(api[_-]?key|apikey|secret[_-]?key|access[_-]?token|auth[_-]?token)\s*[=:]\s*['"]?[a-zA-Z0-9_\-/.+=]{16,}['"]?/gi,
    replacement: '$1=[REDACTED]',
  },
  {
    pattern: /(postgres|mysql|mongodb|redis):\/\/[^:]+:[^@]+@/gi,
    replacement: '$1://[CREDENTIALS_REDACTED]@',
  },
];

/** Apply the redaction patterns to any value safe-stringified. */
export function redactSecrets(value: unknown): string {
  let text: string;
  if (typeof value === 'string') {
    text = value;
  } else if (value instanceof Error) {
    text = `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ''}`;
  } else {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  }
  for (const { pattern, replacement } of REDACTION_PATTERNS) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Redact every arg and forward to the chosen sink. The sink contract
 * matches `console.*(...args: unknown[])` so the original site can be
 * replaced 1:1 by `logger.<level>(...)`.
 */
type LogSink = (level: LogLevel, args: unknown[]) => void;

const isProduction =
  typeof process !== 'undefined' &&
  // Vite-style and Node-style env detection both fall back to `development`.
  ((process.env?.['NODE_ENV'] === 'production' || process.env?.['MODE'] === 'production') ?? false);

const consoleSink: LogSink = (level, args) => {
  const redacted = args.map(redactSecrets);
  // eslint-disable-next-line no-console -- this is the one approved sink
  console[level](...redacted);
};

// Sentry sink is wired lazily — many entry points (CLI, web SSR, tests)
// don't have Sentry installed. If `window.Sentry` or a globally-set
// `globalThis.__AGIWORKFORCE_SENTRY__` exists, warn/error get a breadcrumb.
const sentrySink: LogSink = (level, args) => {
  const redacted = args.map(redactSecrets);
  // eslint-disable-next-line no-console -- production console fallback
  console[level](...redacted);

  const sentryGlobal =
    (typeof window !== 'undefined' &&
      (window as unknown as { Sentry?: { captureMessage?: (m: string) => void } }).Sentry) ||
    (
      globalThis as unknown as {
        __AGIWORKFORCE_SENTRY__?: { captureMessage?: (m: string) => void };
      }
    ).__AGIWORKFORCE_SENTRY__;

  if (sentryGlobal?.captureMessage && (level === 'warn' || level === 'error')) {
    sentryGlobal.captureMessage(redacted.join(' '));
  }
};

const sink: LogSink = isProduction ? sentrySink : consoleSink;

export const logger = {
  debug: (...args: unknown[]) => {
    // Drop in production unless DEBUG flag is set — keeps prod console clean.
    if (!isProduction || (typeof process !== 'undefined' && process.env?.['DEBUG'] !== undefined)) {
      sink('debug', args);
    }
  },
  info: (...args: unknown[]) => {
    if (!isProduction) sink('info', args);
  },
  warn: (...args: unknown[]) => sink('warn', args),
  error: (...args: unknown[]) => sink('error', args),
};

export type { LogLevel };
