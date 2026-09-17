import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { evalGateRefusals, runEvalGate } from '../scripts/family-slots.mjs';

const decision = (familyId, modelKey) => ({ familyId, promotable: { modelKey } });

test('a promotion is refused when the eval gate refuses its candidate', () => {
  const calls = [];
  const refusals = evalGateRefusals(
    [decision('lab/fast', 'held'), decision('lab/pro', 'regressed')],
    (familyId, modelKey) => {
      calls.push([familyId, modelKey]);
      return modelKey === 'held'
        ? { passed: true, detail: '' }
        : { passed: false, detail: 'FAIL coding score: 0.5 vs baseline 0.9' };
    },
  );
  assert.deepEqual(calls, [
    ['lab/fast', 'held'],
    ['lab/pro', 'regressed'],
  ]);
  assert.equal(refusals.length, 1);
  assert.match(refusals[0], /regressed failed the eval gate for lab\/pro/);
  assert.match(refusals[0], /coding score/);
});

test('the real gate refuses a candidate with no measured baseline or run', () => {
  const verdict = runEvalGate('no-such/family', 'no-such-model');
  assert.equal(verdict.passed, false);
  assert.match(verdict.detail, /no measured eval baseline/);
  assert.match(verdict.detail, /no measured eval run/);
});

test('a missing gate script fails closed', () => {
  const missing = path.join(os.tmpdir(), 'agi-no-such-gate', 'promotion-gate.mjs');
  assert.equal(fs.existsSync(missing), false);
  const verdict = runEvalGate('lab/fast', 'next', missing);
  assert.equal(verdict.passed, false);
  assert.match(verdict.detail, /not found/);
});
