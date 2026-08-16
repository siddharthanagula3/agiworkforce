import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const GUARD = join(REPO_ROOT, 'scripts', 'check-no-hardcoded-endpoints.mjs');
const GUARD_SOURCE = readFileSync(GUARD, 'utf8');

function writeGuardVariant(sandboxDir, budgets) {
  const patched = GUARD_SOURCE.replace(
    /const SCAN_ROOTS = \[[^\]]*\];/,
    "const SCAN_ROOTS = ['packages'];",
  ).replace(/const BUDGETS = \[[\s\S]*?\n\];/, `const BUDGETS = ${JSON.stringify(budgets)};`);
  assert.ok(patched.includes("const SCAN_ROOTS = ['packages'];"), 'SCAN_ROOTS patch did not apply');
  assert.ok(patched.includes('const BUDGETS = ['), 'BUDGETS patch did not apply');
  const scriptDir = join(sandboxDir, 'scripts');
  mkdirSync(scriptDir, { recursive: true });
  const scriptPath = join(scriptDir, 'guard.mjs');
  writeFileSync(scriptPath, patched, 'utf8');
  return scriptPath;
}

function runOnSandbox(files, budgets = []) {
  const sandbox = mkdtempSync(join(tmpdir(), 'hard005-'));
  try {
    for (const [rel, contents] of Object.entries(files)) {
      const abs = join(sandbox, rel);
      mkdirSync(join(abs, '..'), { recursive: true });
      writeFileSync(abs, contents, 'utf8');
    }
    const scriptPath = writeGuardVariant(sandbox, budgets);
    return spawnSync(process.execPath, [scriptPath], { encoding: 'utf8' });
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

test('the real guard passes on the repository as it stands', () => {
  const result = spawnSync(process.execPath, [GUARD], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, `expected clean repo, got:\n${result.stderr}${result.stdout}`);
});

test('fails on a new hardcoded provider endpoint in an unlisted file', () => {
  const result = runOnSandbox({
    'packages/pkg/src/thing.ts': "const url = 'https://api.openai.com/v1/models';\n",
  });
  assert.equal(result.status, 1, 'guard should reject a new hardcoded provider endpoint');
  assert.match(result.stderr, /api\.openai\.com/);
  assert.match(result.stderr, /not an approved declaration/);
});

test('fails when a declared file grows past its budget', () => {
  const files = {
    'packages/pkg/src/decl.ts':
      "export const A = 'https://api.openai.com/v1';\nexport const B = 'https://api.anthropic.com/v1';\n",
  };
  const budgets = [{ file: 'packages/pkg/src/decl.ts', max: 1, why: 'test' }];
  const result = runOnSandbox(files, budgets);
  assert.equal(result.status, 1, 'guard should reject literals beyond the declared budget');
  assert.match(result.stderr, /exceeds the allowed budget of 1/);
});

test('passes when a declared file stays within its budget', () => {
  const result = runOnSandbox(
    { 'packages/pkg/src/decl.ts': "export const A = 'https://api.openai.com/v1';\n" },
    [{ file: 'packages/pkg/src/decl.ts', max: 1, why: 'test' }],
  );
  assert.equal(result.status, 0, result.stderr);
});

test('fails on a stale budget entry so the list cannot outlive the code', () => {
  const result = runOnSandbox({ 'packages/pkg/src/clean.ts': 'export const A = 1;\n' }, [
    { file: 'packages/pkg/src/gone.ts', max: 1, why: 'test' },
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Stale BUDGETS entries/);
});

test('treats a comment-only mention as documentation, not a defect', () => {
  const result = runOnSandbox({
    'packages/pkg/src/thing.ts':
      '// talks to https://api.openai.com/v1/models\nexport const X = 1;\n',
  });
  assert.equal(result.status, 0, result.stderr);
});

test('treats a *.test.ts file as a fixture', () => {
  const result = runOnSandbox({
    'packages/pkg/src/thing.test.ts': "const url = 'https://api.openai.com/v1/models';\n",
  });
  assert.equal(result.status, 0, result.stderr);
});

test("treats a Rust file's inline #[cfg(test)] module as a fixture", () => {
  const body = [
    'pub fn noop() {}',
    '',
    '#[cfg(test)]',
    'mod tests {',
    '    #[test]',
    '    fn t() {',
    '        assert_eq!("https://api.openai.com/v1", "https://api.openai.com/v1");',
    '    }',
    '}',
    '',
  ].join('\n');
  const result = runOnSandbox({ 'packages/pkg/src/thing.rs': body });
  assert.equal(result.status, 0, result.stderr);
});

test('treats a provider adapter package as a canonical declaration', () => {
  const result = runOnSandbox({
    'packages/ai/providers/acme/src/index.ts':
      "export const ACME_DEFAULT_BASE_URL = 'https://api.openai.com/v1';\n",
  });
  assert.equal(result.status, 0, result.stderr);
});

test('does not extend the adapter carve-out to a sibling directory', () => {
  const result = runOnSandbox({
    'packages/ai/provider-extras/src/index.ts': "export const URL = 'https://api.openai.com/v1';\n",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /not an approved declaration/);
});
