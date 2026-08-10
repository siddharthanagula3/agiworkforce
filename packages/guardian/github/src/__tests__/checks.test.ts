import { defaultGuardianConfig, evaluatePolicy, type Finding } from '@agiworkforce/guardian-core';
import { describe, expect, it } from 'vitest';

import {
  MAX_ANNOTATIONS_PER_REQUEST,
  batchAnnotations,
  buildCategoryCheck,
  buildPolicyCheck,
  toAnnotation,
} from '../checks.js';
import { makeFinding } from './helpers.js';

describe('toAnnotation', () => {
  it('maps severity to annotation level and fills line defaults', () => {
    expect(toAnnotation(makeFinding({ severity: 'critical' })).annotation_level).toBe('failure');
    expect(toAnnotation(makeFinding({ severity: 'medium' })).annotation_level).toBe('warning');
    expect(
      toAnnotation(makeFinding({ severity: 'info', start_line: null, end_line: null })),
    ).toMatchObject({
      annotation_level: 'notice',
      start_line: 1,
      end_line: 1,
    });
  });
});

describe('batchAnnotations', () => {
  it('splits into batches of at most 50', () => {
    const annotations = Array.from({ length: 120 }, (_, i) =>
      toAnnotation(makeFinding({ start_line: i + 1, end_line: i + 1 })),
    );
    const batches = batchAnnotations(annotations);
    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(MAX_ANNOTATIONS_PER_REQUEST);
    expect(batches[2]).toHaveLength(20);
  });
});

describe('buildCategoryCheck', () => {
  it('is success when clean, neutral when findings exist', () => {
    const clean = buildCategoryCheck('AGI Guardian / Security', 'sha', [], []);
    expect(clean.payload.conclusion).toBe('success');

    const withFindings = buildCategoryCheck('AGI Guardian / Security', 'sha', [makeFinding()], []);
    expect(withFindings.payload.conclusion).toBe('neutral');
    expect(withFindings.payload.output.annotations.length).toBe(1);
  });

  it('surfaces failed scanners as not-clean even with zero findings', () => {
    const check = buildCategoryCheck(
      'AGI Guardian / Security',
      'sha',
      [],
      [
        {
          scanner_id: 'gitleaks',
          source_type: 'gitleaks',
          version: '8.18.0',
          status: 'scanner-failed',
          exit_code: null,
          duration_ms: 10,
          finding_count: 0,
          error: 'binary missing',
        },
      ],
    );
    expect(check.payload.conclusion).toBe('neutral');
    expect(check.payload.output.summary).toContain('NOT clean');
  });

  it('puts overflow annotations into follow-up batches', () => {
    const findings: Finding[] = Array.from({ length: 75 }, (_, i) =>
      makeFinding({ start_line: i + 1, end_line: i + 1, rule_id: `r/${i}` }),
    );
    const check = buildCategoryCheck('AGI Guardian / Correctness', 'sha', findings, []);
    expect(check.payload.output.annotations).toHaveLength(50);
    expect(check.overflowBatches).toHaveLength(1);
    expect(check.overflowBatches[0]).toHaveLength(25);
  });
});

describe('buildPolicyCheck', () => {
  it('renders a failing policy decision', () => {
    const config = defaultGuardianConfig();
    config.mode = 'blocking';
    const decision = evaluatePolicy(
      [makeFinding({ severity: 'critical', is_new: true })],
      [],
      config,
    );
    const payload = buildPolicyCheck('sha', decision);
    expect(payload.conclusion).toBe('failure');
    expect(payload.output.summary).toContain('Blocking findings');
  });

  it('renders shadow mode as neutral advisory', () => {
    const decision = evaluatePolicy(
      [makeFinding({ severity: 'critical' })],
      [],
      defaultGuardianConfig(),
    );
    const payload = buildPolicyCheck('sha', decision);
    expect(payload.conclusion).toBe('neutral');
  });
});
