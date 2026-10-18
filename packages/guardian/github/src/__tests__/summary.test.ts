import { defaultGuardianConfig, evaluatePolicy } from '@agiworkforce/guardian-core';
import { describe, expect, it } from 'vitest';

import { SUMMARY_MARKER, buildSummaryComment } from '../summary.js';
import { makeFinding } from './helpers.js';

describe('buildSummaryComment', () => {
  function build(findings = [makeFinding({ severity: 'high' })]) {
    const decision = evaluatePolicy(findings, [], defaultGuardianConfig());
    return buildSummaryComment({
      headSha: 'a'.repeat(40),
      mode: 'shadow',
      decision,
      findings,
      fixedSincePreviousRun: [],
      scannerRuns: [],
    });
  }

  it('always embeds the marker so the comment can be edited in place', () => {
    expect(build()).toContain(SUMMARY_MARKER);
  });

  it('reports the reviewed head SHA and severity counts', () => {
    const comment = build();
    expect(comment).toContain('a'.repeat(12));
    expect(comment).toContain('| Critical | High | Medium | Low | Info |');
  });

  it('celebrates fixed findings and lists failed scanners as missing coverage', () => {
    const decision = evaluatePolicy([], [], defaultGuardianConfig());
    const comment = buildSummaryComment({
      headSha: 'b'.repeat(40),
      mode: 'shadow',
      decision,
      findings: [],
      fixedSincePreviousRun: [makeFinding({ status: 'fixed' })],
      scannerRuns: [
        {
          scanner_id: 'semgrep',
          source_type: 'semgrep',
          version: '1.90.0',
          status: 'timeout',
          exit_code: null,
          duration_ms: 60000,
          finding_count: 0,
          error: 'timed out',
        },
      ],
    });
    expect(comment).toContain('Fixed since the previous run: 1');
    expect(comment).toContain('missing, not clean');
  });
});
