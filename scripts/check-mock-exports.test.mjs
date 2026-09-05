import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import {
  analyzeMockFactory,
  checkTestFile,
  extractImportsBySpecifier,
  extractNamedExports,
  findMockFactoryCalls,
  findSubjectFiles,
  resolveSpecifier,
  runMockExportsGuard,
} from './check-mock-exports.mjs';

const sandboxes = [];
after(() => {
  for (const sandbox of sandboxes) rmSync(sandbox, { recursive: true, force: true });
});

function createSandbox() {
  const sandbox = mkdtempSync(path.join(tmpdir(), 'agi-mock-exports-guard-'));
  sandboxes.push(sandbox);
  return sandbox;
}

function writeFiles(root, files) {
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, contents, 'utf8');
  }
}

function initGitRepo(root) {
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
}

test('flags a vi.mock factory that omits a real export the subject imports', () => {
  const sandbox = createSandbox();
  writeFiles(sandbox, {
    'src/mocked.ts': 'export function foo() {}\nexport function bar() {}\n',
    'src/subject.ts':
      "import { foo, bar } from './mocked';\nexport function use() { return foo() + bar(); }\n",
    'src/consumer.test.ts':
      "import { describe, it, vi } from 'vitest';\n" +
      "vi.mock('./mocked', () => ({\n  foo: () => 'stub-foo',\n}));\n" +
      "import { use } from './subject';\n" +
      "describe('consumer', () => { it('works', () => { use(); }); });\n",
  });
  initGitRepo(sandbox);

  const findings = checkTestFile(sandbox, path.join(sandbox, 'src/consumer.test.ts'));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].specifier, './mocked');
  assert.deepEqual(findings[0].missing, ['bar']);
});

test('never flags a factory that spreads importOriginal', () => {
  const sandbox = createSandbox();
  writeFiles(sandbox, {
    'src/mocked.ts': 'export function foo() {}\nexport function bar() {}\n',
    'src/subject.ts':
      "import { foo, bar } from './mocked';\nexport function use() { return foo() + bar(); }\n",
    'src/consumer.test.ts':
      "import { describe, it, vi } from 'vitest';\n" +
      "vi.mock('./mocked', async (importOriginal) => ({\n" +
      '  ...(await importOriginal()),\n' +
      "  foo: () => 'stub-foo',\n" +
      '}));\n' +
      "import { use } from './subject';\n" +
      "describe('consumer', () => { it('works', () => { use(); }); });\n",
  });
  initGitRepo(sandbox);

  const findings = checkTestFile(sandbox, path.join(sandbox, 'src/consumer.test.ts'));
  assert.deepEqual(findings, []);
});

test('never flags an export the module under test never imports', () => {
  const sandbox = createSandbox();
  writeFiles(sandbox, {
    'src/mocked.ts':
      'export function foo() {}\nexport function bar() {}\nexport function baz() {}\n',
    'src/subject.ts': "import { foo } from './mocked';\nexport function use() { return foo(); }\n",
    'src/consumer.test.ts':
      "import { describe, it, vi } from 'vitest';\n" +
      "vi.mock('./mocked', () => ({\n  foo: () => 'stub-foo',\n}));\n" +
      "import { use } from './subject';\n" +
      "describe('consumer', () => { it('works', () => { use(); }); });\n",
  });
  initGitRepo(sandbox);

  const findings = checkTestFile(sandbox, path.join(sandbox, 'src/consumer.test.ts'));
  assert.deepEqual(findings, []);
});

test('resolves a co-located subject by naming stem, not every file in the directory', () => {
  const sandbox = createSandbox();
  writeFiles(sandbox, {
    'src/route.ts':
      "import { getTeamAdminAccess } from './team-admin-access';\nexport function GET() { return getTeamAdminAccess(); }\n",
    'src/team-admin-access.ts':
      'export function getTeamAdminAccess() {}\nexport function otherHelper() {}\n',
    'src/unrelated.ts':
      "import { otherHelper } from './team-admin-access';\nexport function unrelated() { return otherHelper(); }\n",
    'src/route.variant.test.ts':
      "import { describe, it, vi } from 'vitest';\n" +
      "vi.mock('./team-admin-access', () => ({}));\n" +
      "import { GET } from './route';\n" +
      "describe('route', () => { it('works', () => { GET(); }); });\n",
  });
  initGitRepo(sandbox);

  const findings = checkTestFile(sandbox, path.join(sandbox, 'src/route.variant.test.ts'));
  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0].missing, ['getTeamAdminAccess']);
  assert.ok(
    !findings[0].missing.includes('otherHelper'),
    'a same-directory file the test does not name-match must not contribute requirements',
  );
});

