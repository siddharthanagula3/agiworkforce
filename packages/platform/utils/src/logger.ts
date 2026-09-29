import type { SecretScanFinding } from '@agiworkforce/types';

import { REDACTION_POLICIES, SECRET_PATTERN_RULES } from './secretRedaction';

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

const REDACTION_PATTERNS: readonly SecretRedactionPattern[] = REDACTION_POLICIES.log.map(
  ({ rule, replacement }) => ({
    id: rule,
    label: SECRET_PATTERN_RULES[rule].label,
    severity: SECRET_PATTERN_RULES[rule].severity,
    pattern: SECRET_PATTERN_RULES[rule].pattern,
    replacement,
  }),
);

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

export function redactSecrets(value: unknown): string {
  return redactSecretsWithReport(value).redactedText;
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogSink = (level: LogLevel, args: unknown[]) => void;

const isProduction =
  typeof process !== 'undefined' &&
  ((process.env?.['NODE_ENV'] === 'production' || process.env?.['MODE'] === 'production') ?? false);

const consoleSink: LogSink = (level, args) => {
  const redacted = args.map(redactSecrets);
  // eslint-disable-next-line no-console -- this is the one approved sink
  console[level](...redacted);
};

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
