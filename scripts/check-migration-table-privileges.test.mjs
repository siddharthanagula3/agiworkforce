import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';

import {
  REGISTRY_PATH,
  REPO_ROOT,
  analyzeMigrations,
  loadMigrations,
  loadRegistry,
  tablePrivilegesOf,
} from './check-migration-table-privileges.mjs';

const GUARD = path.join(REPO_ROOT, 'scripts', 'check-migration-table-privileges.mjs');
const EMPTY_REGISTRY = { schemaVersion: 1, entries: [] };

const BASELINE = {
  fileName: '0037_rls_user_isolation.sql',
  number: 37,
  sql: [
    'GRANT USAGE ON SCHEMA public TO app_rls;',
    'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rls;',
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public',
    '  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rls;',
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public',
    '  GRANT USAGE, SELECT ON SEQUENCES TO app_rls;',
    'GRANT app_rls TO CURRENT_USER;',
  ].join('\n'),
};

function draft(fileName, sql) {
  return { fileName, number: Number(fileName.slice(0, 4)), sql };
}

function analyze(drafts, registry = EMPTY_REGISTRY) {
  return analyzeMigrations({ migrations: [BASELINE, ...drafts], appliedThrough: 391, registry });
}

const GENERATIONS_TABLE = `begin;
create table if not exists public.connector_permission_generations (
  user_id text not null references public.profiles(id) on delete cascade,
  connector_id text not null check (char_length(connector_id) between 1 and 200),
  generation bigint not null default 0 check (generation >= 0),
  primary key (user_id, connector_id)
);
comment on table public.connector_permission_generations is
  'One counter per account and connector''s saved tool permissions.';
alter table public.connector_permission_generations enable row level security;
alter table public.connector_permission_generations force row level security;
`;
const GENERATIONS_POLICY = `
drop policy if exists connector_permission_generations_owner
  on public.connector_permission_generations;
create policy connector_permission_generations_owner
  on public.connector_permission_generations
  for all to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));
commit;
`;

const PRE_FIX_0411 = draft(
  '0411_connector_permission_generations.sql',
  `${GENERATIONS_TABLE}
revoke all on public.connector_permission_generations from public;
grant select, insert, update on public.connector_permission_generations to app_rls;
${GENERATIONS_POLICY}`,
);
const FIXED_0411 = draft(
  '0411_connector_permission_generations.sql',
  `${GENERATIONS_TABLE}
revoke all on public.connector_permission_generations from public, app_rls;
grant select, insert, update on public.connector_permission_generations to app_rls;
${GENERATIONS_POLICY}`,
);

const FAMILIES_TABLE = `-- Shape  : app_rls has no grant on it.
--          revoke all on public.device_refresh_token_families from public, app_rls;
begin;
create table if not exists public.device_refresh_token_families (
  family_id uuid primary key,
  user_id text not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_device_refresh_token_families_user
  on public.device_refresh_token_families (user_id);
`;
const PRE_FIX_0412 = draft(
  '0412_device_refresh_token_families.sql',
  `${FAMILIES_TABLE}
revoke all on public.device_refresh_token_families from public;
comment on table public.device_refresh_token_families is
  'revoke all on public.device_refresh_token_families from app_rls';
commit;
`,
);
const FIXED_0412 = draft(
  '0412_device_refresh_token_families.sql',
  `${FAMILIES_TABLE}
revoke all on public.device_refresh_token_families from public, app_rls;
grant select, insert, update on public.device_refresh_token_families to app_rls;
create or replace function public.device_refresh_token_families_stay_ended()
returns trigger
language plpgsql
as $$
begin
  grant delete on public.device_refresh_token_families to app_rls;
  return new;
end;
$$;
commit;
`,
);
const FAMILIES_ENTRY = {
  table: 'device_refresh_token_families',
  migration: '0412_device_refresh_token_families.sql',
  reason:
    'its sibling device_refresh_tokens carries no row-level security and an admin deprovision ends another member family through app_rls',
};

