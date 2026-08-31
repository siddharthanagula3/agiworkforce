import assert from 'node:assert/strict';
import test from 'node:test';

import { checkAgainstBaseline, countByFile, findUnpaired } from './lib/theme-only-text-colours.mjs';

test('flags a light shade with no dark counterpart', () => {
  const found = findUnpaired('<span className="text-rose-300">Failed</span>', 'a.tsx');
  assert.equal(found.length, 1);
  assert.equal(found[0].className, 'text-rose-300');
  assert.equal(found[0].line, 1);
});

test('accepts a paired light and dark value on the same element', () => {
  assert.deepEqual(
    findUnpaired('<span className="text-rose-700 dark:text-rose-300">Failed</span>', 'a.tsx'),
    [],
  );
});

test('accepts a value that is already scoped to the dark theme', () => {
  assert.deepEqual(findUnpaired('<span className="dark:text-amber-300" />', 'a.tsx'), []);
});

test('ignores shades dark enough to read on a light surface', () => {
  for (const shade of ['500', '600', '700', '800', '900']) {
    assert.deepEqual(
      findUnpaired(`<span className="text-rose-${shade}" />`, 'a.tsx'),
      [],
      `text-rose-${shade} should not be flagged`,
    );
  }
});

test('a dark pairing for a different family does not clear the unpaired one', () => {
  const found = findUnpaired('<span className="text-rose-300 dark:text-amber-300" />', 'a.tsx');
  assert.equal(found.length, 1);
  assert.equal(found[0].className, 'text-rose-300');
});

test('reports the line each occurrence sits on', () => {
  const found = findUnpaired('one\n<i className="text-sky-400" />\nthree', 'a.tsx');
  assert.equal(found.length, 1);
  assert.equal(found[0].line, 2);
});

test('an unchanged count passes', () => {
  const counts = countByFile([
    { file: 'a.tsx', line: 1, className: 'text-rose-300' },
    { file: 'a.tsx', line: 2, className: 'text-sky-300' },
  ]);
  assert.deepEqual(counts, { 'a.tsx': 2 });
  assert.deepEqual(checkAgainstBaseline(counts, { perFile: { 'a.tsx': 2 } }), []);
});

test('one more than the baseline fails, so new violations cannot be grandfathered', () => {
  const errors = checkAgainstBaseline({ 'a.tsx': 3 }, { perFile: { 'a.tsx': 2 } });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /3 unpaired \(baseline allows 2\)/);
});

test('a file absent from the baseline may not introduce any', () => {
  const errors = checkAgainstBaseline({ 'new.tsx': 1 }, { perFile: {} });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /baseline allows 0/);
});

test('fewer than the baseline passes, so a fix never fails the build', () => {
  assert.deepEqual(checkAgainstBaseline({ 'a.tsx': 1 }, { perFile: { 'a.tsx': 2 } }), []);
});

test('a baseline missing perFile is treated as allowing nothing', () => {
  const errors = checkAgainstBaseline({ 'a.tsx': 1 }, {});
  assert.equal(errors.length, 1);
});
