/**
 * What a run report has to show that an aggregate score cannot.
 *
 * @module evals/tests/report
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import { compareToBaseline, readGatePolicy } from '../scripts/promotion-gate.mjs';
import type { LiveTarget } from '../src/live';
import { buildRunReport, summariseSuite, type RunIdentity } from '../src/report';
import { EvalStreamError } from '../src/provider';
import { correlationIdFor, runLive, MAX_ATTEMPTS_PER_CASE, type LiveRunOutcome } from '../src/run';
import { formatReport, runSuite, weakSlices } from '../src/suite';
import type { EvalCase, EvalDataset, Responder, SuiteReport } from '../src/types';

const tolerance = readGatePolicy().tolerance;

function evalCase(id: string, family: string): EvalCase {
  return {
    id: `golden/${id}`,
    family,
    risk: 'low',
    expected: 'answer',
    prompt: 'answer the question',
    checks: [
      { kind: 'includesAny', values: ['first'] },
      { kind: 'includesAny', values: ['second'] },
    ],
  };
}

const dataset: EvalDataset = {
  suite: 'golden',
  version: 1,
  priority: 'P1',
  provenance: { kind: 'authored', source: 'written for this test', authoredOn: '2026-09-18' },
  passThreshold: 0.5,
  cases: [
    evalCase('shallow-one', 'shallow'),
    evalCase('shallow-two', 'shallow'),
    evalCase('shallow-three', 'shallow'),
    evalCase('shallow-four', 'shallow'),
    evalCase('deep-one', 'deep'),
    evalCase('deep-two', 'deep'),
    evalCase('deep-three', 'deep'),
    evalCase('deep-four', 'deep'),
  ],
};

function answering(fullyAnswered: readonly string[]): Responder {
  return async (evalCase) => ({
    text: fullyAnswered.includes(evalCase.id) ? 'first and second' : 'first only',
  });
}

const clock = (): Date => new Date('2026-09-18T04:05:06.000Z');

async function run(fullyAnswered: readonly string[]): Promise<SuiteReport> {
  return runSuite(dataset, answering(fullyAnswered), { now: clock });
}

const identity: RunIdentity = {
  source: 'live',
  recordingSource: 'live',
  runId: 'run-under-test',
  modelKey: 'model-under-test',
  routeId: 'provider/model-under-test',
  recordedOn: '2026-09-18',
};

describe('per-slice breakdown', () => {
  /**
   * The regression this exists to catch: the same seven of eight rows pass
   * before and after, so every aggregate the report prints is unchanged, and
   * the one family that went from perfect to failing is invisible unless the
   * report cuts the suite by the labels the corpus already carries.
   */
  const before = [
    'golden/shallow-one',
    'golden/shallow-two',
    'golden/shallow-three',
    'golden/shallow-four',
    'golden/deep-one',
    'golden/deep-two',
    'golden/deep-three',
  ];
  const after = [
    'golden/shallow-one',
    'golden/shallow-two',
    'golden/shallow-three',
    'golden/deep-one',
    'golden/deep-two',
    'golden/deep-three',
    'golden/deep-four',
  ];

  it('surfaces the regressed slice although the raw average is flat', async () => {
    const baseline = await run(before);
    const candidate = await run(after);

    expect(candidate.score).toBe(baseline.score);
    expect(candidate.passed).toBe(baseline.passed);
    expect(candidate.completeness).toBe(baseline.completeness);

    expect(baseline.slices.family['shallow']?.score).toBe(1);
    expect(candidate.slices.family['shallow']?.score).toBe(0.75);
    expect(weakSlices(candidate)).toContain(
      '  slice family=shallow: 3/4 (score 0.750 against suite 0.875)',
    );
    expect(formatReport(candidate)).toContain('slice family=shallow');
    expect(weakSlices(baseline)).not.toContain(
      '  slice family=shallow: 3/4 (score 0.750 against suite 0.875)',
    );
  });

  it('fails the gate on the slice while the aggregate score passes', async () => {
    const baseline = buildRunReport(identity, [await run(before)]);
    const candidate = buildRunReport(identity, [await run(after)]);
    const findings = compareToBaseline(baseline, candidate, tolerance);

    expect(findings.find((entry) => entry.axis === 'score')?.passed).toBe(true);
    const slice = findings.find((entry) => entry.axis === 'slice family=shallow');
    expect(slice?.passed).toBe(false);
    expect(slice?.detail).toContain('score 0.750 vs baseline 1.000');
  });

  it('holds a P0 corpus to no score drop at all', async () => {
    const measured = summariseSuite(await run(before));
    const baseline = { ...measured, score: 1 };
    const candidate = { ...measured, score: 1 - tolerance.scoreDrop / 2 };
    const scoreAxis = (priority: 'P0' | 'P1'): boolean | undefined =>
      compareToBaseline(
        { suites: { golden: { ...baseline, priority } } },
        { suites: { golden: { ...candidate, priority } } },
        tolerance,
      ).find((entry) => entry.axis === 'score')?.passed;

    expect(scoreAxis('P1')).toBe(true);
    expect(scoreAxis('P0')).toBe(false);
  });
});

