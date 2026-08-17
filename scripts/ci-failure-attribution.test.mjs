import assert from 'node:assert/strict';
import test from 'node:test';

import { attributeGateFailures, formatAttributionReport } from './ci-failure-attribution.mjs';

const BASELINE = {
  workflow: 'ci.yml',
  commit: 'baseline0',
  recordedAt: '2026-08-01T00:00:00Z',
  note: 'Named baseline for pre-existing CI debt.',
  preExisting: [{ gate: 'Mobile E2E', evidence: 'MOB-02 blocks Play Console setup' }],
};

const RUNS = [
  {
    head_sha: 'commit3',
    created_at: '2026-08-04T00:00:00Z',
    jobs: [
      { name: 'JS verify', conclusion: 'failure' },
      { name: 'Rust desktop/CLI', conclusion: 'failure' },
      { name: 'Mobile E2E', conclusion: 'failure' },
    ],
  },
  {
    head_sha: 'commit2',
    created_at: '2026-08-03T00:00:00Z',
    jobs: [
      { name: 'JS verify', conclusion: 'failure' },
      { name: 'Rust desktop/CLI', conclusion: 'success' },
      { name: 'Mobile E2E', conclusion: 'failure' },
    ],
  },
  {
    head_sha: 'commit1',
    created_at: '2026-08-02T00:00:00Z',
    jobs: [
      { name: 'JS verify', conclusion: 'success' },
      { name: 'Rust desktop/CLI', conclusion: 'success' },
      { name: 'Mobile E2E', conclusion: 'failure' },
    ],
  },
  {
    head_sha: 'baseline0',
    created_at: '2026-08-01T00:00:00Z',
    jobs: [
      { name: 'JS verify', conclusion: 'success' },
      { name: 'Rust desktop/CLI', conclusion: 'success' },
      { name: 'Mobile E2E', conclusion: 'failure' },
    ],
  },
];

test('every red gate is attributed to an introducing commit or the named baseline', () => {
  const report = attributeGateFailures({ baseline: BASELINE, runs: RUNS });

  assert.deepEqual(
    report.map((entry) => [entry.gate, entry.verdict, entry.introducedBy]),
    [
      ['JS verify', 'regression', 'commit2'],
      ['Mobile E2E', 'pre-existing', null],
      ['Rust desktop/CLI', 'regression', 'commit3'],
    ],
  );
});

test('a gate red at the baseline is pre-existing even when the baseline never declared it', () => {
  const report = attributeGateFailures({
    baseline: { ...BASELINE, preExisting: [] },
    runs: RUNS,
  });

  const mobile = report.find((entry) => entry.gate === 'Mobile E2E');
  assert.equal(mobile.verdict, 'pre-existing');
  assert.equal(mobile.declared, false);
});

test('a gate declared pre-existing but green at the baseline is still a regression', () => {
  const report = attributeGateFailures({
    baseline: { ...BASELINE, preExisting: [{ gate: 'JS verify', evidence: 'claimed inherited' }] },
    runs: RUNS,
  });

  const jsVerify = report.find((entry) => entry.gate === 'JS verify');
  assert.equal(jsVerify.verdict, 'regression');
  assert.equal(jsVerify.introducedBy, 'commit2');
});

test('no history before the baseline leaves the gate unattributed rather than guessed', () => {
  const report = attributeGateFailures({
    baseline: { ...BASELINE, commit: 'missing' },
    runs: RUNS,
  });

  assert.deepEqual(
    report.map((entry) => entry.verdict),
    ['unattributed', 'unattributed', 'unattributed'],
  );
});

test('anchors on the run that triggered it, not on a newer run that landed since', () => {
  const newer = {
    head_sha: 'commit4',
    created_at: '2026-08-05T00:00:00Z',
    jobs: [{ name: 'Web a11y', conclusion: 'failure' }],
  };
  const report = attributeGateFailures({
    baseline: BASELINE,
    runs: [newer, ...RUNS],
    headSha: 'commit3',
  });

  assert.deepEqual(
    report.map((entry) => entry.gate),
    ['JS verify', 'Mobile E2E', 'Rust desktop/CLI'],
  );
});

test('green runs produce an empty report', () => {
  const report = attributeGateFailures({
    baseline: BASELINE,
    runs: [{ head_sha: 'commit4', jobs: [{ name: 'JS verify', conclusion: 'success' }] }],
  });

  assert.deepEqual(report, []);
});

test('the report names the baseline and the introducing commit for a human reader', () => {
  const text = formatAttributionReport({
    baseline: BASELINE,
    headSha: 'commit3',
    report: attributeGateFailures({ baseline: BASELINE, runs: RUNS }),
  });

  assert.match(text, /JS verify/);
  assert.match(text, /commit2/);
  assert.match(text, /pre-existing at baseline0/);
  assert.match(text, /MOB-02/);
});
