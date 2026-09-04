import assert from 'node:assert/strict';
import test from 'node:test';

import { countByFile, findEmDashes } from './lib/em-dash-in-copy.mjs';

const EM_DASH = '\u2014';

test('flags an em dash in a rendered string', () => {
  const found = findEmDashes(`const a = 'Not applicable ${EM_DASH} we use our own keys';`, 'a.tsx');
  assert.equal(found.length, 1);
  assert.equal(found[0].line, 1);
});

test('flags an em dash in JSX text', () => {
  assert.equal(
    findEmDashes(`  <p>Reports are read ${EM_DASH} but not paid</p>`, 'a.tsx').length,
    1,
  );
});

test('flags an em dash in a line comment', () => {
  assert.equal(
    findEmDashes(`  // the loop ${EM_DASH} as measured ${EM_DASH} is fine`, 'a.tsx').length,
    2,
  );
});

test('flags an em dash in a docblock line', () => {
  assert.equal(
    findEmDashes(` * the loop ${EM_DASH} as measured ${EM_DASH} is fine`, 'a.tsx').length,
    2,
  );
});

test('flags a standalone em dash placeholder', () => {
  assert.equal(findEmDashes(`  if (!value) return '${EM_DASH}';`, 'a.tsx').length, 1);
});

test('counts every em dash on a line, not just the first', () => {
  const found = findEmDashes(
    `const a = 'six groups ${EM_DASH} chat, billing ${EM_DASH} are checked';`,
    'a.tsx',
  );
  assert.equal(found.length, 2);
});

test('ignores a line with no em dash', () => {
  assert.deepEqual(
    findEmDashes("const a = 'six groups, chat, billing, are checked';", 'a.tsx'),
    [],
  );
});

test('counts per file', () => {
  assert.deepEqual(countByFile([{ file: 'a.tsx' }, { file: 'a.tsx' }, { file: 'b.tsx' }]), {
    'a.tsx': 2,
    'b.tsx': 1,
  });
});

test('flags the HTML entity forms as well as the character', () => {
  assert.equal(findEmDashes('  <p>sent by a person &mdash; nothing here</p>', 'a.tsx').length, 1);
  assert.equal(findEmDashes('  <p>a &#8212; b</p>', 'a.tsx').length, 1);
  assert.equal(findEmDashes('  <p>a &#x2014; b</p>', 'a.tsx').length, 1);
});

test('flags an entity placeholder cell', () => {
  assert.equal(findEmDashes('  <td>&mdash;</td>', 'a.tsx').length, 1);
});