const CLEANUPS_TABLE = `begin;
create table if not exists public.feedback_screenshot_cleanups (
  storage_key text primary key check (length(storage_key) between 1 and 512),
  user_id text,
  created_at timestamptz not null default now()
);
`;
const CLEANUPS_RLS = `
grant select, insert, delete on public.feedback_screenshot_cleanups to app_rls;
alter table public.feedback_screenshot_cleanups enable row level security;
alter table public.feedback_screenshot_cleanups force row level security;
drop policy if exists feedback_screenshot_cleanups_owner on public.feedback_screenshot_cleanups;
create policy feedback_screenshot_cleanups_owner
  on public.feedback_screenshot_cleanups
  for all to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));
commit;
`;
const PRE_FIX_0418 = draft(
  '0418_feedback_screenshot_cleanups.sql',
  `${CLEANUPS_TABLE}${CLEANUPS_RLS}`,
);
const FIXED_0418 = draft(
  '0418_feedback_screenshot_cleanups.sql',
  `${CLEANUPS_TABLE}
revoke all on public.feedback_screenshot_cleanups from public, app_rls;
${CLEANUPS_RLS}`,
);

const WATERMARK_THE_JUDGED_TABLES_WERE_DRAFTED_ABOVE = 391;

test('the real guard passes on the repository as it stands', () => {
  const result = spawnSync(process.execPath, [GUARD], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, `guard failed on the real repo:\n${result.stderr}`);
});

test('the default privileges are read from the real chain, not assumed', () => {
  const result = analyzeMigrations({
    migrations: loadMigrations(),
    appliedThrough: WATERMARK_THE_JUDGED_TABLES_WERE_DRAFTED_ABOVE,
    registry: loadRegistry(),
  });
  assert.deepEqual(result.defaults, ['select', 'insert', 'update', 'delete']);
  for (const table of [
    'connector_permission_generations',
    'device_refresh_token_families',
    'feedback_screenshot_cleanups',
    'stripe_cogs_import_coverage',
  ]) {
    assert.ok(result.tables.includes(table), `${table} is not judged by the guard`);
  }
});

test('0411 before the fix fails: revoking from public leaves app_rls DELETE', () => {
  const result = analyze([PRE_FIX_0411]);
  assert.equal(result.violations.length, 1, result.violations.join('\n'));
  assert.match(
    result.violations[0],
    /connector_permission_generations and leaves app_rls with DELETE that/,
  );
  assert.deepEqual(analyze([FIXED_0411]).violations, []);
});

test('0412 before the fix fails: app_rls keeps full DML on a table with no row-level security', () => {
  const result = analyze([PRE_FIX_0412]);
  assert.equal(result.violations.length, 2, result.violations.join('\n'));
  assert.match(
    result.violations[0],
    /device_refresh_token_families and leaves app_rls with SELECT, INSERT, UPDATE, DELETE that/,
  );
  assert.match(
    result.violations[1],
    /grants app_rls SELECT, INSERT, UPDATE, DELETE but has no row-level/,
  );
});

test('0412 after the fix still needs its stated reason, because app_rls reaches every row', () => {
  const unregistered = analyze([FIXED_0412]);
  assert.equal(unregistered.violations.length, 1, unregistered.violations.join('\n'));
  assert.match(
    unregistered.violations[0],
    /grants app_rls SELECT, INSERT, UPDATE but has no row-level/,
  );

  const registered = analyze([FIXED_0412], { schemaVersion: 1, entries: [FAMILIES_ENTRY] });
  assert.deepEqual(registered.violations, []);
});

test('0418 before the fix fails: a grant list alone leaves app_rls UPDATE', () => {
  const result = analyze([PRE_FIX_0418]);
  assert.equal(result.violations.length, 1, result.violations.join('\n'));
  assert.match(
    result.violations[0],
    /feedback_screenshot_cleanups and leaves app_rls with UPDATE that/,
  );
  assert.deepEqual(analyze([FIXED_0418]).violations, []);
});

test('a revoke from app_rls in its own statement states the privileges (0405 shape)', () => {
  const result = analyze([
    draft(
      '0405_admin_account_actions.sql',
      [
        'create table if not exists public.admin_account_actions (id uuid primary key);',
        'alter table public.admin_account_actions enable row level security;',
        'revoke all on public.admin_account_actions from public;',
        'revoke all on public.admin_account_actions from app_rls;',
      ].join('\n'),
    ),
  ]);
  assert.deepEqual(result.violations, []);
  assert.deepEqual(result.reachable, []);
});

