import assert from 'node:assert/strict';
import test from 'node:test';

import { checkAgainstBaseline, countByFile, findEmDashes } from './lib/em-dash-in-copy.mjs';

test('flags an em dash in a rendered string', () => {
  const found = findEmDashes("const a = 'Not applicable — we use our own keys';", 'a.tsx');
  assert.equal(found.length, 1);
  assert.equal(found[0].line, 1);
});

test('flags an em dash in JSX text', () => {
  assert.equal(findEmDashes('  <p>Reports are read — but not paid</p>', 'a.tsx').length, 1);
});

test('ignores a line comment', () => {
  assert.deepEqual(findEmDashes('  // the loop — as measured — is fine', 'a.tsx'), []);
});

test('ignores a docblock line', () => {
  assert.deepEqual(findEmDashes(' * the loop — as measured — is fine', 'a.tsx'), []);
});

test('ignores the standalone placeholder for an absent value', () => {
  assert.deepEqual(findEmDashes("  if (!value) return '—';", 'a.tsx'), []);
});

test('counts every em dash on a line, not just the first', () => {
  const found = findEmDashes("const a = 'six groups — chat, billing — are checked';", 'a.tsx');
  assert.equal(found.length, 2);
});

test('counts per file', () => {
  assert.deepEqual(countByFile([{ file: 'a.tsx' }, { file: 'a.tsx' }, { file: 'b.tsx' }]), {
    'a.tsx': 2,
    'b.tsx': 1,
  });
});

test('a file over its ceiling fails', () => {
  assert.deepEqual(checkAgainstBaseline({ 'a.tsx': 3 }, { perFile: { 'a.tsx': 2 } }), [
    'a.tsx: 3 em dash(es) in copy (baseline allows 2)',
  ]);
});

test('a file at or under its ceiling passes', () => {
  assert.deepEqual(checkAgainstBaseline({ 'a.tsx': 2 }, { perFile: { 'a.tsx': 2 } }), []);
  assert.deepEqual(checkAgainstBaseline({ 'a.tsx': 1 }, { perFile: { 'a.tsx': 2 } }), []);
});

test('a file absent from the baseline may not introduce any', () => {
  assert.deepEqual(checkAgainstBaseline({ 'new.tsx': 1 }, { perFile: {} }), [
    'new.tsx: 1 em dash(es) in copy (baseline allows 0)',
  ]);
});

test('flags the HTML entity as well as the character', () => {
  assert.equal(findEmDashes('  <p>sent by a person &mdash; nothing here</p>', 'a.tsx').length, 1);
  assert.equal(findEmDashes('  <p>a &#8212; b</p>', 'a.tsx').length, 1);
  assert.equal(findEmDashes('  <p>a &#x2014; b</p>', 'a.tsx').length, 1);
});

test('ignores an entity placeholder cell', () => {
  assert.deepEqual(findEmDashes('  <td>&mdash;</td>', 'a.tsx'), []);
});
