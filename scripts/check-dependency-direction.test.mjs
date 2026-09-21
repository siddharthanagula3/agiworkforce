import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CONTRACT_PATH,
  REPO_ROOT,
  checkDependencyDirection,
  loadContract,
  readImports,
} from './check-dependency-direction.mjs';

const roots = [];

function write(root, relativePath, contents) {
  const absolute = path.join(root, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

function baseContract() {
  return {
    workspaceScope: '@agiworkforce/',
    domainRoots: ['packages/contracts/'],
    domainPackages: ['@agiworkforce/types'],
    providerAdapterRoots: ['packages/ai/providers/'],
    providerSdkMatch: '^openai$',
    forbidden: [
      {
        name: 'react',
        match: '^react($|/)',
        why: 'a rule cannot depend on how one surface draws it',
      },
      { name: 'database-client', match: '^pg$', why: 'storage is an adapter' },
    ],
    forbiddenExemptions: [],
    providerSdkExemptions: [],
    rootsWithoutDomain: [],
  };
}

function fixture(overrides = {}, files = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'dependency-direction-'));
  roots.push(root);
  execFileSync('git', ['-C', root, 'init', '--quiet']);
  write(root, CONTRACT_PATH, JSON.stringify({ ...baseContract(), ...overrides }));
  mkdirSync(path.join(root, 'apps/web'), { recursive: true });
  mkdirSync(path.join(root, 'packages/platform/utils'), { recursive: true });
  write(root, 'apps/web/page.ts', "import { x } from '@agiworkforce/types';\nexport const y = x;");
  write(
    root,
    'packages/platform/utils/src/index.ts',
    "import type { X } from '@agiworkforce/types';\nexport type Y = X;",
  );
  write(
    root,
    'packages/ai/providers/openai/src/index.ts',
    "import OpenAI from 'openai';\nexport const client = OpenAI;",
  );
  for (const [relativePath, contents] of Object.entries(files)) write(root, relativePath, contents);
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('the real guard passes on the repository as it stands', () => {
  const { errors } = checkDependencyDirection(REPO_ROOT);
  assert.deepEqual(errors, []);
});

test('a clean tree passes', () => {
  assert.deepEqual(checkDependencyDirection(fixture()).errors, []);
});

test('the domain importing React, a database client or a provider SDK fails', () => {
  for (const [specifier, fragment] of [
    ['react', 'the domain imports react'],
    ['pg', 'the domain imports pg'],
  ]) {
    const root = fixture(
      {},
      {
        'packages/contracts/types/src/thing.ts': `import x from '${specifier}';\nexport const y = x;`,
      },
    );
    const { errors } = checkDependencyDirection(root);
    assert.ok(
      errors.some((error) => error.includes(fragment)),
      `${specifier}: ${errors.join('\n')}`,
    );
  }
});

test('an import inside a comment is not an import', () => {
  const root = fixture(
    {},
    {
      'packages/contracts/types/src/thing.ts':
        '/**\n * content: \'import React from "react";\'\n */\nexport const y = 1;',
    },
  );
  assert.deepEqual(checkDependencyDirection(root).errors, []);
});

test('the domain reaching sideways into a workspace package fails', () => {
  const root = fixture(
    {},
    {
      'packages/contracts/types/src/thing.ts':
        "import { db } from '@agiworkforce/data-layer';\nexport const y = db;",
    },
  );
  const { errors } = checkDependencyDirection(root);
  assert.ok(
    errors.some((error) =>
      error.includes('imports the workspace package @agiworkforce/data-layer'),
    ),
    errors.join('\n'),
  );
});

test('a root that never reaches the domain fails until it is recorded', () => {
  const root = fixture({}, { 'packages/platform/utils/src/index.ts': 'export const y = 1;' });
  const { errors } = checkDependencyDirection(root);
  assert.ok(
    errors.some((error) => error.includes('nothing here imports the shared contract')),
    errors.join('\n'),
  );

  const recorded = fixture(
    { rootsWithoutDomain: [{ root: 'packages/platform/utils/', why: 'declares its own shapes' }] },
    { 'packages/platform/utils/src/index.ts': 'export const y = 1;' },
  );
  assert.deepEqual(checkDependencyDirection(recorded).errors, []);

  const stale = fixture({
    rootsWithoutDomain: [{ root: 'packages/platform/utils/', why: 'declares its own shapes' }],
  });
  assert.ok(
    checkDependencyDirection(stale).errors.some((error) =>
      error.includes('now imports it. Delete the entry'),
    ),
  );
});

test('a provider SDK imported outside its adapter fails', () => {
  const root = fixture(
    {},
    { 'apps/web/lib/call.ts': "import OpenAI from 'openai';\nexport const c = OpenAI;" },
  );
  const { errors } = checkDependencyDirection(root);
  assert.ok(
    errors.some((error) => error.includes('imports the provider SDK openai from outside')),
    errors.join('\n'),
  );
});

test('a provider SDK pattern no adapter uses fails, so the rule cannot go quiet', () => {
  const root = fixture({ providerSdkMatch: '^no-such-sdk$' });
  const { errors } = checkDependencyDirection(root);
  assert.ok(
    errors.some((error) => error.includes('no provider adapter imports a provider SDK')),
    errors.join('\n'),
  );
});

test('the real contract names every provider adapter root that exists', () => {
  const contract = loadContract(REPO_ROOT);
  const imports = readImports({
    repoRoot: REPO_ROOT,
    files: ['packages/ai/providers/openai/src/index.ts'],
  });
  assert.ok(contract.providerAdapterRoots.length > 0);
  assert.ok(imports instanceof Map);
});
