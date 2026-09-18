import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertingHelpers,
  maskLiterals,
  scanTestFile,
  testBodies,
} from './check-test-integrity.mjs';

// Assembled rather than written out, so this file's own fixtures are not
// findings when the guard is pointed at the repository.
const IT = ['i', 't'].join('');
const EXPECT = ['exp', 'ect'].join('');

function unit(body) {
  return `${IT}('does the thing', () => {\n${body}\n});\n`;
}

function scan(body, file = 'apps/web/lib/subject.test.ts') {
  return scanTestFile(file, unit(body));
}

test('a test that checks nothing is a finding', () => {
  const findings = scan('  doTheThing();');
  assert.equal(findings.length, 1);
  assert.match(findings[0].label, /asserts nothing/);
});

test('a test that checks something is not a finding', () => {
  assert.deepEqual(scan(`  ${EXPECT}(doTheThing()).toBe(3);`), []);
});

test('a brace inside the test name does not cut the body short', () => {
  const source = `${IT}('returns { message } and nothing else', () => {\n  ${EXPECT}(x).toBe(1);\n});\n`;
  assert.deepEqual(scanTestFile('apps/web/lib/subject.test.ts', source), []);
});

test('a brace inside a regex literal does not cut the body short', () => {
  const source = `${IT}('reads the ledger', () => {\n  const m = /caption="x"[\\s\\S]*?\\]\\}/u.exec(s);\n  ${EXPECT}(m).not.toBeNull();\n});\n`;
  assert.deepEqual(scanTestFile('apps/web/lib/subject.test.ts', source), []);
});

test('a test call quoted inside a fixture string is not scanned as a test', () => {
  const source = `const fixture = "${IT}('inner', () => { use(); });";\n${IT}('outer', () => {\n  ${EXPECT}(fixture).toContain('inner');\n});\n`;
  assert.deepEqual(scanTestFile('apps/web/lib/subject.test.ts', source), []);
});

test('a helper in the same file that checks on the caller behalf counts', () => {
  const source = `function assertShape(v) {\n  ${EXPECT}(v.kind).toBe('a');\n}\n${unit('  assertShape(doTheThing());')}`;
  assert.ok(assertingHelpers(source).has('assertShape'));
  assert.deepEqual(scanTestFile('apps/web/lib/subject.test.ts', source), []);
});

test('an imported check-shaped call counts as the assertion', () => {
  assert.deepEqual(scan('  assertPinnedImages(config());'), []);
});

test('a value compared against itself is a finding', () => {
  const findings = scan(`  ${EXPECT}(result).toEqual(result);`);
  assert.equal(findings.length, 1);
  assert.match(findings[0].label, /compared against itself/);
});

test('a call compared against itself is left alone, it checks determinism', () => {
  assert.deepEqual(scan(`  ${EXPECT}(policy('free')).toBe(policy('free'));`), []);
});

test('matchers that pass on any value are findings', () => {
  const cases = [
    `${EXPECT}(true).toBeTruthy();`,
    `${EXPECT}(result).toEqual(${EXPECT}.anything());`,
    `${EXPECT}(rows.length).toBeGreaterThanOrEqual(0);`,
    `${EXPECT}(text).toContain('');`,
    `${EXPECT}(text).toMatch(/.*/);`,
  ];
  for (const source of cases) {
    const findings = scan(`  ${source}`);
    assert.ok(findings.length >= 1, `expected a finding for ${source}`);
  }
});

test('an empty catch over assertions is a finding, a bare try is not', () => {
  const swallowed = scan(
    `  try {\n    ${EXPECT}(x).toBe(1);\n  } catch {\n  }\n  ${EXPECT}(y).toBe(2);`,
  );
  assert.equal(swallowed.length, 1);
  assert.match(swallowed[0].label, /cannot fail here/);

  assert.deepEqual(
    scan(`  try {\n    await run();\n  } catch {\n  }\n  ${EXPECT}(onError).toHaveBeenCalled();`),
    [],
  );
});

test('mocking the module the test is named after is a finding', () => {
  const source = `vi.mock('./subject');\n${unit(`  ${EXPECT}(x).toBe(1);`)}`;
  const findings = scanTestFile('apps/web/lib/subject.test.ts', source);
  assert.equal(findings.length, 1);
  assert.match(findings[0].label, /unit under test/);
});

test('mocking a different module is not a finding', () => {
  const source = `vi.mock('./collaborator');\n${unit(`  ${EXPECT}(x).toBe(1);`)}`;
  assert.deepEqual(scanTestFile('apps/web/lib/subject.test.ts', source), []);
});

test('an annotation on the line above suppresses a finding', () => {
  const source = `// test-integrity-allow: the call throws when it fails\n${unit('  doTheThing();')}`;
  assert.deepEqual(scanTestFile('apps/web/lib/subject.test.ts', source), []);
});

test('maskLiterals keeps offsets and line breaks', () => {
  const source = "const a = 'one\\ntwo';\nconst b = 2;\n";
  const masked = maskLiterals(source);
  assert.equal(masked.length, source.length);
  assert.equal(masked.split('\n').length, source.split('\n').length);
  assert.ok(!masked.includes('one'));
  assert.ok(masked.includes('const b = 2;'));
});

test('testBodies finds the callback block, not the first brace', () => {
  const source = `${IT}.each([{ a: 1 }])('case $a', ({ a }) => {\n  ${EXPECT}(a).toBe(1);\n});\n`;
  const bodies = testBodies(maskLiterals(source));
  assert.equal(bodies.length, 1);
  assert.match(bodies[0].body, /toBe\(1\)/);
});
