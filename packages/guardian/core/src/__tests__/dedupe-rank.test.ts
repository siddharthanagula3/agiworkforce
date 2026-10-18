import { describe, expect, it } from 'vitest';

import { dedupeFindings } from '../dedupe.js';
import { rankFindings } from '../rank.js';
import { makeFinding } from './helpers.js';

describe('dedupeFindings', () => {
  it('collapses findings sharing a fingerprint, keeping the strongest and merging evidence', () => {
    const weak = makeFinding({
      fingerprint: 'a'.repeat(64),
      severity: 'medium',
      source_type: 'llm',
      deterministic_evidence: [{ source_type: 'semgrep', rule_id: 'r1', summary: 's1' }],
    });
    const strong = makeFinding({
      fingerprint: 'a'.repeat(64),
      severity: 'high',
      deterministic_evidence: [{ source_type: 'repo-check', rule_id: 'r2', summary: 's2' }],
    });
    const deduped = dedupeFindings([weak, strong]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.severity).toBe('high');
    expect(deduped[0]?.deterministic_evidence).toHaveLength(2);
  });

  it('prefers deterministic sources over LLM restatements at equal strength', () => {
    const llm = makeFinding({
      fingerprint: 'b'.repeat(64),
      source_type: 'llm',
      severity: 'high',
      confidence: 0.9,
    });
    const det = makeFinding({
      fingerprint: 'b'.repeat(64),
      source_type: 'semgrep',
      severity: 'high',
      confidence: 0.9,
    });
    const deduped = dedupeFindings([llm, det]);
    expect(deduped[0]?.source_type).toBe('semgrep');
  });
});

describe('ranking', () => {
  it('ranks by severity, then corroboration and novelty', () => {
    const low = makeFinding({ severity: 'low' });
    const critical = makeFinding({ severity: 'critical' });
    const highCorroborated = makeFinding({
      severity: 'high',
      deterministic_evidence: [{ source_type: 'semgrep', rule_id: 'x', summary: 'y' }],
    });
    const ranked = rankFindings([low, highCorroborated, critical]);
    expect(ranked[0]?.severity).toBe('critical');
    expect(ranked[1]?.severity).toBe('high');
    expect(ranked[2]?.severity).toBe('low');
  });

  it('is deterministic across input order', () => {
    const findings = [makeFinding(), makeFinding(), makeFinding({ severity: 'high' })];
    const a = rankFindings(findings).map((f) => f.fingerprint);
    const b = rankFindings([...findings].reverse()).map((f) => f.fingerprint);
    expect(a).toEqual(b);
  });
});
