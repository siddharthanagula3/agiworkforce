import { randomUUID } from 'node:crypto';

import { computeFingerprint, normalizePath } from '../fingerprint.js';
import {
  FindingSchema,
  SCHEMA_VERSION,
  type Finding,
  type ScannerRun,
  type SourceType,
} from '../schema.js';
import type { AdapterOutcome, RawFinding } from './types.js';

export interface RunContext {
  repositoryId: number;
  installationId: number;
  reviewRunId: string;
  headSha: string;
  baseSha?: string | null;
  now: () => Date;
  newId?: () => string;
}

export function finalizeFinding(raw: RawFinding, ctx: RunContext): Finding {
  const timestamp = ctx.now().toISOString();
  return FindingSchema.parse({
    schema_version: SCHEMA_VERSION,
    finding_id: (ctx.newId ?? randomUUID)(),
    fingerprint: computeFingerprint({
      repositoryId: ctx.repositoryId,
      ruleId: raw.rule_id,
      path: normalizePath(raw.path),
      symbol: raw.symbol ?? null,
      evidence: raw.evidence,
      rootCause: raw.subcategory ?? null,
    }),
    repository_id: ctx.repositoryId,
    installation_id: ctx.installationId,
    review_run_id: ctx.reviewRunId,
    rule_id: raw.rule_id,
    source: raw.source,
    source_type: raw.source_type,
    category: raw.category,
    subcategory: raw.subcategory ?? null,
    severity: raw.severity,
    confidence: raw.confidence,
    status: 'open',
    path: normalizePath(raw.path),
    start_line: raw.start_line ?? null,
    end_line: raw.end_line ?? raw.start_line ?? null,
    symbol: raw.symbol ?? null,
    title: raw.title,
    evidence: raw.evidence,
    impact: raw.impact,
    failure_scenario: raw.failure_scenario ?? null,
    introduced_by_sha: null,
    first_seen_sha: ctx.headSha,
    last_seen_sha: ctx.headSha,
    is_new: true,
    is_in_diff: false,
    deterministic_evidence: raw.deterministic_evidence ?? [],
    suggested_fix: raw.suggested_fix ?? null,
    created_at: timestamp,
    updated_at: timestamp,
  });
}

export interface ScannerMeta {
  scannerId: string;
  sourceType: SourceType;
  version: string;
  durationMs: number;
  exitCode: number | null;
}

export function finalizeOutcome(
  meta: ScannerMeta,
  outcome: AdapterOutcome,
  ctx: RunContext,
): { scannerRun: ScannerRun; findings: Finding[] } {
  const findings =
    outcome.status === 'scanner-failed'
      ? []
      : outcome.findings.map((raw) => finalizeFinding(raw, ctx));
  return {
    scannerRun: {
      scanner_id: meta.scannerId,
      source_type: meta.sourceType,
      version: meta.version,
      status: outcome.status === 'findings' && findings.length === 0 ? 'clean' : outcome.status,
      exit_code: meta.exitCode,
      duration_ms: meta.durationMs,
      finding_count: findings.length,
      error:
        outcome.status === 'scanner-failed' ? (outcome.error ?? 'unknown scanner failure') : null,
    },
    findings,
  };
}
