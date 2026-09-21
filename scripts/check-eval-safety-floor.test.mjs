import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  compareToBaseline,
  readGatePolicy,
  scoreDropFor,
} from '../tools/evals/scripts/promotion-gate.mjs';
import {
  HARD_GATE_PRIORITY,
  SLOT_GATE,
  SLOT_WRITE,
  audit,
  auditServedFailures,
  autoServedModelKeys,
  failedHardGates,
  hardGateCorpora,
  tradeSafetyForCost,
  ungatedSlotWrites,
} from './lib/eval-safety-floor.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const TOLERANCE = readGatePolicy().tolerance;

test('a cheaper and faster candidate that scored worse on a hard gate is refused', () => {
  const { baseline, candidate } = tradeSafetyForCost('refusal');
  const findings = compareToBaseline(baseline, candidate, TOLERANCE);
  const score = findings.find((finding) => finding.axis === 'score');
  const cost = findings.find((finding) => finding.axis === 'cost');
  const latency = findings.find((finding) => finding.axis === 'latency');
  assert.equal(score.passed, false);
  assert.equal(cost.passed, true);
  assert.equal(latency.passed, true);
  assert.equal(
    findings.every((finding) => finding.passed),
    false,
  );
});

test('a hard-gate corpus is allowed no score drop at all', () => {
  assert.equal(scoreDropFor({ priority: HARD_GATE_PRIORITY }, TOLERANCE), 0);
  assert.ok(scoreDropFor({}, TOLERANCE) > 0);
});

test('the repository still marks safety corpora as hard gates', () => {
  const suites = hardGateCorpora(REPO_ROOT).map((corpus) => corpus.suite);
  assert.ok(suites.includes('refusal'));
  assert.ok(suites.includes('jailbreak'));
});

test('a promotion that writes a slot without running the gate first is caught', () => {
  const ungated = [
    'async function promote() {',
    `  const next = ${SLOT_WRITE}(family, promotion, policy);`,
    '  return next;',
    '}',
  ].join('\n');
  assert.deepEqual(ungatedSlotWrites(ungated), ['promote']);

  const lateGate = [
    'async function promote() {',
    `  const next = ${SLOT_WRITE}(family, promotion, policy);`,
    `  const refusals = ${SLOT_GATE}(targets);`,
    '  return refusals.length === 0 ? next : null;',
    '}',
  ].join('\n');
  assert.deepEqual(ungatedSlotWrites(lateGate), ['promote']);

  const gated = [
    'async function promote() {',
    `  const refusals = ${SLOT_GATE}(targets);`,
    '  if (refusals.length > 0) return null;',
    `  return ${SLOT_WRITE}(family, promotion, policy);`,
    '}',
  ].join('\n');
  assert.deepEqual(ungatedSlotWrites(gated), []);
});

test('a run below its own threshold on a hard-gate corpus is a failure, a met one is not', () => {
  const run = {
    suites: {
      refusal: { priority: 'P0', threshold: 1, score: 0 },
      golden: { priority: 'P0', threshold: 0.9, score: 0.92 },
      chat: { priority: 'P1', threshold: 1, score: 0.1 },
      files: { priority: 'P0' },
    },
  };
  assert.deepEqual(failedHardGates(run), ['files', 'refusal']);
});

test('a model Auto serves whose run fails a hard gate must be recorded with a decision', () => {
  const failures = new Map([['some-model', ['refusal']]]);

  const unrecorded = auditServedFailures(failures, { servedBelowThreshold: {} });
  assert.equal(unrecorded.problems.length, 1);
  assert.ok(unrecorded.problems[0].includes('served by Auto'));

  const bare = auditServedFailures(failures, {
    servedBelowThreshold: { 'some-model': { suites: ['refusal'] } },
  });
  assert.ok(bare.problems.some((problem) => problem.includes('needs a reason')));

  const recorded = auditServedFailures(failures, {
    servedBelowThreshold: {
      'some-model': { suites: ['refusal'], reason: 'held for a decision', decidedBy: 'founder' },
    },
  });
  assert.deepEqual(recorded.problems, []);
  assert.deepEqual(recorded.fixed, []);
});

test('a further corpus failing under an already recorded model is not covered by its entry', () => {
  const verdict = auditServedFailures(new Map([['some-model', ['jailbreak', 'refusal']]]), {
    servedBelowThreshold: {
      'some-model': { suites: ['refusal'], reason: 'held for a decision', decidedBy: 'founder' },
    },
  });
  assert.equal(verdict.problems.length, 1);
  assert.ok(verdict.problems[0].includes('jailbreak'));
});

test('a recorded corpus that started passing is reported so the entry cannot linger', () => {
  const verdict = auditServedFailures(new Map(), {
    servedBelowThreshold: {
      'some-model': {
        suites: ['refusal', 'jailbreak'],
        reason: 'held for a decision',
        decidedBy: 'founder',
      },
    },
  });
  assert.deepEqual(verdict.fixed, ['some-model:jailbreak', 'some-model:refusal']);
});

test('the Auto slots resolve to model keys through the family catalog', () => {
  const served = autoServedModelKeys(REPO_ROOT);
  assert.ok(served instanceof Set);
  assert.ok(served.size > 0);
  for (const key of served) assert.ok(!key.startsWith('family:'), `${key} was left unresolved`);
});

test('the repository passes every claim this check makes that is not held for a decision', () => {
  const baseline = {
    servedBelowThreshold: {
      reasoning_premium: {
        suites: ['jailbreak', 'refusal'],
        reason: 'the one recorded entry, held for a founder decision on the Auto line-up',
        decidedBy: 'founder',
      },
    },
  };
  const verdict = audit(REPO_ROOT, {
    compareToBaseline,
    scoreDropFor,
    tolerance: TOLERANCE,
    baseline,
  });
  assert.deepEqual(verdict.problems, []);
  assert.deepEqual(verdict.fixed, []);
});

test('an empty baseline leaves the repository failing, so the entry is doing real work', () => {
  const verdict = audit(REPO_ROOT, {
    compareToBaseline,
    scoreDropFor,
    tolerance: TOLERANCE,
    baseline: { servedBelowThreshold: {} },
  });
  assert.ok(verdict.problems.some((problem) => problem.includes('served by Auto')));
});
