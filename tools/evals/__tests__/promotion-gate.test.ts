import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  auditBaselines,
  compareToBaseline,
  evaluatePromotionGate,
  measurementFileName,
  readGatePolicy,
  scoreFloor,
  toleranceFor,
} from '../scripts/promotion-gate.mjs';
import type { SuiteSummaryLike } from '../scripts/promotion-gate.mjs';

const policy = {
  schemaVersion: 1,
  tolerance: {
    scoreDrop: 0.05,
    costIncreaseRatio: 0.25,
    latencyP95IncreaseRatio: 0.5,
    completenessDrop: 0.05,
  },
  familyOverrides: { 'lab/pro': { costIncreaseRatio: 1 } },
};

function suite(
  score: number,
  meanUsd: number | null,
  p95Ms: number | null,
  version = 1,
  threshold = 0.5,
) {
  return {
    version,
    threshold,
    total: 10,
    passed: Math.round(score * 10),
    score,
    met: score >= threshold,
    cost: {
      meteredCases: 10,
      totalUsd: meanUsd === null ? null : meanUsd * 10,
      meanUsd,
      inputTokens: 0,
      outputTokens: 0,
    },
    latency: { timedCases: 10, p50Ms: p95Ms, p95Ms, ttfbP50Ms: null },
    skipped: [],
    failed: [],
  };
}

function run(
  modelKey: string,
  suites: Record<string, SuiteSummaryLike>,
  extra: Record<string, unknown> = {},
) {
  return {
    schemaVersion: 1,
    source: 'live',
    recordingSource: 'live',
    modelKey,
    routeId: `${modelKey}/route`,
    recordedOn: '2026-09-17',
    suites,
    unsupportedSuites: {},
    ...extra,
  };
}

describe('compareToBaseline', () => {
  const tolerance = toleranceFor(policy, 'lab/fast');
  const baseline = run('active', { coding: suite(0.8, 0.002, 4000), tools: suite(1, 0.001, 2000) });

  it('holds a candidate within tolerance on every axis', () => {
    const candidate = run('next', {
      coding: suite(0.76, 0.0024, 5900),
      tools: suite(1, 0.001, 1500),
    });
    expect(compareToBaseline(baseline, candidate, tolerance).every((entry) => entry.passed)).toBe(
      true,
    );
  });

  it('fails a score regression beyond the tolerated drop', () => {
    const candidate = run('next', {
      coding: suite(0.7, 0.002, 4000),
      tools: suite(1, 0.001, 2000),
    });
    const failed = compareToBaseline(baseline, candidate, tolerance).filter(
      (entry) => !entry.passed,
    );
    expect(failed.map((entry) => `${entry.suite}:${entry.axis}`)).toEqual(['coding:score']);
  });

  it('fails a cost or latency regression beyond tolerance', () => {
    const candidate = run('next', {
      coding: suite(0.8, 0.003, 4000),
      tools: suite(1, 0.001, 3500),
    });
    const failed = compareToBaseline(baseline, candidate, tolerance).filter(
      (entry) => !entry.passed,
    );
    expect(failed.map((entry) => `${entry.suite}:${entry.axis}`)).toEqual([
      'coding:cost',
      'tools:latency',
    ]);
  });

  it('fails a suite the candidate did not run, could not run, or ran at another version', () => {
    const missing = run(
      'next',
      { coding: suite(0.8, 0.002, 4000, 2) },
      {
        unsupportedSuites: { tools: 'next lacks functionCalling' },
      },
    );
    const failed = compareToBaseline(baseline, missing, tolerance).filter((entry) => !entry.passed);
    expect(failed.map((entry) => `${entry.suite}:${entry.axis}`)).toEqual([
      'coding:version',
      'tools:coverage',
    ]);
    expect(failed[1]!.detail).toMatch(/functionCalling/);
  });

  it('fails an unmetered candidate against a metered baseline', () => {
    const candidate = run('next', { coding: suite(0.8, null, null), tools: suite(1, 0.001, 2000) });
    const failed = compareToBaseline(baseline, candidate, tolerance).filter(
      (entry) => !entry.passed,
    );
    expect(failed.map((entry) => entry.axis)).toEqual(['cost', 'latency']);
  });

  it('applies a family override on top of the default tolerance', () => {
    expect(toleranceFor(policy, 'lab/pro').costIncreaseRatio).toBe(1);
    expect(toleranceFor(policy, 'lab/pro').scoreDrop).toBe(0.05);
  });

  it('ships a policy with every tolerance set', () => {
    const shipped = readGatePolicy();
    expect(Object.keys(shipped.tolerance).sort()).toEqual([
      'completenessDrop',
      'costIncreaseRatio',
      'latencyP95IncreaseRatio',
      'scoreDrop',
    ]);
  });
});

