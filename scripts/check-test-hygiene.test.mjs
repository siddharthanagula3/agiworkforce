import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  BASELINE_PATH,
  REPO_ROOT,
  checkTestHygiene,
  configRetries,
  focusedTests,
  maskNonCode,
  suiteRetries,
  testFiles,
} from './check-test-hygiene.mjs';

const roots = [];

function fixture({ files = {}, baseline }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-hygiene-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'scripts/config'), { recursive: true });
  for (const [relative, body] of Object.entries(files)) {
    fs.mkdirSync(path.join(root, path.dirname(relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), body);
  }
  if (baseline !== undefined) {
    fs.writeFileSync(path.join(root, BASELINE_PATH), JSON.stringify(baseline));
  }
  return root;
}

const REASON =
  'Recorded by the fixture to stand in for a real reason that names what makes the retry necessary and what removes it.';

test.after(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
});

test('an ordinary suite passes', () => {
  const root = fixture({
    files: { 'a.test.ts': "it('works', () => { expect(sum()).toBe(2); });\n" },
  });
  assert.deepEqual(checkTestHygiene(root).failures, []);
});

test('a focused test fails and cannot be declared away', () => {
  for (const body of [
    "describe.only('x', () => {});\n",
    "it.only('x', () => {});\n",
    "fit('x', () => {});\n",
  ]) {
    const root = fixture({
      files: { 'a.test.ts': body },
      baseline: { retries: [], focused: [{ id: 'a.test.ts:1', reason: REASON }] },
    });
    const { failures } = checkTestHygiene(root);
    assert.equal(failures.length, 1, body);
    assert.match(failures[0], /focused test/);
  }
});

test('a suite retry fails undeclared and passes declared', () => {
  const files = {
    'a.spec.ts': "test.describe('x', () => {\n  test.describe.configure({ retries: 2 });\n});\n",
  };
  const undeclared = fixture({ files });
  assert.match(checkTestHygiene(undeclared).failures.join('\n'), /retries a failing test/);

  const declared = fixture({
    files,
    baseline: { retries: [{ id: 'a.spec.ts:2', reason: REASON }] },
  });
  assert.deepEqual(checkTestHygiene(declared).failures, []);
});

test('a runner config retry is read, and zero is not a retry', () => {
  const retrying = fixture({
    files: {
      'a.test.ts': "it('x', () => {});\n",
      'playwright.config.ts': 'export default { retries: 2 };\n',
    },
  });
  assert.match(checkTestHygiene(retrying).failures.join('\n'), /playwright\.config\.ts:1/);

  const none = fixture({
    files: {
      'a.test.ts': "it('x', () => {});\n",
      'playwright.config.ts': 'export default { retries: 0 };\n',
    },
  });
  assert.deepEqual(checkTestHygiene(none).failures, []);
});

test('a declared entry needs a reason and dies when it stops matching', () => {
  const files = { 'a.spec.ts': 'test.describe.configure({ retries: 1 });\n' };
  const labelled = fixture({
    files,
    baseline: { retries: [{ id: 'a.spec.ts:1', reason: 'flaky' }] },
  });
  assert.match(checkTestHygiene(labelled).failures.join('\n'), /needs a reason, not a label/);

  const stale = fixture({
    files: { 'a.test.ts': "it('x', () => {});\n" },
    baseline: { retries: [{ id: 'gone.spec.ts:1', reason: REASON }] },
  });
  assert.match(checkTestHygiene(stale).failures.join('\n'), /matches nothing now/);
});

test('a comment or a string about retries is not a retry', () => {
  const root = fixture({
    files: {
      'a.test.ts':
        "// test.describe.configure({ retries: 3 })\nit('names it', () => {\n  expect('retries: 3').toBe('retries: 3');\n});\n",
    },
  });
  assert.deepEqual(checkTestHygiene(root).failures, []);
});

test('an empty walk fails rather than passing silently', () => {
  const root = fixture({ files: { 'readme.md': 'no tests\n' } });
  assert.match(checkTestHygiene(root).failures.join('\n'), /the walk would be empty/);
});

test('helpers read what they claim to read', () => {
  assert.equal(maskNonCode("const a = 'it.only(';\n").includes('it.only('), false);
  assert.equal(focusedTests("test.only('x', () => {});").length, 1);
  assert.equal(suiteRetries('this.retries(2);').length, 1);
  assert.equal(configRetries('retries: 2,').length, 1);
  assert.equal(configRetries('maxRetries: 2,').length, 0);
});

test('the repository itself passes and the walk finds its whole test corpus', () => {
  const { failures, files } = checkTestHygiene(REPO_ROOT);
  assert.deepEqual(failures, []);
  assert.equal(files, testFiles(REPO_ROOT).length);
  assert.ok(files > 1000, `expected the full test corpus, found ${files}`);
});
