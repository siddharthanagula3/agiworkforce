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
  {
    id: 'private-key',
    label: 'Private key block',
    severity: 'critical',
    pattern:
      /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
    replacement: '[REDACTED_PRIVATE_KEY]',
  },
  {
    id: 'aws-secret-assignment',
    label: 'AWS secret or session token assignment',
    severity: 'critical',
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
    pattern:
      /(api[_-]?key|apikey|secret[_-]?key|access[_-]?token|auth[_-]?token|\bsecret\b|\btoken\b)["']?\s*[=:]\s*["']?(?!\[REDACTED)[^\s,'"}]{8,}["']?/gi,
    replacement: '$1=[REDACTED]',
  },
  {
    id: 'compound-named-secret',
    label: 'Named secret with a compound field name',
    severity: 'high',
    // `_` is a word character, so the named-secret rule's \bsecret\b never fires on
    // snake_case field names such as `session_secret`. The leading boundary is consumed
    // rather than asserted so the benign-`*_key` exclusion cannot be sidestepped by
    // restarting the match one character into the field name.
    pattern:
      /(^|[^A-Za-z0-9_-])((?!(?:public|idempotency|partition|primary|foreign|composite|sort|row|object|cache|shard|group|index|locale|translation|column|query|search|route|storage|bucket|blob|map|dedupe?)[_-]keys?[^A-Za-z0-9])[A-Za-z0-9]+(?:[_-][A-Za-z0-9]+)*?[_-](?:secrets?|tokens?|passphrases?|credentials?|keys?))["']?\s*[=:]\s*["']?(?!\[REDACTED)[^\s,'"}]{8,}["']?/gi,
    replacement: '$1$2=[REDACTED]',
  },
  {
    id: 'database-url-credentials',
    label: 'Database URL credentials',
    severity: 'critical',
    pattern: /(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s/:@]+:[^\s]+@/gi,
    replacement: '$1://[CREDENTIALS_REDACTED]@',
  },
  {
    id: 'payment-card-number',
    label: 'Payment card number',
    severity: 'critical',
    pattern: /\b(?:\d{4}[ \t-]){3}\d{4}\b|\b\d{4}[ \t-]\d{6}[ \t-]\d{5}\b|\b[3-6]\d{12,18}\b/g,
    replacement: '[REDACTED]',
  },
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
