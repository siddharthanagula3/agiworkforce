import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { CONTRACT_PATH, REPO_ROOT, checkTerminology, loadContract } from './check-terminology.mjs';
import { REGISTRY_PATH } from './check-concept-registry.mjs';

const roots = [];

function write(root, relativePath, contents) {
  const absolute = path.join(root, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

const MIGRATION =
  'create table if not exists public.organizations (\n  id uuid primary key\n);\n' +
  'create table if not exists public.workspaces (\n  id uuid primary key\n);\n';

const REGISTRY = {
  columnContract: { baselineMigration: 1, roles: { owner: { column: 'user_id', why: 'x' } } },
  concepts: [{ name: 'workspace', tables: ['workspaces'] }],
};

function contractFor(overrides = {}) {
  return {
    why: 'one word, one meaning',
    terms: [
      {
        term: 'account',
        means: 'the person who signed in and the thing a row belongs to',
        owns: { kind: 'columnRole', key: 'owner' },
      },
      {
        term: 'organization',
        means: 'the billed and governed company an account belongs to',
        owns: { kind: 'table', key: 'organizations' },
      },
      {
        term: 'workspace',
        means: 'the named container a member switches between, personal or organizational',
        owns: { kind: 'table', key: 'workspaces' },
      },
    ],
    distinctions: [
      { words: ['account', 'organization', 'workspace'], why: 'conflating them deletes a person' },
    ],
    retired: [{ word: 'org', use: 'organization' }],
    namedSurfaces: { apiRoot: 'apps/web/app/api', promptRoot: 'apps/web/lib/prompts' },
    conflations: [],
    ...overrides,
  };
}

function fixture(contract = contractFor(), { registry = REGISTRY, files = {} } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'terminology-'));
  roots.push(root);
  write(root, CONTRACT_PATH, JSON.stringify(contract));
  write(root, REGISTRY_PATH, JSON.stringify(registry));
  write(root, 'apps/web/db/neon/0001_core.sql', MIGRATION);
  mkdirSync(path.join(root, 'apps/web/app/api/organizations'), { recursive: true });
  write(
    root,
    'apps/web/lib/prompts/chat-system-prompt.ts',
    "export const PROMPT = 'Answer the account.';\n",
  );
  for (const [relativePath, contents] of Object.entries(files)) write(root, relativePath, contents);
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('the real guard passes on the repository as it stands', () => {
  assert.deepEqual(checkTerminology(REPO_ROOT).errors, []);
});

test('every shipped term carries a definition and an owner', () => {
  for (const term of loadContract(REPO_ROOT).terms) {
    assert.ok(term.means.length > 20, term.term);
    assert.ok(term.owns.kind.length > 0, term.term);
  }
});

test('a clean glossary passes', () => {
  assert.deepEqual(checkTerminology(fixture()).errors, []);
});

test('two terms owning one artifact fails', () => {
  const contract = contractFor();
  contract.terms[2].owns = { kind: 'table', key: 'organizations' };
  const { errors } = checkTerminology(fixture(contract));
  assert.ok(
    errors.some((error) => error.includes('owns the same artifact as')),
    errors.join('\n'),
  );
});

test('a term whose owner no longer exists fails', () => {
  const contract = contractFor();
  contract.terms[1].owns = { kind: 'table', key: 'companies' };
  const { errors } = checkTerminology(fixture(contract));
  assert.ok(
    errors.some((error) => error.includes('no migration creates companies')),
    errors.join('\n'),
  );
});

test('a distinction naming a word the glossary never defines fails', () => {
  const contract = contractFor({
    distinctions: [{ words: ['account', 'tenant'], why: 'they are not the same' }],
  });
  const { errors } = checkTerminology(fixture(contract));
  assert.ok(
    errors.some((error) => error.includes('names "tenant", which the')),
    errors.join('\n'),
  );
});

test('a retired spelling in a route path fails', () => {
  const root = fixture();
  mkdirSync(path.join(root, 'apps/web/app/api/org'), { recursive: true });
  const { errors } = checkTerminology(root);
  assert.ok(
    errors.some((error) => error.includes('the path says "org"')),
    errors.join('\n'),
  );
});

test('a retired spelling in a table name fails', () => {
  const root = fixture(contractFor(), {
    files: {
      'apps/web/db/neon/0002_more.sql':
        'create table if not exists public.org_settings (\n  id uuid primary key\n);\n',
    },
  });
  const { errors } = checkTerminology(root);
  assert.ok(
    errors.some((error) => error.includes('org_settings says "org"')),
    errors.join('\n'),
  );
});

test('a retired spelling inside an instruction fails', () => {
  const root = fixture(contractFor(), {
    files: {
      'apps/web/lib/prompts/chat-system-prompt.ts':
        "export const PROMPT = 'Tell the user which org they are in.';\n",
    },
  });
  const { errors } = checkTerminology(root);
  assert.ok(
    errors.some((error) => error.includes('an instruction spells "org"')),
    errors.join('\n'),
  );
});

test('one concept owning two named terms fails unless it is recorded', () => {
  const registry = {
    ...REGISTRY,
    concepts: [{ name: 'workspace', tables: ['workspaces', 'organizations'] }],
  };
  const { errors } = checkTerminology(fixture(contractFor(), { registry }));
  assert.ok(
    errors.some((error) => error.includes('One concept for two terms')),
    errors.join('\n'),
  );

  const recorded = contractFor({
    conflations: [
      {
        concept: 'workspace',
        tables: ['workspaces', 'organizations'],
        why: 'one concept owns both',
        fix: 'split it',
      },
    ],
  });
  assert.deepEqual(checkTerminology(fixture(recorded, { registry })).errors, []);
});

test('a recorded conflation the registry has since split is stale and fails', () => {
  const recorded = contractFor({
    conflations: [
      {
        concept: 'workspace',
        tables: ['workspaces', 'organizations'],
        why: 'one concept owns both',
        fix: 'split it',
      },
    ],
  });
  const { errors } = checkTerminology(fixture(recorded));
  assert.ok(
    errors.some((error) => error.includes('conflation is stale')),
    errors.join('\n'),
  );
});
