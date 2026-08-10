/**
 * Shared adapter contracts.
 *
 * Adapters are pure parsers: raw tool output in, RawFinding[] + ScannerRun
 * out. They never talk to the network or filesystem, which keeps them fully
 * testable from recorded fixtures. Finalization (ids, fingerprints,
 * timestamps) happens in builder.ts with an explicit RunContext.
 */
import type { DeterministicEvidence, FindingCategory, Severity, SourceType } from '../schema.js';

/** Adapter-produced finding before run-level finalization. */
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
  /** Present when status is scanner-failed. */
  error?: string;
}

/**
 * Redact anything that looks like a credential from text destined for
 * findings, logs, or models. Intentionally aggressive: false redaction is
 * cheap, a leaked secret is not.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/(gh[pousr]_[A-Za-z0-9]{20,})/g, '[REDACTED]')
    .replace(/(sk-[A-Za-z0-9_-]{16,})/g, '[REDACTED]')
    .replace(/(AKIA[0-9A-Z]{16})/g, '[REDACTED]')
    .replace(/(xox[baprs]-[A-Za-z0-9-]{10,})/g, '[REDACTED]')
    .replace(
      /(-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----)/g,
      '[REDACTED PRIVATE KEY]',
    )
    .replace(
      /((?:password|passwd|secret|token|api[_-]?key|authorization)\s*[=:]\s*)(["']?)[^\s"']{6,}\2/gi,
      '$1$2[REDACTED]$2',
    );
}

/** Clamp arbitrary tool text to a bounded, single-line evidence string. */
export function toEvidence(text: string, maxLength = 500): string {
  const collapsed = redactSecrets(text).replace(/\s+/g, ' ').trim();
  return collapsed.length > maxLength ? `${collapsed.slice(0, maxLength - 1)}…` : collapsed;
}
