import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import {
  CONTRACT_PATH,
  MIGRATIONS_DIR,
  REPO_ROOT,
  checkResourceMetadata,
  readTableColumns,
} from './check-resource-metadata.mjs';

const GUARD = path.join(REPO_ROOT, 'scripts', 'check-resource-metadata.mjs');

const sandboxes = [];
after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

const BASE_ROLES = {
  ownerAccount: { column: 'user_id', why: 'the account the row belongs to' },
  organization: { column: 'organization_id', why: 'the organization the row is scoped to' },
  createdAt: { column: 'created_at', why: 'when the row came into existence' },
  updatedAt: { column: 'updated_at', why: 'when the row was last written' },
};

function sandbox({ migrations, contract }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'resource-metadata-'));
  sandboxes.push(dir);
  mkdirSync(path.join(dir, MIGRATIONS_DIR), { recursive: true });
  for (const [name, sql] of Object.entries(migrations)) {
    writeFileSync(path.join(dir, MIGRATIONS_DIR, name), sql, 'utf8');
  }
  mkdirSync(path.join(dir, path.dirname(CONTRACT_PATH)), { recursive: true });
  writeFileSync(path.join(dir, CONTRACT_PATH), JSON.stringify(contract), 'utf8');
  spawnSync('git', ['-C', dir, 'init', '-q'], { encoding: 'utf8' });
  return dir;
}

function errorsFor({ migrations, contract }) {
  return checkResourceMetadata(sandbox({ migrations, contract })).errors;
}

const TABLE = (body) => `create table if not exists public.widgets (\n${body}\n);\n`;

test('the real guard passes on the repository as it stands', () => {
  const result = spawnSync(process.execPath, [GUARD], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, `expected clean repo, got:\n${result.stderr}${result.stdout}`);
});

test('a table that records no creation time fails', () => {
  const errors = errorsFor({
    migrations: { '0001_widgets.sql': TABLE('  id uuid primary key,\n  user_id text not null') },
    contract: { roles: BASE_ROLES, tables: {}, gaps: [] },
  });
  assert.ok(
    errors.some((error) => error.includes('widgets records no creation time')),
    errors.join('\n'),
  );
});

test('a table that records its last change but not its birth fails', () => {
  const errors = errorsFor({
    migrations: {
      '0001_widgets.sql': TABLE('  id uuid primary key,\n  updated_at timestamptz not null'),
    },
    contract: { roles: BASE_ROLES, tables: {}, gaps: [] },
  });
  assert.ok(
    errors.some((error) => error.includes('but not when it began')),
    errors.join('\n'),
  );
});

test('a declared column no migration adds fails', () => {
  const errors = errorsFor({
    migrations: {
      '0001_widgets.sql': TABLE('  id uuid primary key,\n  created_at timestamptz not null'),
    },
    contract: { roles: BASE_ROLES, tables: { widgets: { createdAt: 'born_at' } }, gaps: [] },
  });
  assert.ok(
    errors.some((error) => error.includes('claims createdAt column born_at')),
    errors.join('\n'),
  );
});

test('a declaration that only restates the default fails', () => {
  const errors = errorsFor({
    migrations: {
      '0001_widgets.sql': TABLE('  id uuid primary key,\n  created_at timestamptz not null'),
    },
    contract: { roles: BASE_ROLES, tables: { widgets: { createdAt: 'created_at' } }, gaps: [] },
  });
  assert.ok(
    errors.some((error) => error.includes('already the default')),
    errors.join('\n'),
  );
});

test('a gap that no longer describes a gap fails, so the list only shrinks', () => {
  const errors = errorsFor({
    migrations: {
      '0001_widgets.sql': TABLE('  id uuid primary key,\n  created_at timestamptz not null'),
    },
    contract: {
      roles: BASE_ROLES,
      tables: {},
      gaps: [{ table: 'widgets', role: 'createdAt', standIn: 'nothing', why: 'historic' }],
    },
  });
  assert.ok(
    errors.some((error) => error.includes('no longer describes a real gap')),
    errors.join('\n'),
  );
});

test('a gap without a reason fails', () => {
  const errors = errorsFor({
    migrations: { '0001_widgets.sql': TABLE('  id uuid primary key,\n  name text') },
    contract: {
      roles: BASE_ROLES,
      tables: {},
      gaps: [{ table: 'widgets', role: 'createdAt', standIn: 'nothing', why: '  ' }],
    },
  });
  assert.ok(
    errors.some((error) => error.includes('carries no reason')),
    errors.join('\n'),
  );
});

