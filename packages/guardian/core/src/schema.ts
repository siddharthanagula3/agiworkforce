import { z } from 'zod';

export const SCHEMA_VERSION = 1;

export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

export const FINDING_STATUSES = [
  'open',
  'fixed',
  'suppressed',
  'accepted-risk',
  'false-positive',
  'stale',
] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

export const FINDING_CATEGORIES = [
  'correctness',
  'security',
  'supply-chain',
  'privacy',
  'architecture',
  'technical-debt',
  'ai-slop',
  'completeness',
  'tests',
  'performance',
  'reliability',
  'maintainability',
  'billing',
  'documentation',
] as const;
export type FindingCategory = (typeof FINDING_CATEGORIES)[number];

export const SOURCE_TYPES = [
  'llm',
  'semgrep',
  'codeql',
  'trivy',
  'osv',
  'gitleaks',
  'knip',
  'jscpd',
  'eslint',
  'tsc',
  'clippy',
  'cargo-audit',
  'cargo-deny',
  'dependency-cruiser',
  'repo-check',
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const REACHABILITY = ['reachable', 'unreachable', 'unknown'] as const;
export const EXPLOITABILITY = ['confirmed', 'plausible', 'not-applicable', 'unknown'] as const;
export const AUTOFIXABILITY = ['safe', 'review-required', 'unsafe'] as const;

export const SuppressionSchema = z.object({
  suppressed_by: z.string().min(1),
  reason: z.string().min(1),
  expires_at: z.iso.datetime(),
  created_at: z.iso.datetime(),
});
export type Suppression = z.infer<typeof SuppressionSchema>;

export const DeterministicEvidenceSchema = z.object({
  source_type: z.enum(SOURCE_TYPES),
  rule_id: z.string().min(1),
  summary: z.string(),
});
export type DeterministicEvidence = z.infer<typeof DeterministicEvidenceSchema>;

export const FindingSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  finding_id: z.uuid(),
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  repository_id: z.number().int().nonnegative(),
  installation_id: z.number().int().nonnegative(),
  review_run_id: z.string().min(1),
  rule_id: z.string().min(1),
  source: z.string().min(1),
  source_type: z.enum(SOURCE_TYPES),
  category: z.enum(FINDING_CATEGORIES),
  subcategory: z.string().nullable().default(null),
  severity: z.enum(SEVERITIES),
  confidence: z.number().min(0).max(1),
  status: z.enum(FINDING_STATUSES).default('open'),
  path: z.string().min(1),
  start_line: z.number().int().positive().nullable().default(null),
  end_line: z.number().int().positive().nullable().default(null),
  symbol: z.string().nullable().default(null),
  title: z.string().min(1),
  evidence: z.string().min(1),
  impact: z.string().min(1),
  failure_scenario: z.string().nullable().default(null),
  reachability: z.enum(REACHABILITY).default('unknown'),
  exploitability: z.enum(EXPLOITABILITY).default('unknown'),
  introduced_by_sha: z.string().nullable().default(null),
  first_seen_sha: z.string().nullable().default(null),
  last_seen_sha: z.string().nullable().default(null),
  is_new: z.boolean().default(true),
  is_in_diff: z.boolean().default(false),
  deterministic_evidence: z.array(DeterministicEvidenceSchema).default([]),
  suggested_fix: z.string().nullable().default(null),
  autofixability: z.enum(AUTOFIXABILITY).default('review-required'),
  owner: z.string().nullable().default(null),
  suppression: SuppressionSchema.nullable().default(null),
  model_provider: z.string().nullable().default(null),
  model_id: z.string().nullable().default(null),
  input_tokens: z.number().int().nonnegative().default(0),
  output_tokens: z.number().int().nonnegative().default(0),
  sandbox_seconds: z.number().nonnegative().default(0),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});
export type Finding = z.infer<typeof FindingSchema>;
export type FindingInput = z.input<typeof FindingSchema>;

export const SCANNER_STATUSES = [
  'clean',
  'findings',
  'scanner-failed',
  'timeout',
  'skipped',
] as const;
export type ScannerStatus = (typeof SCANNER_STATUSES)[number];

export const ScannerRunSchema = z.object({
  scanner_id: z.string().min(1),
  source_type: z.enum(SOURCE_TYPES),
  version: z.string().min(1),
  status: z.enum(SCANNER_STATUSES),
  exit_code: z.number().int().nullable(),
  duration_ms: z.number().nonnegative(),
  finding_count: z.number().int().nonnegative(),
  error: z.string().nullable().default(null),
});
export type ScannerRun = z.infer<typeof ScannerRunSchema>;

export const REVIEW_RUN_EVENTS = [
  'push',
  'pull_request',
  'merge_group',
  'schedule',
  'command',
  'release',
] as const;

export const ReviewRunSchema = z.object({
  run_id: z.string().min(1),
  repository: z.string().min(1),
  repository_id: z.number().int().nonnegative(),
  installation_id: z.number().int().nonnegative(),
  event_type: z.enum(REVIEW_RUN_EVENTS),
  base_sha: z.string().nullable().default(null),
  head_sha: z.string().min(1),
  pull_number: z.number().int().positive().nullable().default(null),
  mode: z.enum(['shadow', 'advisory', 'blocking']),
  scanner_runs: z.array(ScannerRunSchema).default([]),
  created_at: z.iso.datetime(),
});
export type ReviewRun = z.infer<typeof ReviewRunSchema>;

export function parseFinding(value: unknown): Finding {
  return FindingSchema.parse(value);
}

export function safeParseFinding(
  value: unknown,
): { ok: true; finding: Finding } | { ok: false; error: string } {
  const result = FindingSchema.safeParse(value);
  if (result.success) return { ok: true, finding: result.data };
  return {
    ok: false,
    error: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
  };
}