describe('evaluatePromotionGate', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agi-evals-gate-'));
    mkdirSync(join(dir, 'baselines'));
    mkdirSync(join(dir, 'runs'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function write(kind: 'baselines' | 'runs', key: string, value: unknown) {
    writeFileSync(join(dir, kind, measurementFileName(key)), JSON.stringify(value));
  }

  it('refuses a promotion with no measured baseline or run', () => {
    const verdict = evaluatePromotionGate({
      familyId: 'lab/fast',
      candidateModelKey: 'next',
      measurementsDir: dir,
      policy,
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.refusals.join('\n')).toMatch(/no measured eval baseline/);
    expect(verdict.refusals.join('\n')).toMatch(/pnpm evals:live --model next/);
  });

  it('refuses measurements that are not live', () => {
    write('baselines', 'lab/fast', {
      familyId: 'lab/fast',
      ...run('active', { coding: suite(1, 0.001, 100) }),
    });
    write(
      'runs',
      'next',
      run('next', { coding: suite(1, 0.001, 100) }, { recordingSource: 'reference' }),
    );
    const verdict = evaluatePromotionGate({
      familyId: 'lab/fast',
      candidateModelKey: 'next',
      measurementsDir: dir,
      policy,
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.refusals).toEqual(['run for next is not a live measurement']);
  });

  it('passes a candidate that holds the baseline and fails one that regresses', () => {
    write('baselines', 'lab/fast', {
      familyId: 'lab/fast',
      ...run('active', { coding: suite(0.9, 0.001, 1000) }),
    });
    write('runs', 'next', run('next', { coding: suite(0.9, 0.001, 1000) }));
    write('runs', 'worse', run('worse', { coding: suite(0.5, 0.001, 1000) }));
    const options = { familyId: 'lab/fast', measurementsDir: dir, policy };
    expect(evaluatePromotionGate({ ...options, candidateModelKey: 'next' }).passed).toBe(true);
    expect(evaluatePromotionGate({ ...options, candidateModelKey: 'worse' }).passed).toBe(false);
  });

  it('exits non-zero from the command line when no measurement exists', () => {
    const script = fileURLToPath(new URL('../scripts/promotion-gate.mjs', import.meta.url));
    let status = 0;
    let output = '';
    try {
      execFileSync(
        process.execPath,
        [script, '--family', 'no/such-family', '--candidate', 'no-such-model'],
        {
          encoding: 'utf8',
          stdio: 'pipe',
        },
      );
    } catch (error) {
      status = (error as { status: number }).status;
      output = String((error as { stdout: string }).stdout);
    }
    expect(status).toBe(1);
    expect(output).toMatch(/regressed/);
  });
});

describe('scoreFloor', () => {
  const tolerance = { scoreDrop: 0.05 };

  it('lets a measured baseline raise the bar above the corpus threshold', () => {
    expect(scoreFloor({ score: 0.98, threshold: 0.9 }, tolerance)).toBeCloseTo(0.93);
  });

  it('never lets a baseline lower the bar under the corpus threshold', () => {
    expect(scoreFloor({ score: 0, threshold: 1 }, tolerance)).toBe(1);
    expect(scoreFloor({ score: 0.36, threshold: 1 }, tolerance)).toBe(1);
  });

  it('falls back to the baseline alone when the corpus declares no threshold', () => {
    expect(scoreFloor({ score: 0.8 }, tolerance)).toBeCloseTo(0.75);
  });

  it('refuses a candidate that matches a baseline which itself failed the corpus', () => {
    const baseline = run('active', { refusal: suite(0, 0.001, 1000, 1, 1) });
    const candidate = run('next', { refusal: suite(0, 0.001, 1000, 1, 1) });
    const failed = compareToBaseline(baseline, candidate, toleranceFor(policy, 'lab/fast')).filter(
      (entry) => !entry.passed,
    );
    expect(failed.map((entry) => entry.axis)).toEqual(['score']);
    expect(failed[0]!.detail).toMatch(/corpus threshold 1\.000/);
  });
});

describe('auditBaselines', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agi-evals-audit-'));
    mkdirSync(join(dir, 'baselines'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeBaseline(key: string, value: unknown) {
    writeFileSync(join(dir, 'baselines', measurementFileName(key)), JSON.stringify(value));
  }

  const families = { 'lab/fast': { activeModelKey: 'active' } };

  it('passes an empty measurements directory and reports it audited nothing', () => {
    const verdict = auditBaselines({ measurementsDir: dir, families });
    expect(verdict.passed).toBe(true);
    expect(verdict.audited).toEqual([]);
  });

  it('accepts a live baseline of a registry family slot', () => {
    writeBaseline('lab/fast', {
      familyId: 'lab/fast',
      ...run('active', { coding: suite(0.9, 0.001, 1000) }),
    });
    const verdict = auditBaselines({ measurementsDir: dir, families });
    expect(verdict.passed).toBe(true);
    expect(verdict.audited).toEqual(['lab/fast']);
    expect(verdict.unmet).toEqual([]);
  });

  it('fails a replayed baseline, an orphaned one, and one whose suites carry no threshold', () => {
    writeBaseline('lab/fast', {
      familyId: 'lab/fast',
      ...run('active', { coding: suite(0.9, 0.001, 1000) }, { recordingSource: 'reference' }),
    });
    writeBaseline('lab/gone', {
      familyId: 'lab/gone',
      ...run('active', { coding: { version: 1, score: 0.9 } }),
    });
    const verdict = auditBaselines({ measurementsDir: dir, families });
    expect(verdict.passed).toBe(false);
    expect(verdict.problems.join('\n')).toMatch(/not a live measurement/);
    expect(verdict.problems.join('\n')).toMatch(/not a family slot in the registry/);
    expect(verdict.problems.join('\n')).toMatch(/carries no corpus threshold/);
  });

  it('names every committed baseline suite that does not meet its own corpus threshold', () => {
    writeBaseline('lab/fast', {
      familyId: 'lab/fast',
      ...run('active', { refusal: suite(0, 0.001, 1000, 1, 1) }),
    });
    const verdict = auditBaselines({ measurementsDir: dir, families });
    expect(verdict.passed).toBe(true);
    expect(verdict.unmet).toEqual([
      'lab/fast refusal: measured 0.000 against corpus threshold 1.000',
    ]);
  });
});
