import type { DeterministicEvidence, FindingCategory, Severity, SourceType } from '../schema.js';

export interface RawFinding {
  rule_id: string;
  source: string;
  source_type: SourceType;
  category: FindingCategory;
  subcategory?: string | null;
  severity: Severity;
  confidence: number;
  path: string;
  start_line?: number | null;
  end_line?: number | null;
  symbol?: string | null;
  title: string;
  evidence: string;
  impact: string;
  failure_scenario?: string | null;
  suggested_fix?: string | null;
  deterministic_evidence?: DeterministicEvidence[];
}

export interface AdapterOutcome {
  status: 'clean' | 'findings' | 'scanner-failed';
  findings: RawFinding[];
  error?: string;
}

const SECRET_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    '[REDACTED PRIVATE KEY]',
  ],
  [/((?:proxy-)?authorization["']?\s*[:=]\s*)[^\r\n]+/gi, '$1[REDACTED]'],
  [/\b(bearer|basic|digest)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [REDACTED]'],
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}/g, '[REDACTED]'],
  [/(?:github_pat|gh[pousr])_[A-Za-z0-9_]{20,}/g, '[REDACTED]'],
  [/sk-[A-Za-z0-9_-]{16,}/g, '[REDACTED]'],
  [/(?:sk|rk|whsec)_[A-Za-z0-9_-]{16,}/g, '[REDACTED]'],
  [/AIza[A-Za-z0-9_-]{20,}/g, '[REDACTED]'],
  [/AKIA[0-9A-Z]{16}/g, '[REDACTED]'],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/g, '[REDACTED]'],
  [
    /((?:password|passwd|secret|token|api[_-]?key|apikey|credential)[A-Za-z0-9_-]*["']?\s*[:=]\s*)(["']?)[^\s"',;)\]}]{6,}\2/gi,
    '$1$2[REDACTED]$2',
  ],
];

const OPAQUE_TOKEN = /[A-Za-z0-9+/]{40,}={0,2}|[A-Za-z0-9_+=-]{32,}/g;

function hasMixedCharacterClasses(token: string): boolean {
  return /[a-z]/.test(token) && /[A-Z]/.test(token) && /[0-9]/.test(token);
}

export function redactSecrets(text: string): string {
  const withKnownShapes = SECRET_PATTERNS.reduce(
    (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
    text,
  );
  return withKnownShapes.replace(OPAQUE_TOKEN, (token) =>
    hasMixedCharacterClasses(token) ? '[REDACTED]' : token,
  );
}

export function toEvidence(text: string, maxLength = 500): string {
  const collapsed = redactSecrets(text).replace(/\s+/g, ' ').trim();
  return collapsed.length > maxLength ? `${collapsed.slice(0, maxLength - 1)}…` : collapsed;
}
