import type { GuardianConfig } from './config.js';
import type { Finding, ScannerRun, Suppression } from './schema.js';

export type CheckConclusion = 'success' | 'neutral' | 'failure';

export interface PolicyDecision {
  conclusion: CheckConclusion;
  blocking: Finding[];
  advisory: Finding[];
  reasons: string[];
}

function isExpired(suppression: Suppression, now: Date): boolean {
  return new Date(suppression.expires_at).getTime() <= now.getTime();
}

/**
 * Evaluate the final policy for a run.
 *
 * @param findings verified findings for this run (post-dedupe)
 * @param scannerRuns execution records; a scanner-failed record is evidence
 *   of nothing having been scanned, never of a clean result
 */
export function evaluatePolicy(
  findings: readonly Finding[],
  scannerRuns: readonly ScannerRun[],
  config: GuardianConfig,
  now: Date = new Date(),
): PolicyDecision {
  const reasons: string[] = [];
  const blocking: Finding[] = [];
  const advisory: Finding[] = [];

  const active = findings.filter((f) => {
    if (f.suppression === null) return true;
    if (isExpired(f.suppression, now)) {
      reasons.push(`suppression expired for ${f.rule_id} (${f.path})`);
      return true;
    }
    return false;
  });

  for (const finding of active) {
    if (isBlockingEligible(finding, config)) blocking.push(finding);
    else advisory.push(finding);
  }

  const failedScanners = scannerRuns.filter(
    (s) => s.status === 'scanner-failed' || s.status === 'timeout',
  );
  for (const scanner of failedScanners) {
    reasons.push(`scanner did not complete: ${scanner.scanner_id} (${scanner.status})`);
  }

  const expiredSuppressionFailure =
    config.baseline.fail_on_expired_suppressions &&
    active.some((f) => f.suppression !== null && isExpired(f.suppression, now));

  if (config.mode === 'shadow') {
    reasons.unshift('shadow mode: findings are advisory only');
    return { conclusion: 'neutral', blocking: [], advisory: [...blocking, ...advisory], reasons };
  }

  const wouldFail =
    blocking.length > 0 ||
    (config.blocking.deterministic_scanner_failure && failedScanners.length > 0) ||
    expiredSuppressionFailure;

  if (config.mode === 'advisory') {
    if (wouldFail)
      reasons.unshift('advisory mode: policy violations reported without failing the check');
    return { conclusion: 'neutral', blocking, advisory, reasons };
  }

  if (wouldFail) {
    if (blocking.length > 0) reasons.unshift(`${blocking.length} blocking finding(s)`);
    return { conclusion: 'failure', blocking, advisory, reasons };
  }
  return { conclusion: 'success', blocking, advisory, reasons };
}

function isBlockingEligible(finding: Finding, config: GuardianConfig): boolean {
  if (!finding.is_new) return config.blocking.existing_debt;

  if (finding.source_type === 'llm') {
    const corroborated =
      finding.deterministic_evidence.length > 0 ||
      (finding.exploitability === 'confirmed' && finding.failure_scenario !== null);
    if (!corroborated) return false;
  }

  if (finding.category === 'technical-debt') return config.blocking.technical_debt;
  if (finding.category === 'ai-slop') return config.blocking.ai_slop;

  if (finding.severity === 'critical') return config.blocking.new_critical;
  if (
    finding.severity === 'high' &&
    (finding.category === 'security' ||
      finding.category === 'supply-chain' ||
      finding.category === 'privacy')
  ) {
    return config.blocking.new_high_security;
  }
  return false;
}