describe('completeness', () => {
  it('separates an answer that missed a clause from one that answered nothing', async () => {
    const partial = await run([]);
    const nothing = await runSuite(dataset, async () => ({ text: 'neither' }), { now: clock });

    expect(partial.score).toBe(0);
    expect(nothing.score).toBe(0);
    expect(partial.completeness).toBe(0.5);
    expect(nothing.completeness).toBe(0);
  });
});

describe('measurement dates', () => {
  it('date-stamps every suite score, not only the run', async () => {
    const report = buildRunReport(identity, [await run([])], {}, '2026-09-18T04:05:07.000Z');
    expect(report.measuredAt).toBe('2026-09-18T04:05:07.000Z');
    expect(report.suites.golden?.measuredAt).toBe('2026-09-18T04:05:06.000Z');
  });
});

describe('attempts', () => {
  const target: LiveTarget = {
    modelKey: 'model-under-test',
    routeId: 'provider/model-under-test',
    route: {
      modelKey: 'model-under-test',
      provider: 'provider',
      providerModelId: 'model-under-test',
      harnessId: 'chat',
      availability: 'live',
      isDefault: true,
    },
    capabilities: {},
    contextTokens: null,
  };
  const single: EvalDataset = { ...dataset, cases: [dataset.cases[0]!] };

  async function live(responder: Responder): Promise<LiveRunOutcome> {
    return runLive([single], {
      target,
      recordedOn: '2026-09-18',
      runId: 'retry-run',
      responderFor: () => responder,
    });
  }

  it('records one attempt per call, correlated to the run', async () => {
    const outcome = await live(async () => ({ text: 'first and second', costUsd: 2 }));
    expect(outcome.report.runId).toBe('retry-run');
    expect(outcome.recording.runId).toBe('retry-run');
    expect(outcome.attempts).toHaveLength(1);
    const [attempt] = outcome.attempts;
    expect(attempt?.correlationId).toBe(correlationIdFor('retry-run', single.cases[0]!.id, 1));
    expect(attempt?.caseId).toBe(single.cases[0]?.id);
    expect(attempt?.suite).toBe('golden');
    expect(attempt?.graded).toBe(true);
    expect(attempt?.costUsd).toBe(2);
    expect(Date.parse(attempt?.startedAt ?? '')).not.toBeNaN();
  });

  it('prices the attempts a retry threw away', async () => {
    let calls = 0;
    const outcome = await live(async () => {
      calls += 1;
      if (calls === 1) {
        throw new EvalStreamError('provider error: overloaded', {
          text: '',
          costUsd: 0.25,
          costSource: 'provider',
          latencyMs: 10,
        });
      }
      return { text: 'first and second', costUsd: 1, costSource: 'provider', latencyMs: 20 };
    });

    expect(outcome.attempts).toHaveLength(2);
    expect(outcome.attempts[0]?.graded).toBe(false);
    expect(outcome.attempts[0]?.costUsd).toBe(0.25);
    expect(outcome.attempts[0]?.failure).toContain('overloaded');
    expect(outcome.report.suites.golden?.retries).toEqual({
      attempts: 2,
      retried: 1,
      retryCostUsd: 0.25,
    });
    expect(outcome.report.suites.golden?.cost.totalUsd).toBe(1);
  });

  it('gives up after the attempt ceiling rather than looping', async () => {
    let calls = 0;
    await expect(
      live(async () => {
        calls += 1;
        throw new Error('provider error: always down');
      }),
    ).rejects.toThrow(/always down/);
    expect(calls).toBe(MAX_ATTEMPTS_PER_CASE);
  });
});
