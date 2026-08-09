/**
 * Tests for check-db-isolation.mjs.
 *
 * A guard that cannot fail is decoration, and this one grew a second pass whose
 * whole job is to fail on a shape nobody has written yet. So the sandbox tests
 * write that shape.
 *
 * Both passes resolve their inputs from `process.cwd()`, so a test drives the
 * REAL script — no patched copy, no second implementation that can drift from
 * the one CI runs — by pointing cwd at a throwaway tree.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const GUARD = join(REPO_ROOT, 'scripts', 'check-db-isolation.mjs');

/** Run the real guard against a throwaway tree of `{ relPath: contents }`. */
function runOnSandbox(files) {
  const sandbox = mkdtempSync(join(tmpdir(), 'crit015-'));
  try {
    for (const [rel, contents] of Object.entries(files)) {
      const abs = join(sandbox, rel);
      mkdirSync(join(abs, '..'), { recursive: true });
      writeFileSync(abs, contents, 'utf8');
    }
    return spawnSync(process.execPath, [GUARD], { cwd: sandbox, encoding: 'utf8' });
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

const NEON = 'apps/web/db/neon';

/** A table nobody has classified: tenant column, no RLS, not in either list. */
const UNDECIDED_TABLE = `create table if not exists public.holiday_plans (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  destination text not null,
  created_at timestamptz not null default now()
);
`;

test('the real guard passes on the repository as it stands', () => {
  const result = spawnSync(process.execPath, [GUARD], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, `guard failed on the real repo:\n${result.stderr}`);
  assert.match(result.stdout, /explicit isolation decision/);
});

test('a new tenant-scoped table with no isolation decision fails the build', () => {
  const result = runOnSandbox({ [`${NEON}/0001_holidays.sql`]: UNDECIDED_TABLE });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}${result.stderr}`);
  assert.match(result.stderr, /holiday_plans/);
  assert.match(result.stderr, /0001_holidays\.sql/);
  assert.match(result.stderr, /no isolation decision/);
});

test('enabling RLS in the migration is an accepted decision', () => {
  const result = runOnSandbox({
    [`${NEON}/0001_holidays.sql`]: `${UNDECIDED_TABLE}\nalter table public.holiday_plans enable row level security;\n`,
  });
  assert.equal(result.status, 0, `expected pass, got:\n${result.stderr}`);
});

test('a table listed in USER_OWNED_TABLES is an accepted decision without RLS', () => {
  // web_conversations is app-enforced in the real gate; no RLS statement here.
  const result = runOnSandbox({
    [`${NEON}/0001_chat.sql`]: `create table if not exists public.web_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null
);
`,
  });
  assert.equal(result.status, 0, `expected pass, got:\n${result.stderr}`);
});

test('a table listed in CROSS_TENANT_TABLES is an accepted decision', () => {
  const result = runOnSandbox({
    [`${NEON}/0001_support.sql`]: `create table if not exists public.support_agent_presence (
  id uuid primary key default gen_random_uuid(),
  agent_user_id text not null
);
`,
  });
  assert.equal(result.status, 0, `expected pass, got:\n${result.stderr}`);
});

test('a table with no tenant column needs no decision', () => {
  const result = runOnSandbox({
    [`${NEON}/0001_global.sql`]: `create table if not exists public.release_channels (
  id uuid primary key default gen_random_uuid(),
  channel text not null
);
`,
  });
  assert.equal(result.status, 0, `expected pass, got:\n${result.stderr}`);
});

test('a dropped table stops demanding a decision', () => {
  const result = runOnSandbox({
    [`${NEON}/0001_holidays.sql`]: UNDECIDED_TABLE,
    [`${NEON}/0002_drop.sql`]: 'drop table if exists public.holiday_plans;\n',
  });
  assert.equal(result.status, 0, `expected pass, got:\n${result.stderr}`);
});

test('a tenant column added by a LATER migration still demands a decision', () => {
  const result = runOnSandbox({
    [`${NEON}/0001_holidays.sql`]: `create table if not exists public.holiday_plans (
  id uuid primary key default gen_random_uuid(),
  destination text not null
);
`,
    [`${NEON}/0002_owner.sql`]:
      'alter table public.holiday_plans add column if not exists user_id text;\n',
  });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}`);
  assert.match(result.stderr, /holiday_plans/);
});

test('`user_code` is a credential, not a tenant column, and demands no decision', () => {
  // Suffix-anchored matching is the difference between classifying the device
  // flow correctly and demanding an owner for a row that has none yet.
  const result = runOnSandbox({
    [`${NEON}/0001_codes.sql`]: `create table if not exists public.pairing_codes (
  id uuid primary key default gen_random_uuid(),
  user_code text not null,
  user_agent text
);
`,
  });
  assert.equal(result.status, 0, `expected pass, got:\n${result.stderr}`);
});

test('an owner_id predicate scopes a statement over a user-owned table', () => {
  const result = runOnSandbox({
    [`${NEON}/0001_shares.sql`]: `create table if not exists public.shared_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null
);
`,
    'apps/web/lib/shares.ts': [
      "import { getNeonDb } from './db';",
      'export async function listShares(ownerId: string) {',
      '  const db = getNeonDb();',
      '  return db.query(`select id from shared_sessions where owner_id = $1`, [ownerId]);',
      '}',
    ].join('\n'),
  });
  assert.equal(result.status, 0, `expected pass, got:\n${result.stderr}`);
});

test('an unscoped read of a user-owned table over the owner connection fails', () => {
  const result = runOnSandbox({
    [`${NEON}/0001_shares.sql`]: `create table if not exists public.shared_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null
);
`,
    'apps/web/lib/shares.ts': [
      "import { getNeonDb } from './db';",
      'export async function listShares() {',
      '  const db = getNeonDb();',
      '  return db.query(`select id from shared_sessions order by created_at desc`);',
      '}',
    ].join('\n'),
  });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}`);
  assert.match(result.stderr, /shared_sessions/);
  assert.match(result.stderr, /no owner constraint/);
});
