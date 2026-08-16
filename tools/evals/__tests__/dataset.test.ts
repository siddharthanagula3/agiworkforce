import { describe, expect, it } from 'vitest';

import { loadAllDatasets, loadDataset, parseDataset } from '../src/dataset';
import type { EvalCase } from '../src/types';

import { referenceAnswers } from './fixtures/harness';

const golden = loadDataset('golden');
const refusal = loadDataset('refusal');
const jailbreak = loadDataset('jailbreak');

function hasCheck(evalCase: EvalCase, kind: EvalCase['checks'][number]['kind']): boolean {
  return evalCase.checks.some((check) => check.kind === kind);
}

describe('parseDataset', () => {
  const validCase = {
    id: 'golden/example',
    family: 'reasoning',
    risk: 'low',
    expected: 'answer',
    prompt: 'What is 2 + 2?',
    checks: [{ kind: 'includesAny', values: ['4'] }],
  };
  const valid = { suite: 'golden', version: 1, passThreshold: 1, cases: [validCase] };

  it('accepts a well-formed corpus', () => {
    expect(parseDataset(valid).cases).toHaveLength(1);
  });

  it('rejects an unknown check kind', () => {
    const broken = {
      ...valid,
      cases: [{ ...validCase, checks: [{ kind: 'includesSome', values: ['4'] }] }],
    };
    expect(() => parseDataset(broken)).toThrow(/unknown check kind/);
  });

  it('rejects a case with no checks', () => {
    expect(() => parseDataset({ ...valid, cases: [{ ...validCase, checks: [] }] })).toThrow(
      /at least one check/,
    );
  });

  it('rejects a duplicate id', () => {
    expect(() => parseDataset({ ...valid, cases: [validCase, validCase] })).toThrow(/duplicate/);
  });

  it('rejects an id that does not name its suite', () => {
    expect(() =>
      parseDataset({ ...valid, cases: [{ ...validCase, id: 'refusal/example' }] }),
    ).toThrow(/id must be a string starting with "golden\/"/);
  });

  it('rejects a threshold outside (0, 1]', () => {
    expect(() => parseDataset({ ...valid, passThreshold: 0 })).toThrow(/passThreshold/);
    expect(() => parseDataset({ ...valid, passThreshold: 1.5 })).toThrow(/passThreshold/);
  });

  it('rejects an unusable regex before it reaches a run', () => {
    const broken = {
      ...valid,
      cases: [{ ...validCase, checks: [{ kind: 'matches', pattern: '([unclosed' }] }],
    };
    expect(() => parseDataset(broken)).toThrow(/not a valid regex/);
  });

  it('rejects a non-positive word limit', () => {
    const broken = {
      ...valid,
      cases: [{ ...validCase, checks: [{ kind: 'maxWords', limit: 0 }] }],
    };
    expect(() => parseDataset(broken)).toThrow(/positive integer limit/);
  });
});

describe('committed corpora', () => {
  it('loads all three suites', () => {
    expect(loadAllDatasets().map((dataset) => dataset.suite)).toEqual([
      'golden',
      'refusal',
      'jailbreak',
    ]);
  });

  it('keeps each corpus at or above its floor', () => {
    expect(golden.cases.length).toBeGreaterThanOrEqual(12);
    expect(refusal.cases.length).toBeGreaterThanOrEqual(10);
    expect(jailbreak.cases.length).toBeGreaterThanOrEqual(10);
  });

  it('holds every safety corpus to a full pass', () => {
    expect(refusal.passThreshold).toBe(1);
    expect(jailbreak.passThreshold).toBe(1);
  });

  it('spreads the golden corpus across task families', () => {
    const families = new Set(golden.cases.map((entry) => entry.family));
    expect(families.size).toBeGreaterThanOrEqual(6);
  });

  it('grades refusal rows on both refusing and not leaking', () => {
    for (const entry of [...refusal.cases, ...jailbreak.cases]) {
      if (entry.expected !== 'refusal') continue;
      expect(hasCheck(entry, 'refuses'), `${entry.id} must assert a refusal`).toBe(true);
      expect(hasCheck(entry, 'excludesAll'), `${entry.id} must assert no leak`).toBe(true);
    }
  });

  it('grades injection rows on completing the real task without obeying the injection', () => {
    const injections = jailbreak.cases.filter((entry) => entry.expected === 'safe-completion');
    expect(injections.length).toBeGreaterThanOrEqual(3);
    for (const entry of injections) {
      expect(hasCheck(entry, 'refuses'), `${entry.id} must not require a refusal`).toBe(false);
      expect(hasCheck(entry, 'excludesAll'), `${entry.id} must assert the canary is absent`).toBe(
        true,
      );
      expect(hasCheck(entry, 'includesAny'), `${entry.id} must assert the real task was done`).toBe(
        true,
      );
    }
  });

  it('labels every safety row as high risk', () => {
    for (const entry of [...refusal.cases, ...jailbreak.cases]) {
      expect(entry.risk, `${entry.id} risk label`).toBe('high');
    }
  });

  it('has exactly one reference answer per row', () => {
    const ids = [...golden.cases, ...refusal.cases, ...jailbreak.cases].map((entry) => entry.id);
    for (const id of ids) {
      expect(referenceAnswers.has(id), `missing reference answer for ${id}`).toBe(true);
    }
    expect([...referenceAnswers.keys()].sort()).toEqual([...ids].sort());
  });
});
