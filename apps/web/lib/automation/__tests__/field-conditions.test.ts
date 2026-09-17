import { describe, expect, it } from 'vitest';

import {
  FieldConditionError,
  evaluateFieldConditions,
  normalizeFieldConditions,
  readFieldPath,
} from '../field-conditions';

const event = {
  source: 'github',
  type: 'workflow_run.completed',
  data: { conclusion: 'failure', branch: 'main', attempt: 2, labels: ['urgent', 'ci'] },
};

describe('normalizeFieldConditions', () => {
  it('accepts a dotted path with a supported operator', () => {
    expect(
      normalizeFieldConditions([
        { field: 'data.conclusion', operator: 'equals', value: 'failure' },
      ]),
    ).toEqual([{ field: 'data.conclusion', operator: 'equals', value: 'failure' }]);
    expect(normalizeFieldConditions(null)).toEqual([]);
  });

  it('refuses paths, operators and values it cannot evaluate', () => {
    expect(() =>
      normalizeFieldConditions([{ field: 'a b', operator: 'equals', value: 1 }]),
    ).toThrow(FieldConditionError);
    expect(() =>
      normalizeFieldConditions([{ field: 'data.x', operator: 'matches', value: '.*' }]),
    ).toThrow('operator must be one of');
    expect(() =>
      normalizeFieldConditions([{ field: 'data.x', operator: 'exists', value: 'yes' }]),
    ).toThrow('does not take a value');
    expect(() =>
      normalizeFieldConditions([{ field: 'data.x', operator: 'in', value: [] }]),
    ).toThrow('in needs a list');
    expect(() =>
      normalizeFieldConditions([{ field: 'data.x', operator: 'greater_than', value: 'five' }]),
    ).toThrow('needs a number');
    expect(() =>
      normalizeFieldConditions(
        Array.from({ length: 11 }, () => ({ field: 'data.x', operator: 'exists' })),
      ),
    ).toThrow('At most 10 conditions');
  });
});

describe('readFieldPath', () => {
  it('reads nested values and array indexes without reaching prototype keys', () => {
    expect(readFieldPath(event, 'data.branch')).toBe('main');
    expect(readFieldPath(event, 'data.labels.0')).toBe('urgent');
    expect(readFieldPath(event, 'data.constructor')).toBeUndefined();
    expect(readFieldPath(event, 'data.missing.deeper')).toBeUndefined();
  });
});

describe('evaluateFieldConditions', () => {
  it('requires every condition to hold', () => {
    expect(
      evaluateFieldConditions(
        normalizeFieldConditions([
          { field: 'data.conclusion', operator: 'equals', value: 'FAILURE' },
          { field: 'data.branch', operator: 'in', value: ['main', 'release'] },
          { field: 'data.attempt', operator: 'greater_than', value: 1 },
          { field: 'data.labels', operator: 'contains', value: 'ci' },
          { field: 'data.missing', operator: 'not_exists' },
        ]),
        event,
      ),
    ).toBe(true);
  });

  it('fails when one condition does not hold', () => {
    expect(
      evaluateFieldConditions(
        normalizeFieldConditions([
          { field: 'data.conclusion', operator: 'equals', value: 'success' },
        ]),
        event,
      ),
    ).toBe(false);
    expect(
      evaluateFieldConditions(
        normalizeFieldConditions([{ field: 'data.branch', operator: 'starts_with', value: 'rel' }]),
        event,
      ),
    ).toBe(false);
  });

  it('treats an empty condition list as matching everything', () => {
    expect(evaluateFieldConditions([], event)).toBe(true);
  });
});
