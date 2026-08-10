/**
 * Finding ranking and inline-comment budgeting.
 */
import type { GuardianConfig } from './config.js';
import { SEVERITY_WEIGHT, type Finding } from './schema.js';

/** Composite ranking score; higher publishes first. */
export function findingScore(finding: Finding): number {
  let score = SEVERITY_WEIGHT[finding.severity] * 1000;
  score += Math.round(finding.confidence * 100);
  if (finding.is_new) score += 250;
  if (finding.is_in_diff) score += 150;
  if (finding.deterministic_evidence.length > 0) score += 200;
  if (finding.exploitability === 'confirmed') score += 300;
  if (finding.reachability === 'reachable') score += 100;
  return score;
}

export function rankFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const diff = findingScore(b) - findingScore(a);
    if (diff !== 0) return diff;
    // Stable tie-break so output ordering is deterministic across runs.
    return a.fingerprint.localeCompare(b.fingerprint);
  });
}

/**
 * Select the findings that earn inline PR comments: ranked, above the inline
 * confidence threshold, inside the diff, and within the configured budget.
 * Everything else belongs in the check-run summary.
 */
export function selectInlineFindings(
  findings: readonly Finding[],
  config: GuardianConfig,
): Finding[] {
  const budget = config.review.max_inline_comments;
  if (budget === 0) return [];
  return rankFindings(findings)
    .filter(
      (f) =>
        f.is_in_diff &&
        f.confidence >= config.review.minimum_inline_confidence &&
        (SEVERITY_WEIGHT[f.severity] >= SEVERITY_WEIGHT.medium ||
          f.deterministic_evidence.length > 0),
    )
    .slice(0, budget);
}
