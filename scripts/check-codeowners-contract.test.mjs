import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const GUARD = join(REPO_ROOT, 'scripts', 'check-codeowners-contract.mjs');
const REAL_CODEOWNERS = readFileSync(join(REPO_ROOT, '.github', 'CODEOWNERS'), 'utf8');

function runOnSandbox({ codeowners, present }) {
  const sandbox = mkdtempSync(join(tmpdir(), 'docs02-'));
  try {
    mkdirSync(join(sandbox, '.github'), { recursive: true });
    writeFileSync(join(sandbox, '.github', 'CODEOWNERS'), codeowners, 'utf8');
    for (const relativePath of present) {
      if (relativePath.endsWith('/')) {
        mkdirSync(join(sandbox, relativePath), { recursive: true });
      } else {
        mkdirSync(dirname(join(sandbox, relativePath)), { recursive: true });
        writeFileSync(join(sandbox, relativePath), '', 'utf8');
      }
    }
    return spawnSync(process.execPath, [GUARD], { cwd: sandbox, encoding: 'utf8' });
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

function ownedPathsOf(codeowners) {
  return codeowners
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => line.split(/\s+/)[0])
    .filter((pattern) => pattern !== '*');
}

test('a CODEOWNERS entry for a deleted file fails the contract check', () => {
  const owned = ownedPathsOf(REAL_CODEOWNERS);
  const result = runOnSandbox({
    codeowners: `${REAL_CODEOWNERS}\n/TODO.md @siddhartha\n`,
    present: owned,
  });

  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /owns a path that does not exist: \/TODO\.md/);
});

test('a wildcard entry resolves when at least one file matches', () => {
  const codeowners = [
    '# Provisional CODEOWNERS for pre-release AGI Workforce.',
    '# Replace @siddhartha with GitHub teams when the company/org structure exists.',
    '',
    '* @siddhartha',
    '/scripts/check-*.mjs @siddhartha',
  ].join('\n');

  const matched = runOnSandbox({ codeowners, present: ['scripts/check-thing.mjs'] });
  assert.match(matched.stderr, /missing required owned path/);
  assert.doesNotMatch(matched.stderr, /owns a path that does not exist/);

  const unmatched = runOnSandbox({ codeowners, present: ['scripts/build.mjs'] });
  assert.match(unmatched.stderr, /owns a path that does not exist: \/scripts\/check-\*\.mjs/);
});

test('the repository CODEOWNERS owns only paths that resolve', () => {
  const result = spawnSync(process.execPath, [GUARD], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
