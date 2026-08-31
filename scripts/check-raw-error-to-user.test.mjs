import assert from 'node:assert/strict';
import test from 'node:test';

import { checkAgainstBaseline, countByFile, findRawErrorSinks } from './lib/raw-error-to-user.mjs';

test('flags a caught error forwarded straight to a user-visible sink', () => {
  const found = findRawErrorSinks(
    "setError(err instanceof Error ? err.message : 'Could not load');",
    'a.ts',
  );
  assert.equal(found.length, 1);
  assert.equal(found[0].line, 1);
});

test.each = undefined;

for (const sink of ['setError', 'setChatError', 'toast.error', 'setListError']) {
  test(`covers the ${sink} sink`, () => {
    assert.equal(
      findRawErrorSinks(`${sink}(e instanceof Error ? e.message : 'x');`, 'a.ts').length,
      1,
    );
  });
}

test('accepts the wrapped form', () => {
  assert.deepEqual(
    findRawErrorSinks("setError(toUserMessage(err, 'Could not load'));", 'a.ts'),
    [],
  );
});

test('ignores a raw message that is only logged', () => {
  assert.deepEqual(
    findRawErrorSinks("logger.error(err instanceof Error ? err.message : 'x');", 'a.ts'),
    [],
  );
});

test('ignores a raw message that is thrown rather than shown', () => {
  assert.deepEqual(
    findRawErrorSinks("throw new Error(err instanceof Error ? err.message : 'x');", 'a.ts'),
    [],
  );
});

test('ignores a commented-out line', () => {
  assert.deepEqual(
    findRawErrorSinks("// setError(err instanceof Error ? err.message : 'x');", 'a.ts'),
    [],
  );
});

test('a file absent from the baseline may not introduce one', () => {
  const errors = checkAgainstBaseline({ 'new.ts': 1 }, { perFile: {} });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /baseline 0/);
});

test('an unchanged count passes and a fix never fails the build', () => {
  assert.deepEqual(checkAgainstBaseline({ 'a.ts': 1 }, { perFile: { 'a.ts': 1 } }), []);
  assert.deepEqual(checkAgainstBaseline({ 'a.ts': 0 }, { perFile: { 'a.ts': 1 } }), []);
});

test('counts per file', () => {
  assert.deepEqual(
    countByFile([
      { file: 'a.ts', line: 1 },
      { file: 'a.ts', line: 9 },
      { file: 'b.ts', line: 3 },
    ]),
    { 'a.ts': 2, 'b.ts': 1 },
  );
});
