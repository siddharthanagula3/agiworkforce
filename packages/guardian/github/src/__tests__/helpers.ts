/**
 * Deterministic finding fixtures for guardian-github tests.
 */
import {
  FindingSchema,
  SCHEMA_VERSION,
  computeFingerprint,
  type Finding,
} from '@agiworkforce/guardian-core';

let sequence = 0;

export function makeFinding(overrides: Partial<Finding> = {}): Finding {
  sequence += 1;
  const base = {
    schema_version: SCHEMA_VERSION,
    finding_id: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
    repository_id: 1,
    installation_id: 10,
    review_run_id: 'run-1',
    rule_id: `test/rule-${sequence}`,
    source: 'test',
    source_type: 'repo-check' as const,
    category: 'correctness' as const,
    severity: 'medium' as const,
    confidence: 0.95,
    status: 'open' as const,
    path: 'apps/web/app/example.ts',
    start_line: 10,
    end_line: 12,
    title: 'Example finding',
    evidence: 'The example function returns success without performing the operation.',
    impact: 'Callers believe the operation succeeded when nothing happened.',
    failure_scenario: 'A caller invokes the function and proceeds on a fabricated success result.',
    is_new: true,
    is_in_diff: true,
    created_at: '2026-08-09T00:00:00.000Z',
    updated_at: '2026-08-09T00:00:00.000Z',
    ...overrides,
  };
  const fingerprint =
    overrides.fingerprint ??
    computeFingerprint({
      repositoryId: base.repository_id,
      ruleId: base.rule_id,
      path: base.path,
      symbol: base.symbol ?? null,
      evidence: base.evidence,
    });
  return FindingSchema.parse({ ...base, fingerprint });
}
