import assert from 'node:assert/strict';
import test from 'node:test';

import { runLiveEvals } from './run-live-evals.mjs';

for (const value of [undefined, '', ' \t ']) {
  test(`live evals report a missing provider key without calling a runner (${JSON.stringify(value)})`, () => {
    const reports = [];
    const code = runLiveEvals({
      env: { ANTHROPIC_API_KEY: value },
      spawnImpl: () => assert.fail('a missing key must never start live evals'),
      report: (report) => reports.push(report),
    });

    assert.equal(code, 0);
    assert.equal(reports.length, 1);
    assert.match(reports[0].reason, /ANTHROPIC_API_KEY/u);
    assert.match(reports[0].unblockedBy, /funded ANTHROPIC_API_KEY repository secret/u);
    assert.equal(reports[0].flawId, 'CI-LIVE-EVAL-CREDENTIAL-MISSING-01');
  });
}

for (const status of [0, 1, 2, null]) {
  test(`configured evals preserve the runner result (${status})`, () => {
    const calls = [];
    const code = runLiveEvals({
      env: { ANTHROPIC_API_KEY: 'fixture-key', AGIWORKFORCE_LIVE_TEST: '0' },
      spawnImpl: (...args) => {
        calls.push(args);
        return { status };
      },
      report: () => assert.fail('configured evals must not report a missing prerequisite'),
    });

    assert.equal(code, status ?? 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 'pnpm');
    assert.deepEqual(calls[0][1], ['exec', 'vitest', 'run', 'tools/evals']);
    assert.equal(calls[0][2].env.AGIWORKFORCE_LIVE_TEST, '1');
    assert.equal(calls[0][2].env.ANTHROPIC_API_KEY, 'fixture-key');
    assert.equal(calls[0][2].stdio, 'inherit');
  });
}
