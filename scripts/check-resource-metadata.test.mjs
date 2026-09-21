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

/** Every answer a foreign key cannot express has to say why nothing needs it. */
const UNUSED_ANSWERS = {
  archive_child: 'no parent archives its children',
  detach_child: 'no edge clears the link',
  ask_user: 'no delete offers a choice',
  preserve_shared_derivative: 'no derivative outlives its parent',
  preserve_external_source: 'nothing here owns an external row',
  block_deletion: 'every edge cascades',
};

function withoutAnswer(answer) {
  const rest = { ...UNUSED_ANSWERS };
  delete rest[answer];
  return rest;
}

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
      contract: {
        roles: { createdAt: BASE_ROLES.createdAt },
        tables: {},
        gaps: [],
        childDispositionsNotUsed: withoutAnswer('delete_child'),
      },
    }),
    [],
  );
  const stale = errorsFor({
    migrations,
    contract: {
      roles: BASE_ROLES,
      tables: {},
      gaps: [],
      childDispositionsNotUsed: withoutAnswer('delete_child'),
      undeclaredDispositions: [
        { child: 'children', parent: 'parents', why: 'historic', answer: 'block_deletion' },
      ],
    },
  });
  assert.ok(
    stale.some((error) => error.includes('no longer describes a real gap')),
    stale.join('\n'),
  );
});

test('an undeclared disposition has to answer the dependency graph', () => {
  const migrations = {
    '0001_parent.sql':
      'create table if not exists public.parents (\n  id uuid primary key,\n  created_at timestamptz not null\n);\n',
    '0002_child.sql':
      'create table if not exists public.children (\n  id uuid primary key,\n  parent_id uuid not null references public.parents(id),\n  created_at timestamptz not null\n);\n',
  };
  const errors = errorsFor({
    migrations,
    contract: {
      roles: { createdAt: BASE_ROLES.createdAt },
      tables: {},
      gaps: [],
      childDispositionsNotUsed: withoutAnswer('block_deletion'),
      undeclaredDispositions: [{ child: 'children', parent: 'parents', why: 'historic' }],
    },
  });
  assert.ok(
    errors.some((error) => error.includes('answers "undefined"')),
    errors.join('\n'),
  );
});

test('an answer no edge gives has to say why the product never needs it', () => {
  const migrations = {
    '0001_parent.sql':
      'create table if not exists public.parents (\n  id uuid primary key,\n  created_at timestamptz not null\n);\n',
    '0002_child.sql':
      'create table if not exists public.children (\n  id uuid primary key,\n  parent_id uuid not null references public.parents(id) on delete cascade,\n  created_at timestamptz not null\n);\n',
  };
  const missing = errorsFor({
    migrations,
    contract: {
      roles: { createdAt: BASE_ROLES.createdAt },
      tables: {},
      gaps: [],
      childDispositionsNotUsed: { archive_child: 'no parent archives its children' },
    },
  });
  assert.ok(
    missing.some((error) => error.includes('offers "ask_user" and no edge answers it')),
    missing.join('\n'),
  );

  const stale = errorsFor({
    migrations,
    contract: {
      roles: { createdAt: BASE_ROLES.createdAt },
      tables: {},
      gaps: [],
      childDispositionsNotUsed: { ...UNUSED_ANSWERS, delete_child: 'nothing cascades here' },
    },
  });
  assert.ok(
    stale.some((error) => error.includes('is recorded as unused')),
    stale.join('\n'),
  );
});

test('a set null edge detaches the child and a restrict edge blocks the delete', () => {
  const migrations = {
    '0001_parent.sql':
      'create table if not exists public.parents (\n  id uuid primary key,\n  created_at timestamptz not null\n);\n',
    '0002_child.sql':
      'create table if not exists public.children (\n  id uuid primary key,\n  parent_id uuid references public.parents(id) on delete set null,\n  created_at timestamptz not null\n);\n',
    '0003_ledger.sql':
      'create table if not exists public.ledgers (\n  id uuid primary key,\n  parent_id uuid not null references public.parents(id) on delete restrict,\n  created_at timestamptz not null\n);\n',
  };
  assert.deepEqual(
    errorsFor({
      migrations,
      contract: {
        roles: { createdAt: BASE_ROLES.createdAt },
        tables: {},
        gaps: [],
        childDispositionsNotUsed: {
          delete_child: 'nothing cascades here',
          archive_child: 'no parent archives its children',
          ask_user: 'no delete offers a choice',
          preserve_shared_derivative: 'no derivative outlives its parent',
          preserve_external_source: 'nothing here owns an external row',
        },
      },
    }),
    [],
  );
});

test('the row timestamps migration adds the columns the contract depends on', () => {
  const tables = readTableColumns(REPO_ROOT);
  assert.ok(tables.get('organization_members').has('updated_at'));
  assert.ok(tables.get('connector_tool_permissions').has('created_at'));
  assert.ok(tables.get('mcp_response_cache').has('created_at'));
});

