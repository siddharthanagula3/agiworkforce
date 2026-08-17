import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectFacts, collectReadmeFactErrors } from './check-readme-facts.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const GUARD = join(REPO_ROOT, 'scripts', 'check-readme-facts.mjs');

const SANDBOX_CATALOG = {
  providers: { openai: {}, ollama: {} },
  models: { 'fixture-model-a': {}, 'fixture-model-b': {}, 'fixture-model-c': {} },
};

const SANDBOX_README = `# Fixture

Unifies 2 catalog providers.

- Catalog of 3 models across 2 providers: OpenAI and the local runtime Ollama.

| Directory | Contents |
| --------- | -------- |
| packages/ | 1 shared TypeScript packages |
| providers | 2 per-provider adapter packages |
| crates/   | 1 Rust crates |

| Surface | Version | Status  |
| ------- | ------- | ------- |
| Mobile  | 4.5.6   | Partial |

\`\`\`bash
git clone https://github.com/fixture-owner/fixture-repo.git
\`\`\`

Done.
`;

function sandboxFiles(readme) {
  return {
    'README.md': readme,
    'package.json': JSON.stringify({
      repository: { url: 'https://github.com/fixture-owner/fixture-repo.git' },
    }),
    'packages/contracts/types/src/models.json': JSON.stringify(SANDBOX_CATALOG),
    'packages/contracts/types/package.json': '{"name":"types"}',
    'packages/ai/providers/openai/package.json': '{"name":"openai"}',
    'packages/ai/providers/ollama/package.json': '{"name":"ollama"}',
    'crates/fixture-crate/Cargo.toml': '[package]\nname = "fixture-crate"\n',
    'apps/mobile/package.json': '{"name":"mobile","version":"4.5.6"}',
  };
}

function runOnSandbox(readme) {
  const sandbox = mkdtempSync(join(tmpdir(), 'docs05-'));
  try {
    for (const [rel, contents] of Object.entries(sandboxFiles(readme))) {
      const abs = join(sandbox, rel);
      mkdirSync(join(abs, '..'), { recursive: true });
      writeFileSync(abs, contents, 'utf8');
    }
    return spawnSync(process.execPath, [GUARD], { cwd: sandbox, encoding: 'utf8' });
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

test('the real repository README matches the catalog, the packages, and the manifests', () => {
  const result = spawnSync(process.execPath, [GUARD], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(
    result.status,
    0,
    `guard failed on the real repo:\n${result.stdout}${result.stderr}`,
  );
  assert.match(result.stdout, /README fact check passed/);
});

test('the real README states the catalog model count, not a marketing number', () => {
  const facts = collectFacts(REPO_ROOT);
  const readme = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8');
  const stated = Number(readme.match(/Catalog of (\d+) models/)?.[1]);
  assert.equal(stated, facts.modelCount);
});

test('an inflated model count fails the guard', () => {
  const result = runOnSandbox(
    SANDBOX_README.replace('Catalog of 3 models', 'Catalog of 60 models'),
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /catalog model count of 60, but the repository has 3/);
});

test('a provider the catalog does not have cannot be silently named away', () => {
  const result = runOnSandbox(
    SANDBOX_README.replace('OpenAI and the local runtime Ollama', 'Cohere and AI21'),
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /does not name the catalog provider OpenAI/);
  assert.match(result.stderr, /does not name the catalog provider Ollama/);
});

test('a surface version that drifts from its manifest fails the guard', () => {
  const result = runOnSandbox(SANDBOX_README.replace('| 4.5.6   |', '| 9.9.9   |'));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /lists Mobile at 9\.9\.9, but its manifest says 4\.5\.6/);
});

test('a promise of content that does not exist fails the guard', () => {
  const result = runOnSandbox(SANDBOX_README.replace('Done.', '_Screenshots will be added here._'));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /promises content that does not exist/);
});

test('a repository owner that disagrees with the README clone URL fails the guard', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'docs05-owner-'));
  try {
    const files = sandboxFiles(SANDBOX_README);
    files['package.json'] = JSON.stringify({
      repository: { url: 'https://github.com/wrong-owner/fixture-repo.git' },
    });
    for (const [rel, contents] of Object.entries(files)) {
      const abs = join(sandbox, rel);
      mkdirSync(join(abs, '..'), { recursive: true });
      writeFileSync(abs, contents, 'utf8');
    }
    const result = spawnSync(process.execPath, [GUARD], { cwd: sandbox, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /repository\.url is https:\/\/github\.com\/wrong-owner\/fixture-repo\.git/,
    );
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test('the real package.json repository owner matches the README clone URL', () => {
  const facts = collectFacts(REPO_ROOT);
  const readme = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8');
  const cloneUrl = readme.match(/git clone (https:\/\/github\.com\/\S+?)(?:\.git)?\s/)?.[1];
  assert.ok(cloneUrl, 'README.md must document a clone URL');
  assert.equal(facts.repositoryUrl.replace(/\.git$/, ''), cloneUrl);
});

test('a stated count the guard can no longer find is an error, not a pass', () => {
  const errors = collectReadmeFactErrors('# Empty', {
    modelCount: 3,
    providerCount: 2,
    providerLabels: [],
    unlabelledProviders: [],
    adapterPackages: 2,
    sharedPackages: 1,
    crateCount: 1,
    versions: {},
  });
  assert.ok(errors.some((error) => /no longer states its catalog model count/.test(error)));
  assert.ok(
    errors.some((error) =>
      /no longer has a "\| Surface \| Version \| Status \|" table/.test(error),
    ),
  );
});

test('a catalog provider with no README label is reported instead of skipped', () => {
  const errors = collectReadmeFactErrors(SANDBOX_README, {
    modelCount: 3,
    providerCount: 2,
    providerLabels: ['OpenAI', 'Ollama'],
    unlabelledProviders: ['brand_new_provider'],
    adapterPackages: 2,
    sharedPackages: 1,
    crateCount: 1,
    versions: {},
  });
  assert.ok(errors.some((error) => /brand_new_provider has no README label/.test(error)));
});
