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

test('flags a direct message passed to a component-specific error setter', () => {
  const found = findRawErrorSinks('setFormError(mutationError.message);', 'a.tsx');
  assert.equal(found.length, 1);
});

test('flags a multiline raw-error expression', () => {
  const found = findRawErrorSinks(
    `setError(
      err instanceof Error
        ? err.message
        : 'Could not load'
    );`,
    'a.ts',
  );
  assert.equal(found.length, 1);
  assert.equal(found[0].line, 1);
});

test('flags a raw message nested in a state object', () => {
  const found = findRawErrorSinks(
    'setState((current) => ({ ...current, error: caught.message }));',
    'a.ts',
  );
  assert.equal(found.length, 1);
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

test('accepts a wrapped message nested in a state object', () => {
  assert.deepEqual(
    findRawErrorSinks(
      "setState((current) => ({ ...current, error: toUserMessage(err, 'Could not load') }));",
      'a.ts',
    ),
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

test('flags a caught message written onto a tool result the transcript renders', () => {
  const found = findRawErrorSinks(
    'return { content: `Tool ${name} failed: ${err instanceof Error ? err.message : String(err)}`, isError: true };',
    'a.ts',
  );
  assert.equal(found.length, 1);
});

test('flags the same leak whichever rendered field carries it', () => {
  for (const field of ['content', 'message', 'text', 'summary', 'detail']) {
    assert.equal(
      findRawErrorSinks(
        `const r = { ${field}: \`failed: \${caught.message}\`, isError: true };`,
        'a.ts',
      ).length,
      1,
      field,
    );
  }
});

test('flags a concatenated form as readily as an interpolated one', () => {
  assert.equal(
    findRawErrorSinks("const r = { content: 'failed: ' + err.message, isError: true };", 'a.ts')
      .length,
    1,
  );
});

test('leaves copy this repo wrote on its own typed error alone', () => {
  assert.deepEqual(
    findRawErrorSinks(
      'if (err instanceof ConnectorCredentialError) return { content: err.message, isError: true };',
      'a.ts',
    ),
    [],
  );
});

test('accepts a tool result whose text went through the boundary', () => {
  assert.deepEqual(
    findRawErrorSinks(
      'return { content: toUserMessage(err, `Tool ${name} failed`), isError: true };',
      'a.ts',
    ),
    [],
  );
});

test('ignores an error object shaped for a log line, which no reader sees', () => {
  assert.deepEqual(
    findRawErrorSinks(
      'logger.error({ error: { message: err.message, stack: err.stack } }, "failed");',
      'a.ts',
    ),
    [],
  );
});

test('ignores a rendered field on an object that claims no failure', () => {
  assert.deepEqual(findRawErrorSinks('const r = { content: err.message, ok: true };', 'a.ts'), []);
});
