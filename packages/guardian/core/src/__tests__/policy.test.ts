import { describe, expect, it } from 'vitest';

import { defaultGuardianConfig, type GuardianConfig } from '../config.js';
import { evaluatePolicy } from '../policy.js';
import { makeFinding, makeScannerRun } from './helpers.js';

const NOW = new Date('2026-08-09T12:00:00.000Z');

function configIn(mode: GuardianConfig['mode']): GuardianConfig {
  const config = defaultGuardianConfig();
  config.mode = mode;
  return config;
}

describe('evaluatePolicy', () => {
  it('shadow mode is always neutral, even with new critical findings', () => {
    const decision = evaluatePolicy(
      [makeFinding({ severity: 'critical', is_new: true })],
      [],
      configIn('shadow'),
      NOW,
    );
    expect(decision.conclusion).toBe('neutral');
    expect(decision.blocking).toEqual([]);
    expect(decision.advisory).toHaveLength(1);
    expect(decision.reasons[0]).toContain('shadow mode');
  });

  it('advisory mode reports violations without failing', () => {
    const decision = evaluatePolicy(
      [makeFinding({ severity: 'critical', is_new: true })],
      [],
      configIn('advisory'),
      NOW,
    );
    expect(decision.conclusion).toBe('neutral');
    expect(decision.blocking).toHaveLength(1);
  });

  it('blocking mode fails on a new deterministic critical finding', () => {
    const decision = evaluatePolicy(
      [makeFinding({ severity: 'critical', is_new: true })],
      [],
      configIn('blocking'),
      NOW,
    );
    expect(decision.conclusion).toBe('failure');
    expect(decision.blocking).toHaveLength(1);
  });

  it('blocking mode fails on new high security findings', () => {
    const decision = evaluatePolicy(
      [makeFinding({ severity: 'high', category: 'security', is_new: true })],
      [],
      configIn('blocking'),
      NOW,
    );
    expect(decision.conclusion).toBe('failure');
  });

  it('does not fail on pre-existing (baselined) findings', () => {
    const decision = evaluatePolicy(
      [makeFinding({ severity: 'critical', is_new: false })],
      [],
      configIn('blocking'),
      NOW,
    );
    expect(decision.conclusion).toBe('success');
    expect(decision.advisory).toHaveLength(1);
  });

  it('an uncorroborated LLM finding can never block, even when critical', () => {
    const llmOnly = makeFinding({
      severity: 'critical',
      category: 'security',
      source_type: 'llm',
      deterministic_evidence: [],
      exploitability: 'plausible',
    });
    const decision = evaluatePolicy([llmOnly], [], configIn('blocking'), NOW);
    expect(decision.conclusion).toBe('success');
    expect(decision.advisory).toHaveLength(1);
  });

  it('a corroborated LLM finding can block', () => {
    const corroborated = makeFinding({
      severity: 'critical',
      category: 'security',
      source_type: 'llm',
      deterministic_evidence: [{ source_type: 'semgrep', rule_id: 'x', summary: 'matched' }],
    });
    const decision = evaluatePolicy([corroborated], [], configIn('blocking'), NOW);
    expect(decision.conclusion).toBe('failure');
  });

  it('technical-debt and ai-slop stay advisory unless explicitly enabled', () => {
    const decision = evaluatePolicy(
      [
        makeFinding({ severity: 'critical', category: 'technical-debt', is_new: true }),
        makeFinding({ severity: 'critical', category: 'ai-slop', is_new: true }),
      ],
      [],
      configIn('blocking'),
      NOW,
    );
    expect(decision.conclusion).toBe('success');
    expect(decision.advisory).toHaveLength(2);
  });

  it('a failed scanner fails the policy check in blocking mode (never treated as clean)', () => {
    const decision = evaluatePolicy(
      [],
      [makeScannerRun({ status: 'scanner-failed', error: 'crashed' })],
      configIn('blocking'),
      NOW,
    );
    expect(decision.conclusion).toBe('failure');
    expect(decision.reasons.join(' ')).toContain('did not complete');
  });

  it('an actively suppressed finding does not surface or block', () => {
    const suppressed = makeFinding({
      severity: 'critical',
      suppression: {
        suppressed_by: 'maintainer',
        reason: 'accepted for release',
        expires_at: '2026-12-31T00:00:00.000Z',
        created_at: '2026-08-01T00:00:00.000Z',
      },
    });
    const decision = evaluatePolicy([suppressed], [], configIn('blocking'), NOW);
    expect(decision.conclusion).toBe('success');
    expect(decision.advisory).toEqual([]);
  });

  it('an expired suppression becomes a visible failure per policy', () => {
    const expired = makeFinding({
      severity: 'low',
      suppression: {
        suppressed_by: 'maintainer',
        reason: 'temporary',
        expires_at: '2026-08-01T00:00:00.000Z',
        created_at: '2026-07-01T00:00:00.000Z',
      },
    });
    const decision = evaluatePolicy([expired], [], configIn('blocking'), NOW);
    expect(decision.conclusion).toBe('failure');
    expect(decision.reasons.join(' ')).toContain('suppression expired');
  });
});
