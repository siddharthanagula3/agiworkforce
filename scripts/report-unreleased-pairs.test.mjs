import assert from 'node:assert/strict';
import test from 'node:test';

import { reportUnreleasedPairs } from './report-unreleased-pairs.mjs';

const BLOCKED = {
  id: 'fixture-pair',
  title: 'Fixture old client and current server',
  status: 'blocked',
  reason: 'The client has no retained predecessor artifact.',
  unblockedBy: 'Publish and retain a client release, then release a later version.',
};

test('unreleased pairs report their canonical reason and unblock action without failing', () => {
  const reports = [];
  const code = reportUnreleasedPairs(
    { pairs: [BLOCKED, { id: 'covered-fixture', status: 'covered' }] },
    { env: {}, report: (report) => reports.push(report) },
  );

  assert.equal(code, 0);
  assert.deepEqual(reports, [
    {
      title: BLOCKED.title,
      reason: BLOCKED.reason,
      unblockedBy: BLOCKED.unblockedBy,
      flawId: 'CI-CROSS-VERSION-PREDECESSORS-MISSING-01',
    },
  ]);
});

test('covered pairs emit no missing-prerequisite warning', () => {
  const code = reportUnreleasedPairs(
    { pairs: [{ id: 'covered-fixture', status: 'covered' }] },
    { env: {}, report: () => assert.fail('a covered pair is not blocked') },
  );

  assert.equal(code, 0);
});

for (const pair of [
  { ...BLOCKED, status: 'unknown' },
  { ...BLOCKED, reason: ' ' },
  { ...BLOCKED, unblockedBy: '' },
]) {
  test(`invalid gaps still fail (${JSON.stringify(pair)})`, () => {
    assert.throws(
      () =>
        reportUnreleasedPairs(
          { pairs: [pair] },
          { env: {}, report: () => assert.fail('an invalid gap must not be reported as not run') },
        ),
      /Invalid blocked cross-version pair/u,
    );
  });
}

test('a malformed matrix still fails', () => {
  assert.throws(() => reportUnreleasedPairs({}), /no pairs array/u);
});
