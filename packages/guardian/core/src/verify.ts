/**
 * Finding verification gate.
 *
 * No finding — LLM-sourced above all — may be published until it passes this
 * gate against the exact reviewed head SHA. The gate is pure: all repository
 * state is supplied through VerificationContext so tests can drive it with
 * deterministic fixtures.
 */
import { matchesIgnorePath, type GuardianConfig } from './config.js';
import { normalizePath } from './fingerprint.js';
import type { Finding } from './schema.js';

export interface DiffRange {
  start: number;
  end: number;
}

export interface VerificationContext {
  headSha: string;
  /** Lines per repo-relative path at headSha; absent key = file not present. */
  fileLines: ReadonlyMap<string, number>;
  /** Changed line ranges per path for the current diff (merge-base..head). */
  diffRanges: ReadonlyMap<string, readonly DiffRange[]>;
  /** Fingerprints already reported on this PR/branch (open or suppressed). */
  knownFingerprints: ReadonlySet<string>;
  config: GuardianConfig;
}

export type Verdict =
  | { action: 'publish'; inlineEligible: boolean }
  | { action: 'demote-to-summary'; reasons: string[] }
  | { action: 'reject'; reasons: string[] };

const SPECULATIVE_PATTERNS = [
  /\bmight\b/i,
  /\bcould potentially\b/i,
  /\bpossibly\b/i,
  /\bmay or may not\b/i,
  /\bconsider (?:reviewing|checking|verifying)\b/i,
];

/**
 * Verify one finding against the reviewed head state.
 *
 * Rejections are hard failures (invalid path/lines, duplicate, stale).
 * Demotions keep real but weaker findings out of inline comments while still
 * surfacing them in the check-run summary.
 */
export function verifyFinding(finding: Finding, ctx: VerificationContext): Verdict {
  const reasons: string[] = [];
  const path = normalizePath(finding.path);

  if (finding.last_seen_sha !== null && finding.last_seen_sha !== ctx.headSha) {
    return {
      action: 'reject',
      reasons: [`stale: finding was produced for ${finding.last_seen_sha}, head is ${ctx.headSha}`],
    };
  }

  if (matchesIgnorePath(path, ctx.config.ignore.paths)) {
    return { action: 'reject', reasons: [`path is ignored by config: ${path}`] };
  }

  const lineCount = ctx.fileLines.get(path);
  if (lineCount === undefined) {
    return { action: 'reject', reasons: [`path does not exist at head SHA: ${path}`] };
  }

  if (finding.start_line !== null) {
    const end = finding.end_line ?? finding.start_line;
    if (end < finding.start_line) {
      return { action: 'reject', reasons: [`invalid line range ${finding.start_line}-${end}`] };
    }
    if (finding.start_line > lineCount || end > lineCount) {
      return {
        action: 'reject',
        reasons: [`line range ${finding.start_line}-${end} exceeds file length ${lineCount}`],
      };
    }
  }

  if (ctx.knownFingerprints.has(finding.fingerprint)) {
    return { action: 'reject', reasons: ['duplicate: fingerprint already reported'] };
  }

  // Diff relevance: findings outside the changed ranges are contextual debt.
  const inDiff = isInDiff(path, finding.start_line, finding.end_line, ctx.diffRanges);
  if (!inDiff && !ctx.config.review.include_preexisting_context) {
    return {
      action: 'reject',
      reasons: ['outside the current diff and pre-existing context is disabled'],
    };
  }

  // Speculative LLM findings with no concrete failure story never publish.
  if (finding.source_type === 'llm') {
    const hasConcreteEvidence =
      finding.deterministic_evidence.length > 0 ||
      (finding.failure_scenario !== null && finding.failure_scenario.trim().length >= 20);
    if (!hasConcreteEvidence) {
      return {
        action: 'reject',
        reasons: ['LLM finding lacks a concrete failure scenario and deterministic evidence'],
      };
    }
    if (SPECULATIVE_PATTERNS.some((p) => p.test(finding.title) || p.test(finding.evidence))) {
      reasons.push('speculative wording');
    }
  }

  if (finding.confidence < ctx.config.review.minimum_summary_confidence) {
    return {
      action: 'reject',
      reasons: [
        `confidence ${finding.confidence} below summary threshold ${ctx.config.review.minimum_summary_confidence}`,
      ],
    };
  }

  const inlineEligible =
    inDiff &&
    reasons.length === 0 &&
    finding.confidence >= ctx.config.review.minimum_inline_confidence;

  if (!inlineEligible && reasons.length > 0) {
    return { action: 'demote-to-summary', reasons };
  }
  return { action: 'publish', inlineEligible };
}

export function isInDiff(
  path: string,
  startLine: number | null,
  endLine: number | null,
  diffRanges: ReadonlyMap<string, readonly DiffRange[]>,
): boolean {
  const ranges = diffRanges.get(normalizePath(path));
  if (!ranges || ranges.length === 0) return false;
  if (startLine === null) return true; // file-level finding on a changed file
  const end = endLine ?? startLine;
  return ranges.some((r) => startLine <= r.end && end >= r.start);
}

export interface VerifiedBatch {
  publishable: Finding[];
  inline: Finding[];
  rejected: Array<{ finding: Finding; reasons: string[] }>;
}

/** Verify a batch, updating the known-fingerprint set as findings pass. */
export function verifyFindings(
  findings: readonly Finding[],
  ctx: VerificationContext,
): VerifiedBatch {
  const known = new Set(ctx.knownFingerprints);
  const publishable: Finding[] = [];
  const inline: Finding[] = [];
  const rejected: Array<{ finding: Finding; reasons: string[] }> = [];

  for (const finding of findings) {
    const verdict = verifyFinding(finding, { ...ctx, knownFingerprints: known });
    if (verdict.action === 'reject') {
      rejected.push({ finding, reasons: verdict.reasons });
      continue;
    }
    known.add(finding.fingerprint);
    publishable.push(finding);
    if (verdict.action === 'publish' && verdict.inlineEligible) inline.push(finding);
  }
  return { publishable, inline, rejected };
}
