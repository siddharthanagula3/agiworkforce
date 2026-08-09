/**
 * Tests for check-db-isolation.mjs.
 *
 * A guard that cannot fail is decoration, and this one grew two passes whose
 * whole job is to fail on a shape nobody has written yet. So the sandbox tests
 * write that shape.
 *
 * Every pass resolves its inputs from `process.cwd()`, so a test drives the
 * REAL script — no patched copy, no second implementation that can drift from
 * the one CI runs — by pointing cwd at a throwaway tree.
 *
 * Several tests below are regressions for holes an adversarial review opened by
 * hand: a scope token supplied by an unrelated join, an interpolated SELECT list
 * standing in for a predicate, a file+table exemption retiring the owner-scoped
 * queries it claimed to leave policed, and a table recorded as "app-enforced"
 * that no pass could actually read. Each one was green before the fix.
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

// ---------------------------------------------------------------------------
// Pass 2 — every live tenant-scoped table needs an isolation decision.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Pass 1 — statements.
// ---------------------------------------------------------------------------

const SHARES_MIGRATION = `create table if not exists public.shared_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null
);
`;

test('an owner_id predicate scopes a statement over a user-owned table', () => {
  const result = runOnSandbox({
    [`${NEON}/0001_shares.sql`]: SHARES_MIGRATION,
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
    [`${NEON}/0001_shares.sql`]: SHARES_MIGRATION,
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

test('SQL written in a single-quoted string is scanned, not just backticks', () => {
  // app/api/shared/route.ts writes both of its statements this way, so a
  // backtick-only extractor read ZERO statements over shared_conversations
  // while the table was recorded as app-enforced.
  const result = runOnSandbox({
    'apps/web/lib/shares.ts': [
      "import { getNeonDb } from './db';",
      'export async function listShares() {',
      '  const db = getNeonDb();',
      "  return db.query('select id from shared_sessions order by created_at desc');",
      '}',
    ].join('\n'),
  });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}`);
  assert.match(result.stderr, /shared_sessions/);
});

test('SQL written in a double-quoted string is scanned too', () => {
  const result = runOnSandbox({
    'apps/web/lib/shares.ts': [
      "import { getNeonDb } from './db';",
      'export async function listShares() {',
      '  const db = getNeonDb();',
      '  return db.query("select id from shared_sessions order by created_at desc");',
      '}',
    ].join('\n'),
  });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}`);
  assert.match(result.stderr, /shared_sessions/);
});

test('a service that receives its db handle as a parameter is scanned', () => {
  // cloud-code-agent-service.ts takes a DatabaseAdapter and never names
  // getNeonDb(), so the old file filter skipped five writes to an RLS-less
  // user-owned table without reading them.
  const result = runOnSandbox({
    'apps/web/lib/services/turns.ts': [
      "import type { DatabaseAdapter } from '@agiworkforce/data-layer';",
      'export async function failTurn(db: DatabaseAdapter, id: string) {',
      "  await db.query(`update shared_sessions set state = 'failed' where id = $1`, [id]);",
      '}',
    ].join('\n'),
  });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}`);
  assert.match(result.stderr, /shared_sessions/);
});

test('a scope token inside a LONGER identifier does not scope a statement', () => {
  // `p.agent_user_id = s.agent_user_id` in a display-name subselect satisfied
  // `user_id` as a substring, so deleting the real owner predicate from an
  // owner-scoped read left the gate green.
  const result = runOnSandbox({
    'apps/web/lib/shares.ts': [
      "import { getNeonDb } from './db';",
      'export async function listShares(agentId: string) {',
      '  const db = getNeonDb();',
      '  return db.query(`select id from shared_sessions where agent_user_id = $1`, [agentId]);',
      '}',
    ].join('\n'),
  });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}`);
  assert.match(result.stderr, /shared_sessions/);
});

test('an interpolated WHERE clause still scopes a statement', () => {
  const result = runOnSandbox({
    'apps/web/lib/shares.ts': [
      "import { getNeonDb } from './db';",
      "const ownerClause = 'owner_id = $1';",
      'export async function listShares(ownerId: string) {',
      '  const db = getNeonDb();',
      '  return db.query(`select id from shared_sessions where ${ownerClause}`, [ownerId]);',
      '}',
    ].join('\n'),
  });
  assert.equal(result.status, 0, `expected pass, got:\n${result.stderr}`);
});

test('an interpolated SELECT list is not a predicate', () => {
  // This is the shape that hid the handoff regression: `select ${COLUMNS} ...`
  // where COLUMNS merely NAMES the owner column.
  const result = runOnSandbox({
    'apps/web/lib/shares.ts': [
      "import { getNeonDb } from './db';",
      "const COLUMNS = 'id, owner_id, created_at';",
      'export async function getShare(id: string) {',
      '  const db = getNeonDb();',
      '  return db.query(`select ${COLUMNS} from shared_sessions where id = $1`, [id]);',
      '}',
    ].join('\n'),
  });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}`);
  assert.match(result.stderr, /shared_sessions/);
});

test("an INSERT's interpolated column list still scopes the statement", () => {
  // api/projects/route.ts builds its insert this way and is correct: the
  // interpolated column list is how the row gets an owner.
  const result = runOnSandbox({
    'apps/web/lib/shares.ts': [
      "import { getNeonDb } from './db';",
      'export async function createShare(values: string[]) {',
      "  const cols = ['id', 'owner_id'];",
      '  const db = getNeonDb();',
      "  return db.query(`insert into shared_sessions (${cols.join(', ')}) values ($1, $2)`, values);",
      '}',
    ].join('\n'),
  });
  assert.equal(result.status, 0, `expected pass, got:\n${result.stderr}`);
});

// ---------------------------------------------------------------------------
// Function-scoped allowlist entries.
// ---------------------------------------------------------------------------

const HANDOFF_STORE = 'apps/web/lib/support/handoff/store.ts';

test('a function-scoped exemption covers the functions it names', () => {
  const result = runOnSandbox({
    [HANDOFF_STORE]: [
      "import { getNeonDb } from '@/lib/server/neon-db';",
      'export async function purgeOldHandoffSessions(days: number) {',
      '  const db = getNeonDb();',
      '  return db.execute(`delete from public.support_handoff_sessions where created_at < now()`, [days]);',
      '}',
    ].join('\n'),
  });
  assert.equal(result.status, 0, `expected pass, got:\n${result.stderr}`);
});

test('a function-scoped exemption leaves the SAME table policed elsewhere in the file', () => {
  // The whole point of narrowing. As a bare file+table entry this passed, and
  // deleting `and owner_session_key = $2` from the real getSessionForOwner was
  // invisible to the gate whose own comment promised it stayed policed.
  const result = runOnSandbox({
    [HANDOFF_STORE]: [
      "import { getNeonDb } from '@/lib/server/neon-db';",
      'export async function purgeOldHandoffSessions(days: number) {',
      '  const db = getNeonDb();',
      '  return db.execute(`delete from public.support_handoff_sessions where created_at < now()`, [days]);',
      '}',
      'export async function getSessionForOwner(id: string) {',
      '  const db = getNeonDb();',
      '  return db.query(`select id from public.support_handoff_sessions where id = $1`, [id]);',
      '}',
    ].join('\n'),
  });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}`);
  assert.match(result.stderr, /support_handoff_sessions/);
});

test('a bare call at the top of a body does not shadow the enclosing function', () => {
  // `validateCloudCodeSessionId(sessionId);` looks exactly like a method
  // declaration to a textual scan, and it stole the enclosing name from every
  // statement below it — silently voiding the exemption.
  const result = runOnSandbox({
    [HANDOFF_STORE]: [
      "import { getNeonDb } from '@/lib/server/neon-db';",
      'function assertDays(days: number) {',
      '  if (days < 0) throw new Error("bad");',
      '}',
      'export async function purgeOldHandoffSessions(days: number) {',
      '  assertDays(days);',
      '  const db = getNeonDb();',
      '  return db.execute(`delete from public.support_handoff_sessions where created_at < now()`, [days]);',
      '}',
    ].join('\n'),
  });
  assert.equal(result.status, 0, `expected pass, got:\n${result.stderr}`);
});

// ---------------------------------------------------------------------------
// Pass 3 — an "app-enforced" table that nothing actually polices.
// ---------------------------------------------------------------------------

const REFERRALS_MIGRATION = `create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  user_id text not null
);
`;

test('an app-enforced table with zero policed statements fails as a hollow decision', () => {
  const result = runOnSandbox({
    [`${NEON}/0001_shares.sql`]: SHARES_MIGRATION,
    'apps/web/lib/shares.ts': [
      "import { getNeonDb } from './db';",
      'export async function countRows() {',
      '  const db = getNeonDb();',
      '  return db.query(`select count(*) from release_channels`);',
      '}',
    ].join('\n'),
  });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}`);
  assert.match(result.stderr, /shared_sessions/);
  assert.match(result.stderr, /policed ZERO/);
});

test('a declared zero-coverage table is accepted', () => {
  // `referrals` is in UNPOLICED_APP_ENFORCED_TABLES with the reason "no query
  // site at all", so a live table nothing touches is fine.
  const result = runOnSandbox({
    [`${NEON}/0001_referrals.sql`]: REFERRALS_MIGRATION,
    'apps/web/lib/shares.ts': [
      "import { getNeonDb } from './db';",
      'export async function countRows() {',
      '  const db = getNeonDb();',
      '  return db.query(`select count(*) from release_channels`);',
      '}',
    ].join('\n'),
  });
  assert.equal(result.status, 0, `expected pass, got:\n${result.stderr}`);
});

test('a zero-coverage reason that has stopped being true fails as stale', () => {
  const result = runOnSandbox({
    [`${NEON}/0001_referrals.sql`]: REFERRALS_MIGRATION,
    'apps/web/lib/referrals.ts': [
      "import { getNeonDb } from './db';",
      'export async function listReferrals(userId: string) {',
      '  const db = getNeonDb();',
      '  return db.query(`select id from referrals where user_id = $1`, [userId]);',
      '}',
    ].join('\n'),
  });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}`);
  assert.match(result.stderr, /referrals/);
  assert.match(result.stderr, /stopped being true/);
});

test('pass 3 stays quiet when there is no TypeScript surface to scan at all', () => {
  // Migration-only sandboxes (most of the pass-2 tests above) must not have to
  // declare the production table list.
  const result = runOnSandbox({ [`${NEON}/0001_shares.sql`]: SHARES_MIGRATION });
  assert.equal(result.status, 0, `expected pass, got:\n${result.stderr}`);
});
