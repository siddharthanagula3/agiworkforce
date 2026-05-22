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
    pattern: /AIzaSy[a-zA-Z0-9_-]{33}/g,
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
    pattern: /AKIA[A-Z0-9]{16}/g,
    replacement: '[REDACTED_AWS_KEY]',
  },
  {
    id: 'github-token',
    label: 'GitHub token',
    severity: 'critical',
    pattern: /gh[ps]_[a-zA-Z0-9]{36,}/g,
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
    pattern: /bearer\s+[a-zA-Z0-9._\-/+=]{20,}/gi,
    replacement: 'Bearer [REDACTED_TOKEN]',
  },
  {
    id: 'named-secret',
    label: 'Named secret',
    severity: 'high',
    pattern:
      /(api[_-]?key|apikey|secret[_-]?key|access[_-]?token|auth[_-]?token)\s*[=:]\s*['"]?[a-zA-Z0-9_\-/.+=]{16,}['"]?/gi,
    replacement: '$1=[REDACTED]',
  },
  {
    id: 'database-url-credentials',
    label: 'Database URL credentials',
    severity: 'critical',
    pattern: /(postgres|mysql|mongodb|redis):\/\/[^:]+:[^@]+@/gi,
    replacement: '$1://[CREDENTIALS_REDACTED]@',
  },
  // Page-context redactor patterns ported from
  // `apps/extension/src/inPagePanel/pageActions.ts` (H-05 audit 2026-05-19).
  // Credit-card number sequences (13-19 digits with optional separators).
  {
    id: 'payment-card-number',
    label: 'Payment card number',
    severity: 'critical',
    pattern: /\b(?:\d[ \t-]?){13,19}\b/g,
    replacement: '[REDACTED]',
  },
  // Lines containing the word "password" or "passwd" (case-insensitive,
  // multi-line) — used to mask form labels that drag the value with them.
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