test('findSubjectFiles excludes an unrelated same-directory file that shares no naming stem', () => {
  const sandbox = createSandbox();
  writeFiles(sandbox, {
    'src/AccountPanel.tsx': 'export function AccountPanel() {}\n',
    'src/BillingPanel.tsx': 'export function BillingPanel() {}\n',
    'src/AccountPanel.delete.test.tsx':
      "import { describe, it } from 'vitest';\nimport { AccountPanel } from './AccountPanel';\ndescribe('AccountPanel', () => { it('works', () => { AccountPanel(); }); });\n",
  });
  initGitRepo(sandbox);

  const testFile = path.join(sandbox, 'src/AccountPanel.delete.test.tsx');
  const subjects = findSubjectFiles(sandbox, testFile, '', new Set());
  const basenames = subjects.map((file) => path.basename(file)).sort();
  assert.deepEqual(basenames, ['AccountPanel.tsx']);
});

test('extractNamedExports reads function, const, class and re-export declarations', () => {
  const source = [
    'export function alpha() {}',
    'export async function beta() {}',
    'export const gamma = 1;',
    'export class Delta {}',
    'export default function EntryPoint() {}',
    "export { epsilon, zeta as renamedZeta } from './other';",
    'export type NotRuntime = string;',
    'export interface AlsoNotRuntime {}',
  ].join('\n');
  const names = extractNamedExports(source);
  assert.deepEqual(
    [...names].sort(),
    ['Delta', 'alpha', 'beta', 'default', 'epsilon', 'gamma', 'renamedZeta'].sort(),
  );
  assert.ok(!names.has('EntryPoint'), 'a named default export is importable only as default');
  assert.ok(!names.has('NotRuntime'));
  assert.ok(!names.has('AlsoNotRuntime'));
});

test('extractImportsBySpecifier ignores type-only imports and follows aliases and namespaces', () => {
  const source = [
    "import type { Shape } from './mocked';",
    "import { real, other as renamed } from './mocked';",
    "import * as ns from './mocked';",
    'ns.namespacedCall();',
  ].join('\n');
  const bySpecifier = extractImportsBySpecifier(source);
  const names = [...(bySpecifier.get('./mocked') ?? [])].sort();
  assert.deepEqual(names, ['namespacedCall', 'other', 'real']);
});

test('analyzeMockFactory reports a fixed key set only for a static object literal', () => {
  assert.deepEqual([...analyzeMockFactory('() => ({ a: 1, b: () => 2 })').keys].sort(), ['a', 'b']);
  assert.equal(analyzeMockFactory('() => ({ a: 1, ...rest })').fixed, false);
  assert.equal(analyzeMockFactory('() => ({ [computedKey]: 1 })').fixed, false);
  assert.equal(analyzeMockFactory('() => existingMockModule').fixed, false);
  assert.deepEqual([...analyzeMockFactory('async () => { return { a: 1 }; }').keys].sort(), ['a']);
});

test('findMockFactoryCalls extracts the specifier and factory text for each vi.mock call', () => {
  const source = [
    "vi.mock('./a', () => ({ x: 1 }));",
    "vi.mock('./b', async () => ({ y: 2 }));",
  ].join('\n');
  const calls = findMockFactoryCalls(source);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].specifier, './a');
  assert.equal(calls[1].specifier, './b');
});

test('resolveSpecifier follows relative paths and returns null for bare package specifiers', () => {
  const sandbox = createSandbox();
  writeFiles(sandbox, { 'src/target.ts': 'export const value = 1;\n' });
  const fromFile = path.join(sandbox, 'src/consumer.ts');
  assert.equal(
    resolveSpecifier(sandbox, fromFile, './target'),
    path.join(sandbox, 'src/target.ts'),
  );
  assert.equal(resolveSpecifier(sandbox, fromFile, 'some-node-module'), null);
});

test('runMockExportsGuard reports zero findings and exit-worthy output on a clean tree', () => {
  const sandbox = createSandbox();
  writeFiles(sandbox, {
    'src/mocked.ts': 'export function foo() {}\n',
    'src/subject.ts': "import { foo } from './mocked';\nexport function use() { return foo(); }\n",
    'src/consumer.test.ts':
      "import { describe, it, vi } from 'vitest';\n" +
      "vi.mock('./mocked', () => ({\n  foo: () => 'stub-foo',\n}));\n" +
      "import { use } from './subject';\n" +
      "describe('consumer', () => { it('works', () => { use(); }); });\n",
  });
  initGitRepo(sandbox);

  const result = runMockExportsGuard({ repoRoot: sandbox, roots: ['src'] });
  assert.deepEqual(result.findings, []);
  assert.match(result.output, /passed/);
});
