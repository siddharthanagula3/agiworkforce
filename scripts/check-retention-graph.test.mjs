import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import {
  ACCOUNT_ERASURE_PATH,
  MIGRATIONS_DIR,
  ORGANIZATION_ERASURE_PATH,
  REPO_ROOT,
  SUBJECT_COLUMN,
  checkRetentionGraph,
  readDroppedTables,
  readGraph,
} from './check-retention-graph.mjs';

const GUARD = path.join(REPO_ROOT, 'scripts', 'check-retention-graph.mjs');
const EXTRA_MIGRATION = '9998_subject_under_test.sql';

const sandboxes = [];
after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

/** The real schema and the real inventories, so a pass here is a real pass. */
function sandbox({ account = null, organization = null, migration = null } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'retention-graph-'));
  sandboxes.push(dir);
  for (const relative of [ACCOUNT_ERASURE_PATH, ORGANIZATION_ERASURE_PATH]) {
    mkdirSync(path.join(dir, path.dirname(relative)), { recursive: true });
    cpSync(path.join(REPO_ROOT, relative), path.join(dir, relative));
  }
  cpSync(path.join(REPO_ROOT, MIGRATIONS_DIR), path.join(dir, MIGRATIONS_DIR), { recursive: true });

  for (const [relative, edit] of [
    [ACCOUNT_ERASURE_PATH, account],
    [ORGANIZATION_ERASURE_PATH, organization],
  ]) {
    if (edit === null) continue;
    const source = readFileSync(path.join(REPO_ROOT, relative), 'utf8');
    writeFileSync(path.join(dir, relative), edit(source), 'utf8');
  }
  if (migration !== null) {
    writeFileSync(path.join(dir, MIGRATIONS_DIR, EXTRA_MIGRATION), migration, 'utf8');
  }
  return dir;
}

function run(options = {}) {
  return checkRetentionGraph(sandbox(options));
}

function mentions(failures, needle) {
  return failures.some((failure) => failure.includes(needle));
}

test('the real guard passes on the repository as it stands', () => {
  const result = spawnSync(process.execPath, [GUARD], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, `expected a clean repo, got:\n${result.stderr}${result.stdout}`);
});

test('the graph reads a real schema rather than an empty one', () => {
  const graph = readGraph(REPO_ROOT);
  assert.ok(graph.tables > 150, `only ${graph.tables} tables were parsed`);
  assert.ok(graph.named.size > 150, `only ${graph.named.size} tables are named by an inventory`);
  assert.deepEqual(graph.unreached, []);
  assert.deepEqual(graph.problems, []);
});

test('a dropped table is not asked to be reached, and not counted as live', () => {
  const dropped = readDroppedTables(REPO_ROOT);
  assert.ok(dropped.has('teams'), 'the legacy teams drop is not being read');
  assert.ok(dropped.has('team_members'));
  const graph = readGraph(REPO_ROOT);
  assert.ok(!graph.named.has('teams'));
  assert.ok(!graph.unreached.some((entry) => entry.table === 'teams'));
});

test('a new table holding an address that no rule reaches is reported', () => {
  const { failures } = run({
    migration: `create table if not exists public.invite_intake (
  id uuid primary key default gen_random_uuid(),
  invitee_email text not null,
  created_at timestamptz not null default now()
);
`,
  });
  assert.ok(mentions(failures, 'invite_intake'), failures.join('\n'));
  assert.ok(mentions(failures, 'invitee_email'), failures.join('\n'));
});

test('a new table carrying no subject reference needs no rule', () => {
  const { failures } = run({
    migration: `create table if not exists public.model_price_days (
  id uuid primary key default gen_random_uuid(),
  model text not null,
  day date not null
);
`,
  });
  assert.deepEqual(failures, []);
});

