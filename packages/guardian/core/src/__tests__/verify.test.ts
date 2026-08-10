import { describe, expect, it } from 'vitest';

import { defaultGuardianConfig } from '../config.js';
import { verifyFinding, verifyFindings, type VerificationContext } from '../verify.js';
import { makeFinding } from './helpers.js';

function makeContext(overrides: Partial<VerificationContext> = {}): VerificationContext {
  return {
    headSha: 'headsha',
    fileLines: new Map([['apps/web/app/example.ts', 200]]),
    diffRanges: new Map([['apps/web/app/example.ts', [{ start: 1, end: 50 }]]]),
    knownFingerprints: new Set(),
    config: defaultGuardianConfig(),
    ...overrides,
  };
}

describe('verifyFinding', () => {
  it('publishes a valid in-diff finding', () => {
    const verdict = verifyFinding(makeFinding(), makeContext());
    expect(verdict.action).toBe('publish');
  });

  it('rejects a finding whose path does not exist at head', () => {
    const verdict = verifyFinding(makeFinding({ path: 'apps/web/missing.ts' }), makeContext());
    expect(verdict.action).toBe('reject');
    if (verdict.action === 'reject') expect(verdict.reasons[0]).toContain('does not exist');
  });

  it('rejects a finding whose lines exceed the file length', () => {
    const verdict = verifyFinding(makeFinding({ start_line: 190, end_line: 250 }), makeContext());
    expect(verdict.action).toBe('reject');
  });

  it('rejects an inverted line range', () => {
    const verdict = verifyFinding(makeFinding({ start_line: 30, end_line: 10 }), makeContext());
    expect(verdict.action).toBe('reject');
  });

  it('rejects a stale finding produced for an older head SHA', () => {
    const verdict = verifyFinding(makeFinding({ last_seen_sha: 'oldsha' }), makeContext());
    expect(verdict.action).toBe('reject');
    if (verdict.action === 'reject') expect(verdict.reasons[0]).toContain('stale');
  });

  it('rejects duplicates by fingerprint', () => {
    const finding = makeFinding();
    const verdict = verifyFinding(
      finding,
      makeContext({ knownFingerprints: new Set([finding.fingerprint]) }),
    );
    expect(verdict.action).toBe('reject');
  });

  it('rejects findings on config-ignored paths', () => {
    const ctx = makeContext({ fileLines: new Map([['apps/web/dist/bundle.js', 10]]) });
    const verdict = verifyFinding(
      makeFinding({ path: 'apps/web/dist/bundle.js', start_line: 1, end_line: 1 }),
      ctx,
    );
    expect(verdict.action).toBe('reject');
  });

  it('rejects an LLM finding without a concrete failure scenario or deterministic evidence', () => {
    const finding = makeFinding({ source_type: 'llm', failure_scenario: null });
    const verdict = verifyFinding(finding, makeContext());
    expect(verdict.action).toBe('reject');
    if (verdict.action === 'reject')
      expect(verdict.reasons[0]).toContain('concrete failure scenario');
  });

  it('accepts an LLM finding with a concrete failure scenario', () => {
    const finding = makeFinding({
      source_type: 'llm',
      failure_scenario:
        'A user in local mode triggers the retry branch and the prompt is sent to the cloud provider.',
    });
    expect(verifyFinding(finding, makeContext()).action).toBe('publish');
  });

  it('rejects findings below the summary confidence threshold', () => {
    const verdict = verifyFinding(makeFinding({ confidence: 0.5 }), makeContext());
    expect(verdict.action).toBe('reject');
  });

  it('marks below-inline-confidence findings as not inline eligible', () => {
    const verdict = verifyFinding(makeFinding({ confidence: 0.8 }), makeContext());
    expect(verdict.action).toBe('publish');
    if (verdict.action === 'publish') expect(verdict.inlineEligible).toBe(false);
  });

  it('rejects out-of-diff findings when pre-existing context is disabled', () => {
    const config = defaultGuardianConfig();
    config.review.include_preexisting_context = false;
    const ctx = makeContext({ config, diffRanges: new Map() });
    expect(verifyFinding(makeFinding(), ctx).action).toBe('reject');
  });
});

describe('verifyFindings (batch)', () => {
  it('dedupes within the batch and reports rejects with reasons', () => {
    const a = makeFinding({ rule_id: 'same/rule', evidence: 'identical evidence text here' });
    const b = makeFinding({ rule_id: 'same/rule', evidence: 'identical evidence text here' });
    const missing = makeFinding({ path: 'nope.ts' });
    const result = verifyFindings([a, b, missing], makeContext());
    expect(result.publishable).toHaveLength(1);
    expect(result.rejected).toHaveLength(2);
  });
});