test('a tenant-isolated table with no owner, tenant or parent fails', () => {
  const errors = errorsFor({
    migrations: {
      '0001_memories.sql':
        'create table if not exists public.user_memories (\n  id uuid primary key,\n  created_at timestamptz not null\n);\n',
    },
    contract: { roles: BASE_ROLES, tables: {}, gaps: [] },
  });
  assert.ok(
    errors.some((error) => error.includes('user_memories is a tenant-isolated resource')),
    errors.join('\n'),
  );
});

test('a child table inherits ownership through its declared parent', () => {
  const errors = errorsFor({
    migrations: {
      '0001_conversations.sql':
        'create table if not exists public.web_conversations (\n  id uuid primary key,\n  user_id text not null,\n  created_at timestamptz not null\n);\n',
      '0002_messages.sql':
        'create table if not exists public.web_messages (\n  id uuid primary key,\n  conversation_id uuid not null,\n  created_at timestamptz not null\n);\n',
    },
    contract: {
      roles: {
        ownerAccount: BASE_ROLES.ownerAccount,
        createdAt: BASE_ROLES.createdAt,
        parent: { declaredPerTable: true, why: "a child object's ownership is its parent's" },
      },
      tables: {
        web_messages: { parent: { column: 'conversation_id', table: 'web_conversations' } },
      },
      gaps: [],
    },
  });
  assert.deepEqual(errors, []);
});

test('a metadata role nothing carries fails', () => {
  const errors = errorsFor({
    migrations: {
      '0001_widgets.sql': TABLE('  id uuid primary key,\n  created_at timestamptz not null'),
    },
    contract: {
      roles: {
        ...BASE_ROLES,
        retentionClass: { column: 'retention_days', why: 'how long it is kept' },
      },
      tables: {},
      gaps: [],
    },
  });
  assert.ok(
    errors.some((error) => error.includes('a field on paper')),
    errors.join('\n'),
  );
});

test('a bearer share token with no visibility fails', () => {
  const errors = errorsFor({
    migrations: {
      '0001_links.sql':
        'create table if not exists public.public_links (\n  id uuid primary key,\n  token text not null,\n  created_at timestamptz not null\n);\n',
    },
    contract: {
      roles: { ...BASE_ROLES, visibility: { column: 'visibility', why: 'who may read the row' } },
      shareTokenColumn: 'token',
      tables: {},
      gaps: [],
    },
  });
  assert.ok(
    errors.some((error) => error.includes('hands out a bearer token')),
    errors.join('\n'),
  );
});

test('a foreign key that does not say what a parent delete does fails', () => {
  const errors = errorsFor({
    migrations: {
      '0001_parent.sql':
        'create table if not exists public.parents (\n  id uuid primary key,\n  created_at timestamptz not null\n);\n',
      '0002_child.sql':
        'create table if not exists public.children (\n  id uuid primary key,\n  parent_id uuid not null references public.parents(id),\n  created_at timestamptz not null\n);\n',
    },
    contract: { roles: BASE_ROLES, tables: {}, gaps: [] },
  });
  assert.ok(
    errors.some((error) => error.includes('without saying')),
    errors.join('\n'),
  );
});

test('a declared disposition passes and a stale record of one fails', () => {
  const migrations = {
    '0001_parent.sql':
      'create table if not exists public.parents (\n  id uuid primary key,\n  created_at timestamptz not null\n);\n',
    '0002_child.sql':
      'create table if not exists public.children (\n  id uuid primary key,\n  parent_id uuid not null references public.parents(id) on delete cascade,\n  created_at timestamptz not null\n);\n',
  };
  assert.deepEqual(
    errorsFor({
      migrations,
      contract: { roles: { createdAt: BASE_ROLES.createdAt }, tables: {}, gaps: [] },
    }),
    [],
  );
  const stale = errorsFor({
    migrations,
    contract: {
      roles: BASE_ROLES,
      tables: {},
      gaps: [],
      undeclaredDispositions: [{ child: 'children', parent: 'parents', why: 'historic' }],
    },
  });
  assert.ok(
    stale.some((error) => error.includes('no longer describes a real gap')),
    stale.join('\n'),
  );
});

test('the row timestamps migration adds the columns the contract depends on', () => {
  const tables = readTableColumns(REPO_ROOT);
  assert.ok(tables.get('organization_members').has('updated_at'));
  assert.ok(tables.get('connector_tool_permissions').has('created_at'));
  assert.ok(tables.get('mcp_response_cache').has('created_at'));
});