test('a full grant list names every default privilege and passes rule one', () => {
  const result = analyze([
    draft(
      '0420_widgets.sql',
      [
        'create table public.widgets (id uuid primary key, user_id text);',
        'grant select, insert, update, delete on table public.widgets to app_rls;',
        'alter table public.widgets enable row level security;',
        'create policy widgets_owner on public.widgets for all to app_rls using (true);',
      ].join('\n'),
    ),
  ]);
  assert.deepEqual(result.violations, []);
  assert.deepEqual(result.behindRowSecurity, ['widgets']);
});

test('a table at or below the watermark, or re-declared above it, is not judged', () => {
  const result = analyze([
    draft('0200_widgets.sql', 'create table public.widgets (id uuid primary key);'),
    draft('0400_widgets_again.sql', 'create table if not exists public.widgets (id uuid);'),
  ]);
  assert.deepEqual(result.violations, []);
  assert.deepEqual(result.tables, []);
});

test('a later grant to app_rls on a drafted table without a policy fails rule two', () => {
  const result = analyze([
    draft(
      '0420_widgets.sql',
      'create table public.widgets (id uuid);\nrevoke all on public.widgets from public, app_rls;',
    ),
    draft('0421_widgets_grant.sql', 'grant select on public.widgets to app_rls;'),
  ]);
  assert.equal(result.violations.length, 1, result.violations.join('\n'));
  assert.match(result.violations[0], /public\.widgets grants app_rls SELECT but has no row-level/);
});

test('disabling row-level security or dropping the last policy takes the protection away', () => {
  const base = [
    'create table public.widgets (id uuid, user_id text);',
    'revoke all on public.widgets from public, app_rls;',
    'grant select on public.widgets to app_rls;',
    'alter table public.widgets enable row level security;',
    'create policy widgets_owner on public.widgets using (true);',
  ].join('\n');
  assert.deepEqual(analyze([draft('0420_widgets.sql', base)]).violations, []);
  const disabled = analyze([
    draft('0420_widgets.sql', base),
    draft('0421_widgets_open.sql', 'alter table public.widgets disable row level security;'),
  ]);
  assert.equal(disabled.violations.length, 1, disabled.violations.join('\n'));
  const unpoliced = analyze([
    draft('0420_widgets.sql', base),
    draft('0421_widgets_open.sql', 'drop policy if exists widgets_owner on public.widgets;'),
  ]);
  assert.equal(unpoliced.violations.length, 1, unpoliced.violations.join('\n'));
});

test('a quoted table name fails closed instead of being skipped', () => {
  const result = analyze([draft('0420_widgets.sql', 'create table public."Widgets" (id uuid);')]);
  assert.equal(result.violations.length, 1, result.violations.join('\n'));
  assert.match(result.violations[0], /cannot read the table name/);
});

test('temporary tables and tables in another schema are out of scope', () => {
  const result = analyze([
    draft(
      '0420_scratch.sql',
      'create temporary table scratch (id uuid);\ncreate table audit.events (id uuid);',
    ),
  ]);
  assert.deepEqual(result.violations, []);
  assert.deepEqual(result.tables, []);
});

test('registry entries must be needed, current and explained', () => {
  const stale = analyze([FIXED_0411], {
    schemaVersion: 1,
    entries: [
      {
        ...FAMILIES_ENTRY,
        table: 'connector_permission_generations',
        migration: FIXED_0411.fileName,
      },
    ],
  });
  assert.match(
    stale.violations.join('\n'),
    /connector_permission_generations no longer needs its entry/,
  );

  const unknown = analyze([], { schemaVersion: 1, entries: [FAMILIES_ENTRY] });
  assert.match(unknown.violations.join('\n'), /is not a table created above the applied watermark/);

  const terse = analyze([FIXED_0412], {
    schemaVersion: 1,
    entries: [{ ...FAMILIES_ENTRY, reason: 'internal' }],
  });
  assert.match(terse.violations.join('\n'), new RegExp(`${REGISTRY_PATH}: .* needs a reason`));

  const misfiled = analyze([FIXED_0412], {
    schemaVersion: 1,
    entries: [{ ...FAMILIES_ENTRY, migration: '0412_other.sql' }],
  });
  assert.match(
    misfiled.violations.join('\n'),
    /is created by 0412_device_refresh_token_families\.sql/,
  );
});

test('privilege lists ignore column grants and refuse unknown words', () => {
  assert.deepEqual([...tablePrivilegesOf('select, update (status, note)')], ['select']);
  assert.equal(tablePrivilegesOf('all privileges').size, 7);
  assert.equal(tablePrivilegesOf('usage'), null);
});
