import { describe, expect, it } from 'vitest';

import { defaultGuardianConfig } from '../config.js';
import { dedupeFindings, reconcileRuns } from '../dedupe.js';
import { rankFindings, selectInlineFindings } from '../rank.js';
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

describe('reconcileRuns', () => {
  it('recognizes fixed, persisting, and newly introduced findings', () => {
    const stays = makeFinding({ fingerprint: 'c'.repeat(64) });
    const goesAway = makeFinding({ fingerprint: 'd'.repeat(64) });
    const appears = makeFinding({ fingerprint: 'e'.repeat(64) });

    const result = reconcileRuns([stays, goesAway], [stays, appears]);
    expect(result.fixed.map((f) => f.fingerprint)).toEqual(['d'.repeat(64)]);
    expect(result.fixed[0]?.status).toBe('fixed');
    expect(result.persisting.map((f) => f.fingerprint)).toEqual(['c'.repeat(64)]);
    expect(result.persisting[0]?.is_new).toBe(false);
    expect(result.introduced.map((f) => f.fingerprint)).toEqual(['e'.repeat(64)]);
    expect(result.introduced[0]?.is_new).toBe(true);
  });
});

describe('ranking and inline budgets', () => {
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

  it('respects the inline comment budget and confidence threshold', () => {
    const config = defaultGuardianConfig();
    config.review.max_inline_comments = 2;
    const findings = [
      makeFinding({ severity: 'critical', confidence: 0.99 }),
      makeFinding({ severity: 'high', confidence: 0.95 }),
      makeFinding({ severity: 'high', confidence: 0.9 }),
      makeFinding({ severity: 'medium', confidence: 0.5 }), // below inline threshold
      makeFinding({ severity: 'low', confidence: 0.99, is_in_diff: false }), // outside diff
    ];
    const inline = selectInlineFindings(findings, config);
    expect(inline).toHaveLength(2);
    expect(inline[0]?.severity).toBe('critical');
  });

  it('returns nothing when the budget is zero', () => {
    const config = defaultGuardianConfig();
    config.review.max_inline_comments = 0;
    expect(selectInlineFindings([makeFinding({ severity: 'critical' })], config)).toEqual([]);
  });
});
