import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const GUARD = join(REPO_ROOT, 'scripts', 'check-executable-docs.mjs');

const BASE_INPUTS = {
  'apps/cli/README.md': '# cli\n',
  'apps/cli/npm/README.md': '# cli npm\n',
  'apps/cli/src/output_styles/explanatory.md': 'explanatory\n',
  'apps/cli/src/output_styles/learning.md': 'learning\n',
};

function runOnSandbox(files) {
  const sandbox = mkdtempSync(join(tmpdir(), 'infra41-'));
  try {
    for (const [rel, contents] of Object.entries({ ...BASE_INPUTS, ...files })) {
      const abs = join(sandbox, rel);
      mkdirSync(join(abs, '..'), { recursive: true });
      writeFileSync(abs, contents, 'utf8');
    }
    return spawnSync(process.execPath, [GUARD], { cwd: sandbox, encoding: 'utf8' });
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

const HATCHLING_MANIFEST = `[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "skillspector"
version = "2.3.1"
readme = "README.md"
license = "Apache-2.0"
`;

test('the real guard passes on the repository as it stands', () => {
  const result = spawnSync(process.execPath, [GUARD], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, `guard failed on the real repo:\n${result.stderr}`);
});

test('deleting a readme a hatchling package declares fails the check', () => {
  const result = runOnSandbox({ 'tools/skill-vetting/pyproject.toml': HATCHLING_MANIFEST });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}${result.stderr}`);
  assert.match(result.stderr, /tools\/skill-vetting\/README\.md/);
  assert.match(result.stderr, /pyproject\.toml/);
});

test('a hatchling readme= pointer whose file exists passes', () => {
  const result = runOnSandbox({
    'tools/skill-vetting/pyproject.toml': HATCHLING_MANIFEST,
    'tools/skill-vetting/README.md': '# SkillSpector\n',
  });
  assert.equal(result.status, 0, `expected pass, got:\n${result.stdout}${result.stderr}`);
});

test('an empty readme is as fatal to the build as a missing one', () => {
  const result = runOnSandbox({
    'tools/skill-vetting/pyproject.toml': HATCHLING_MANIFEST,
    'tools/skill-vetting/README.md': '\n  \n',
  });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}${result.stderr}`);
  assert.match(result.stderr, /is empty/);
});

test('a readme= pointer into a subdirectory resolves relative to the manifest', () => {
  const result = runOnSandbox({
    'tools/skill-vetting/pyproject.toml': HATCHLING_MANIFEST.replace(
      'readme = "README.md"',
      'readme = "docs/overview.md"',
    ),
  });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}${result.stderr}`);
  assert.match(result.stderr, /tools\/skill-vetting\/docs\/overview\.md/);
});

test('the PEP 621 inline-table form of readme= is understood', () => {
  const result = runOnSandbox({
    'tools/skill-vetting/pyproject.toml': HATCHLING_MANIFEST.replace(
      'readme = "README.md"',
      'readme = { file = "README.md", content-type = "text/markdown" }',
    ),
  });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}${result.stderr}`);
  assert.match(result.stderr, /tools\/skill-vetting\/README\.md/);
});

test('a readme key outside the [project] table is not a build input', () => {
  const result = runOnSandbox({
    'tools/skill-vetting/pyproject.toml': `${HATCHLING_MANIFEST.replace('readme = "README.md"\n', '')}
[tool.something]
readme = "NOT_A_BUILD_INPUT.md"
`,
  });
  assert.equal(result.status, 0, `expected pass, got:\n${result.stdout}${result.stderr}`);
});

test('a manifest with no readme= pointer demands no readme', () => {
  const result = runOnSandbox({
    'tools/skill-vetting/pyproject.toml': HATCHLING_MANIFEST.replace('readme = "README.md"\n', ''),
  });
  assert.equal(result.status, 0, `expected pass, got:\n${result.stdout}${result.stderr}`);
});

test('vendored pyproject manifests under node_modules are ignored', () => {
  const result = runOnSandbox({
    'node_modules/some-pkg/pyproject.toml': HATCHLING_MANIFEST,
  });
  assert.equal(result.status, 0, `expected pass, got:\n${result.stdout}${result.stderr}`);
});
