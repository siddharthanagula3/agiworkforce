import assert from 'node:assert/strict';
import test from 'node:test';

import { checkBaselineCeiling } from './lib/module-reachability-ratchet.mjs';

test('an unchanged baseline passes', () => {
  assert.deepEqual(
    checkBaselineCeiling({ label: 'X', knownUnreachable: ['a', 'b'], ceiling: 2 }),
    [],
  );
});

test('growing the baseline fails instead of grandfathering new dead code', () => {
  const errors = checkBaselineCeiling({
    label: 'Desktop renderer',
    knownUnreachable: ['a', 'b', 'c'],
    ceiling: 2,
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /grew from 2 to 3/);
  assert.match(errors[0], /ratchets down/);
});

test('shrinking the baseline fails until the ceiling is lowered to lock the win', () => {
  const errors = checkBaselineCeiling({
    label: 'Desktop renderer',
    knownUnreachable: ['a'],
    ceiling: 2,
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Lower maxKnownUnreachable to 1/);
});

test('a missing or malformed ceiling is an error, not a silent skip', () => {
  for (const ceiling of [undefined, -1, 1.5, '3']) {
    assert.equal(
      checkBaselineCeiling({ label: 'X', knownUnreachable: [], ceiling }).length,
      1,
      `ceiling ${String(ceiling)} must be rejected`,
    );
  }
});