const OPERATION_ROLE_DEFAULTS = {
  operationId: { column: 'id', why: 'the handle a caller quotes' },
  startedAt: { column: 'started_at', why: 'when the work began' },
  progress: { column: 'progress', why: 'how far along it is' },
  stage: { column: 'status', why: 'which step it is in' },
  cancellation: { column: 'cancel_requested_at', why: 'that a stop was asked for' },
  retry: { column: 'attempts', why: 'how many times it has been tried' },
  result: { column: 'result', why: 'what it produced' },
  error: { column: 'last_error', why: 'why it failed' },
  requestId: { column: 'idempotency_key', why: 'the reference a reader quotes' },
  cost: { column: 'usage', why: 'what it spent' },
  completedAt: { column: 'completed_at', why: 'when it ended' },
};

const OPERATION_MIGRATION = {
  '0001_runs.sql':
    'create table if not exists public.widget_runs (\n' +
    '  id uuid primary key,\n  user_id uuid,\n  created_at timestamptz,\n  updated_at timestamptz,\n' +
    '  started_at timestamptz,\n  progress int,\n  status text,\n  cancel_requested_at timestamptz,\n' +
    '  attempts int,\n  result jsonb,\n  last_error text,\n  idempotency_key text,\n' +
    '  usage jsonb,\n  completed_at timestamptz\n);\n',
};

const OPERATION_DECLARATION = {
  operationId: 'id',
  startedAt: 'started_at',
  progress: 'progress',
  stage: 'status',
  cancellation: 'cancel_requested_at',
  retry: 'attempts',
  result: 'result',
  error: 'last_error',
  requestId: 'idempotency_key',
  cost: 'usage',
  completedAt: 'completed_at',
};

function operationContract(overrides = {}) {
  return {
    roles: {
      ...BASE_ROLES,
      ...OPERATION_ROLE_DEFAULTS,
      version: { column: 'server_version', why: 'the concurrency token' },
    },
    tables: {},
    gaps: [],
    operations: { widget_runs: OPERATION_DECLARATION },
    ...overrides,
  };
}

test('an operation table that declares no operation fields fails', () => {
  const errors = errorsFor({
    migrations: OPERATION_MIGRATION,
    contract: operationContract({ operations: {} }),
  });
  assert.ok(
    errors.some((error) => error.includes('widget_runs records one run of something')),
    errors.join('\n'),
  );
});

test('an operation field that names a column no migration adds fails', () => {
  const errors = errorsFor({
    migrations: OPERATION_MIGRATION,
    contract: operationContract({
      operations: { widget_runs: { ...OPERATION_DECLARATION, cost: 'spend_microusd' } },
    }),
  });
  assert.ok(
    errors.some((error) => error.includes('plays cost with spend_microusd')),
    errors.join('\n'),
  );
});

test('an operation that says it has no such field has to say why', () => {
  const errors = errorsFor({
    migrations: OPERATION_MIGRATION,
    contract: operationContract({
      operations: { widget_runs: { ...OPERATION_DECLARATION, progress: { none: '' } } },
    }),
  });
  assert.ok(
    errors.some((error) => error.includes('has no progress and does not say why')),
    errors.join('\n'),
  );
});

test('an excluded operation needs a reason and goes when it stops looking like one', () => {
  const errors = errorsFor({
    migrations: OPERATION_MIGRATION,
    contract: operationContract({
      operations: {},
      notOperations: [
        { table: 'widget_runs' },
        { table: 'widget_lists', why: 'a list, not a run' },
      ],
    }),
  });
  assert.ok(
    errors.some((error) =>
      error.includes('widget_runs is excluded from the operations and carries no reason'),
    ),
    errors.join('\n'),
  );
  assert.ok(
    errors.some((error) =>
      error.includes(
        'widget_lists is excluded from the operations and is no longer named like one',
      ),
    ),
    errors.join('\n'),
  );
});

test('a concurrently edited resource with no version fails', () => {
  const errors = errorsFor({
    migrations: OPERATION_MIGRATION,
    contract: operationContract({
      concurrency: { widgets: { table: 'widget_runs', why: 'two people edit it' } },
    }),
  });
  assert.ok(
    errors.some((error) => error.includes('which two people can edit, and carries no version')),
    errors.join('\n'),
  );
});

test('a concurrent resource may declare the column that already plays the version role', () => {
  const errors = errorsFor({
    migrations: {
      ...OPERATION_MIGRATION,
      '0002_widgets.sql':
        'create table if not exists public.widgets (\n  id uuid primary key,\n  user_id uuid,\n  created_at timestamptz,\n  version bigint\n);\n',
    },
    contract: operationContract({
      tables: { widgets: { version: 'version' } },
      concurrency: { widgets: { table: 'widgets', why: 'two people edit it' } },
    }),
  });
  assert.ok(!errors.some((error) => error.includes('carries no version')), errors.join('\n'));
});

test('the row version migration adds the columns the concurrency contract depends on', () => {
  const tables = readTableColumns(REPO_ROOT);
  for (const table of [
    'project_knowledge_files',
    'organization_admin_policies',
    'scheduled_tasks',
    'agent_tools',
  ]) {
    assert.ok(tables.get(table).has('server_version'), table);
  }
  for (const table of [
    'api_keys',
    'device_refresh_tokens',
    'github_installations',
    'media_assets',
    'organization_admin_api_keys',
    'organization_spend_alerts',
    'shared_sessions',
  ]) {
    assert.ok(tables.get(table).has('updated_at'), table);
  }
});
