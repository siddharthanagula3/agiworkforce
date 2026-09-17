import { describe, expect, it } from 'vitest';

import { extractCode, runCodeTests } from '../src/code-exec';
import { gradeCheckAsync } from '../src/grader';
import type { Check } from '../src/types';

const tests = [
  "import assert from 'node:assert/strict';",
  "import { add } from './solution.mjs';",
  'assert.equal(add(2, 3), 5);',
].join('\n');

const options = { module: 'solution.mjs', tests, timeoutMs: 5_000 };

describe('runCodeTests', () => {
  it('passes code that satisfies the tests', async () => {
    const result = await runCodeTests('export const add = (a, b) => a + b;', options);
    expect(result).toEqual({ passed: true, detail: 'tests passed' });
  });

  it('fails code whose assertions fail and says why', async () => {
    const result = await runCodeTests('export const add = (a, b) => a - b;', options);
    expect(result.passed).toBe(false);
    expect(result.detail).toMatch(/exited/);
  });

  it('kills code that never finishes', async () => {
    const result = await runCodeTests('export const add = () => { for (;;) {} };', {
      ...options,
      timeoutMs: 1_000,
    });
    expect(result).toMatchObject({ passed: false });
    expect(result.detail).toMatch(/timed out/);
  });

  it('refuses network and process modules inside the sandbox', async () => {
    for (const code of [
      "import 'node:net';\nexport const add = (a, b) => a + b;",
      "import { execSync } from 'node:child_process';\nexport const add = (a, b) => Number(execSync('echo 5'));",
      "export const add = (a, b) => a + b;\nawait fetch('https://example.com');",
    ]) {
      const result = await runCodeTests(code, options);
      expect(result.passed, code).toBe(false);
      expect(result.detail, code).toMatch(/sandbox/);
    }
  });

  it('cannot read files outside its own temp dir or write anywhere', async () => {
    const reads = await runCodeTests(
      "import { readFileSync } from 'node:fs';\nreadFileSync('/etc/hosts');\nexport const add = (a, b) => a + b;",
      options,
    );
    expect(reads.passed).toBe(false);
    expect(reads.detail).toMatch(/restricted|ERR_ACCESS_DENIED/);

    const writes = await runCodeTests(
      "import { writeFileSync } from 'node:fs';\nwriteFileSync('escape.txt', 'x');\nexport const add = (a, b) => a + b;",
      options,
    );
    expect(writes.passed).toBe(false);
    expect(writes.detail).toMatch(/restricted|ERR_ACCESS_DENIED/);
  });
});

describe('extractCode', () => {
  it('takes the last JavaScript block and ignores other languages', () => {
    const text =
      '```python\nprint(1)\n```\n```js\nexport const a = 1;\n```\n```javascript\nexport const b = 2;\n```';
    expect(extractCode(text)).toBe('export const b = 2;\n');
  });

  it('returns nothing when the only block is another language', () => {
    expect(extractCode('```python\nprint(1)\n```')).toBeNull();
  });
});

describe('codeTests check', () => {
  const check: Check = { kind: 'codeTests', module: 'solution.mjs', tests };

  it('grades an answer by running its code block', async () => {
    expect(
      (await gradeCheckAsync(check, { text: '```js\nexport const add = (a, b) => a + b;\n```' }))
        .passed,
    ).toBe(true);
    expect((await gradeCheckAsync(check, { text: 'I would add them together.' })).passed).toBe(
      false,
    );
  });
});