test('a child that cascades from a reached parent is reached', () => {
  const { failures } = run({
    migration: `create table if not exists public.conversation_side_notes (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.web_conversations(id) on delete cascade,
  author_user_id text not null
);
`,
  });
  assert.deepEqual(failures, []);
});

test('the same child without the cascade is not reached', () => {
  const { failures } = run({
    migration: `create table if not exists public.conversation_side_notes (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.web_conversations(id) on delete set null,
  author_user_id text not null
);
`,
  });
  assert.ok(mentions(failures, 'conversation_side_notes'), failures.join('\n'));
});

test('dropping a table from the account inventory reopens the hole it filled', () => {
  const { failures } = run({
    account: (source) =>
      source.replace("  { table: 'device_installations', column: 'account_id' },\n", ''),
  });
  assert.ok(mentions(failures, 'device_installations'), failures.join('\n'));
  assert.ok(mentions(failures, 'account_id'), failures.join('\n'));
});

test('an address-matched sweep counts as reaching its table', () => {
  const unretained = (source) => source.replace(/  cloud_waitlist:\n    '[^']*',\n/, '');
  const unreached = run({ account: unretained });
  assert.ok(mentions(unreached.failures, 'cloud_waitlist'), unreached.failures.join('\n'));

  const swept = run({
    account: (source) =>
      unretained(source).replace(
        "    table: 'beta_applications',\n    column: 'email',",
        "    table: 'cloud_waitlist',\n    column: 'email',",
      ),
  });
  assert.ok(!mentions(swept.failures, 'cloud_waitlist'), swept.failures.join('\n'));
});

test('a retained table has to say why, not merely be listed', () => {
  const { failures } = run({
    account: (source) =>
      source.replace(/  copyright_notices:\n    '[^']*',/, "  copyright_notices:\n    'legacy',"),
  });
  assert.ok(
    mentions(failures, 'copyright_notices is retained without saying why'),
    failures.join('\n'),
  );
});

test('a rule over a store the schema no longer has is reported', () => {
  const { failures } = run({
    account: (source) =>
      source.replace(
        "  { table: 'search_history', column: 'user_id' },",
        "  { table: 'search_history_v2', column: 'user_id' },",
      ),
  });
  assert.ok(mentions(failures, 'search_history_v2'), failures.join('\n'));
});

test('a rule naming a column the table does not have is reported', () => {
  const { failures } = run({
    account: (source) =>
      source.replace(
        "  { table: 'search_history', column: 'user_id' },",
        "  { table: 'search_history', column: 'owner_user_id' },",
      ),
  });
  assert.ok(mentions(failures, 'owner_user_id'), failures.join('\n'));
});

test('renaming an inventory fails rather than reporting an empty graph', () => {
  const { failures } = run({
    account: (source) => source.replace('export const USER_SCOPED_TABLES', 'export const ERASED'),
  });
  assert.ok(mentions(failures, 'USER_SCOPED_TABLES'), failures.join('\n'));
});

test('emptying an inventory fails rather than passing on a short list', () => {
  const { failures } = run({
    organization: (source) =>
      source.replace(
        /export const ORGANIZATION_SCOPED_TABLES([\s\S]*?)\n\];/,
        "export const ORGANIZATION_SCOPED_TABLES: ReadonlyArray<{ table: string; column: string }> = [\n  { table: 'organization_members', column: 'organization_id' },\n];",
      ),
  });
  assert.ok(mentions(failures, 'ORGANIZATION_SCOPED_TABLES'), failures.join('\n'));
});

test('the subject-column test names people and not user agents', () => {
  for (const column of [
    'user_id',
    'owner_id',
    'account_id',
    'added_by_user_id',
    'reporter_email',
  ]) {
    assert.ok(SUBJECT_COLUMN.test(column), `${column} should name a subject`);
  }
  for (const column of ['user_agent', 'repo_owner', 'email_template', 'owner_kind']) {
    assert.ok(!SUBJECT_COLUMN.test(column), `${column} should not name a subject`);
  }
});
