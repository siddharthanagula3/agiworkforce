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

import type { SecretScanFinding } from '@agiworkforce/types';

interface SecretRedactionPattern {
  id: string;
  label: string;
  severity: SecretScanFinding['severity'];
  pattern: RegExp;
  replacement: string;
}

export interface SecretScanOptions {
  location?: string;
  maxFindings?: number;
}

export interface SecretScanResult {
  redactedText: string;
  findings: SecretScanFinding[];
  redactedByteCount: number;
}

const textEncoder = new TextEncoder();

const REDACTION_PATTERNS: readonly SecretRedactionPattern[] = [
  // Order matters — more specific patterns first.
  {
    // Ported from the Rust reference at apps/cli/src/secret_redaction.rs:93.
    // FIRST in the table on purpose: a PEM block spans newlines and contains
    // base64 that later, narrower rules would otherwise chew into pieces,
    // leaving recognisable key material behind. `[\s\S]` rather than `.` with
    // the s flag, to keep this readable next to the other patterns.
    id: 'private-key',
    label: 'Private key block',
    severity: 'critical',
    pattern:
      /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
    replacement: '[REDACTED_PRIVATE_KEY]',
  },
  {
    // AWS secrets are not self-identifying the way AKIA/ASIA ids are — the
    // value is plain base64 — so they are only findable by their assignment.
    // The Rust side catches these (secret_redaction.rs:124); this port did
    // not, which is exactly the asymmetry that makes a Local -> BYOK handoff
    // preview look clean while carrying a live credential.
    id: 'aws-secret-assignment',
    label: 'AWS secret or session token assignment',
    severity: 'critical',
    // Name spelling follows the Rust rule: the AWS CLI, the SDK env vars and
    // most config files disagree on `_` vs `-`, and JSON puts a quote between
    // the name and the colon. The value class is everything up to the next
    // delimiter, since secrets carry `/` and `+`; the `(?!\[REDACTED)` keeps
    // a placeholder another rule already substituted from being re-chewed.
    pattern:
      /\b(aws[_-]?(?:secret[_-]?access[_-]?key|session[_-]?token))\b["']?\s*[=:]\s*["']?(?!\[REDACTED)[^\s,'"}]{8,}["']?/gi,
    replacement: '$1=[REDACTED_AWS_SECRET]',
  },
  {
    id: 'anthropic-api-key',
    label: 'Anthropic API key',
    severity: 'critical',
    pattern: /sk-ant-[a-zA-Z0-9_-]{20,}/g,
    replacement: '[REDACTED_ANTHROPIC_KEY]',
  },
  {
    id: 'generic-api-key',
    label: 'API key',
    severity: 'high',
    pattern: /sk-[a-zA-Z0-9_-]{20,}/g,
    replacement: '[REDACTED_API_KEY]',
  },
  {
    id: 'google-api-key',
    label: 'Google API key',
    severity: 'critical',
    // Open-ended, not `{35}`. Google publishes no length contract; the exact
    // count only describes the keys minted today. A fixed quantifier misses
    // anything shorter outright and, on anything longer, redacts a 39-char
    // prefix while leaving the tail in the preview.
    pattern: /AIza[a-zA-Z0-9_-]{30,}/g,
    replacement: '[REDACTED_GOOGLE_KEY]',
  },
  {
    id: 'groq-api-key',
    label: 'Groq API key',
    severity: 'critical',
    pattern: /gsk_[a-zA-Z0-9]{48,}/g,
    replacement: '[REDACTED_GROQ_KEY]',
  },
  {
    id: 'stripe-key',
    label: 'Stripe key',
    severity: 'critical',
    pattern: /(?:sk|pk|rk)_(?:test|live)_[a-zA-Z0-9]{24,}/g,
    replacement: '[REDACTED_STRIPE_KEY]',
  },
  {
    id: 'aws-access-key',
    label: 'AWS access key',
    severity: 'critical',
    pattern: /A(?:KIA|SIA)[A-Z0-9]{16}/g,
    replacement: '[REDACTED_AWS_KEY]',
  },
  {
    id: 'github-token',
    label: 'GitHub token',
    severity: 'critical',
    // 30, matching the Rust rule: 36 is the length of a user-to-server token
    // body, and the shorter server-to-server and refresh variants share the
    // prefix table without sharing that length.
    pattern: /gh[psour]_[a-zA-Z0-9]{30,}/g,
    replacement: '[REDACTED_GITHUB_TOKEN]',
  },
  {
    id: 'github-pat',
    label: 'GitHub personal access token',
    severity: 'critical',
    pattern: /github_pat_[a-zA-Z0-9_]{22,}/g,
    replacement: '[REDACTED_GITHUB_TOKEN]',
  },
  {
    id: 'xai-api-key',
    label: 'xAI API key',
    severity: 'critical',
    pattern: /xai-[a-zA-Z0-9]{20,}/g,
    replacement: '[REDACTED_XAI_KEY]',
  },
  {
    id: 'slack-token',
    label: 'Slack token',
    severity: 'critical',
    pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/g,
    replacement: '[REDACTED_SLACK_TOKEN]',
  },
  // JWT (header.payload.signature) — ported from extension recorder (C-05).
  {
    id: 'jwt',
    label: 'JWT',
    severity: 'high',
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    replacement: '[REDACTED_JWT]',
  },
  {
    id: 'bearer-token',
    label: 'Bearer token',
    severity: 'high',
    pattern: /bearer\s+[a-zA-Z0-9._\-/+=]{8,}/gi,
    replacement: 'Bearer [REDACTED_TOKEN]',
  },
  {
    id: 'named-secret',
    label: 'Named secret',
    severity: 'high',
    // Three widenings over the first port, each a live miss the Rust rule
    // caught: bare `secret`/`token` names (word-bounded, so the compound
    // spellings above still win); the quote a JSON key puts before its colon;
    // and a value class of "anything up to the delimiter" rather than an
    // alphanumeric guess, since passwords and tokens carry punctuation.
    // The value class keeps Rust's brackets (a bracketed value such as
    // `token=[abcdefghij12345]` is a secret like any other); the leading
    // `(?!\[REDACTED)` is what stops an earlier rule's `[REDACTED_*]`
    // placeholder being matched as a value and flattened a second time,
    // which would throw away the vendor attribution.
    pattern:
      /(api[_-]?key|apikey|secret[_-]?key|access[_-]?token|auth[_-]?token|\bsecret\b|\btoken\b)["']?\s*[=:]\s*["']?(?!\[REDACTED)[^\s,'"}]{8,}["']?/gi,
    replacement: '$1=[REDACTED]',
  },
  {
    id: 'database-url-credentials',
    label: 'Database URL credentials',
    severity: 'critical',
    // `postgresql://` and `mongodb+srv://` are the spellings ORMs and Atlas
    // actually emit, and the earlier scheme list matched neither — a
    // DATABASE_URL pasted into a handoff preview crossed with its password.
    // The password class is the Rust one (`[^\s]+`, secret_redaction.rs) and
    // must stay that wide: generated passwords are base64, so `/` and `+` are
    // routine, and an earlier revision of this rule that excluded `/` silently
    // stopped redacting `postgres://user:npg_x9Kq/L2mZ@host/db`. Being greedy
    // to the last `@` in a whitespace-free token can over-redact a following
    // `user@host` in the same JSON blob; that is the fail-safe direction and
    // matches the Rust reference.
    pattern: /(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s/:@]+:[^\s]+@/gi,
    replacement: '$1://[CREDENTIALS_REDACTED]@',
  },
  // Page-context redactor patterns ported from
  // `apps/extension/src/inPagePanel/pageActions.ts` (H-05 audit 2026-05-19).
  // Credit-card number sequences (13-19 digits with optional separators).
  {
    id: 'payment-card-number',
    label: 'Payment card number',
    severity: 'critical',
    // Narrowed to the shapes cards actually take, matching the Rust reference
    // at apps/desktop/src-tauri/src/sys/security/log_redaction.rs:104. The old
    // generic 13-19 digit run matched epoch-millisecond timestamps, so
    // `ts=1721469876543` and every `{"startedAt":...}` in a log line came back
    // as [REDACTED]. A redactor that eats ordinary telemetry gets narrowed by
    // whoever is debugging at 2am, which is how the real patterns get lost.
    pattern: /\b(?:\d{4}[ \t-]){3}\d{4}\b|\b\d{4}[ \t-]\d{6}[ \t-]\d{5}\b|\b[3-6]\d{12,18}\b/g,
    replacement: '[REDACTED]',
  },
  // Lines containing the word "password" or "passwd" (case-insensitive,
  // multi-line) — used to mask form labels that drag the value with them.
  // This also covers the `--password=` half of the Rust password-flag rule.
  // The `-p <value>` half is deliberately not ported: unanchored `-p` matches
  // the middle of ordinary hyphenated words, and a redactor that mangles prose
  // is one somebody turns off.
  {
    id: 'password-line',
    label: 'Password-bearing line',
    severity: 'critical',
    pattern: /^.*\bpassw(?:or)?d\b.*$/gim,
    replacement: '[REDACTED LINE]',
  },
];

function stringifyForRedaction(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof Error) {
    return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ''}`;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function byteLength(value: string): number {
  return textEncoder.encode(value).byteLength;
}

function applyRedactionPatterns(text: string): string {
  let redactedText = text;
  for (const { pattern, replacement } of REDACTION_PATTERNS) {
    const redactPattern = new RegExp(pattern.source, pattern.flags);
    redactedText = redactedText.replace(redactPattern, replacement);
  }
  return redactedText;
}

function redactedSnippet(text: string, start: number, end: number): string {
  const previewStart = Math.max(0, start - 24);
  const previewEnd = Math.min(text.length, end + 24);
  return applyRedactionPatterns(text.slice(previewStart, previewEnd)).slice(0, 160);
}

export function redactSecretsWithReport(
  value: unknown,
  options: SecretScanOptions = {},
): SecretScanResult {
  const text = stringifyForRedaction(value);
  const location = options.location ?? 'payload';
  const maxFindings = options.maxFindings ?? 100;
  const findings: SecretScanFinding[] = [];
  let redactedByteCount = 0;

  for (const rule of REDACTION_PATTERNS) {
    const scanPattern = new RegExp(rule.pattern.source, rule.pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = scanPattern.exec(text)) !== null) {
      const matched = match[0] ?? '';
      if (matched.length === 0) break;

      redactedByteCount += byteLength(matched);
      if (findings.length < maxFindings) {
        findings.push({
          id: `${rule.id}-${String(findings.length + 1).padStart(3, '0')}`,
          ruleId: rule.id,
          label: rule.label,
          severity: rule.severity,
          location,
          redactedPreview: redactedSnippet(text, match.index, match.index + matched.length),
        });
      }
    }
  }

  return { redactedText: applyRedactionPatterns(text), findings, redactedByteCount };
}

export function scanSecrets(value: unknown, options: SecretScanOptions = {}): SecretScanFinding[] {
  return redactSecretsWithReport(value, options).findings;
}

/** Apply the redaction patterns to any value safe-stringified. */
export function redactSecrets(value: unknown): string {
  return redactSecretsWithReport(value).redactedText;
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
