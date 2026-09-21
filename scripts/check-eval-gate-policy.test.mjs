import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { scoreDropFor } from '../tools/evals/scripts/promotion-gate.mjs';
import {
  auditGatePolicy,
  corpora,
  GATE_POLICY_FILE,
  PROMOTION_GATE_FILE,
  toleranceKeysRead,
} from './lib/eval-gate-policy.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

const KEYS = ['costIncreaseRatio', 'scoreDrop'];

const POLICY = {
  tolerance: { scoreDrop: 0.05, costIncreaseRatio: 0.25 },
  familyOverrides: {},
};

const SUITES = [
  { file: 'golden.json', suite: 'golden', passThreshold: 0.9, priority: 'P0' },
  { file: 'chat.json', suite: 'chat', passThreshold: 1, priority: 'P1' },
];

function audit(overrides = {}) {
  return auditGatePolicy({
    suites: SUITES,
    policy: POLICY,
    toleranceKeys: KEYS,
    scoreDropFor,
    ...overrides,
  });
}

test('the tolerances come from the gate, not from a list here', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, PROMOTION_GATE_FILE), 'utf8');

  assert.deepEqual(toleranceKeysRead(source), [
    'completenessDrop',
    'costIncreaseRatio',
    'latencyP95IncreaseRatio',
    'scoreDrop',
  ]);
  assert.throws(() => toleranceKeysRead('export function noop() {}'), /measuring nothing/u);
});

test('a well formed policy and corpora pass', () => {
  assert.deepEqual(audit().problems, []);
  assert.equal(audit().hardGates, 1);
});

test('a suite with no threshold or a threshold of zero fails', () => {
  for (const passThreshold of [undefined, 0, -1, 'high']) {
    const verdict = audit({ suites: [{ suite: 'chat', passThreshold, priority: 'P1' }] });
    assert.equal(verdict.passed, false, String(passThreshold));
    assert.match(verdict.problems.join('\n'), /is not gated/u);
  }
});

test('a suite with no priority fails', () => {
  const verdict = audit({ suites: [{ suite: 'chat', passThreshold: 1, priority: 'later' }] });

  assert.equal(verdict.passed, false);
  assert.match(verdict.problems.join('\n'), /it must be P0 or P1/u);
});

test('a hard gate that anything is allowed to average away fails', () => {
  const verdict = audit({ scoreDropFor: (base, tolerance) => tolerance.scoreDrop });

  assert.equal(verdict.passed, false);
  assert.match(verdict.problems.join('\n'), /golden is a hard gate and default tolerates/u);
});

test('a family override naming an unread tolerance fails', () => {
  const verdict = audit({
    policy: { ...POLICY, familyOverrides: { 'a/family': { scoreFloor: 0.5 } } },
  });

  assert.equal(verdict.passed, false);
  assert.match(verdict.problems.join('\n'), /familyOverrides\.a\/family sets scoreFloor/u);
});

test('a tolerance the gate reads but the policy omits fails, and the reverse too', () => {
  const missing = audit({ policy: { tolerance: { scoreDrop: 0.05 } } });
  assert.equal(missing.passed, false);
  assert.match(missing.problems.join('\n'), /reads tolerance\.costIncreaseRatio/u);

  const extra = audit({ policy: { tolerance: { ...POLICY.tolerance, unusedRatio: 1 } } });
  assert.equal(extra.passed, false);
  assert.match(
    extra.problems.join('\n'),
    /declares tolerance\.unusedRatio, which the gate never reads/u,
  );

  const wrong = audit({ policy: { tolerance: { ...POLICY.tolerance, scoreDrop: -1 } } });
  assert.equal(wrong.passed, false);
  assert.match(wrong.problems.join('\n'), /is not a tolerance/u);
});

test('an empty corpus set is a broken instrument', () => {
  const verdict = audit({ suites: [] });

  assert.equal(verdict.passed, false);
  assert.match(verdict.problems.join('\n'), /measuring nothing/u);
});

test('the repository passes its own gate policy', () => {
  const policy = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, GATE_POLICY_FILE), 'utf8'));
  const toleranceKeys = toleranceKeysRead(
    fs.readFileSync(path.join(REPO_ROOT, PROMOTION_GATE_FILE), 'utf8'),
  );

  assert.deepEqual(
    auditGatePolicy({ suites: corpora(REPO_ROOT), policy, toleranceKeys, scoreDropFor }).problems,
    [],
  );
});
