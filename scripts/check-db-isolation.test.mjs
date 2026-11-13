import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const GUARD = join(REPO_ROOT, 'scripts', 'check-db-isolation.mjs');

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

const ZERO_COVERAGE_MIGRATION = `create table if not exists public.account_sessions (
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
  const result = runOnSandbox({
    [`${NEON}/0001_account_sessions.sql`]: ZERO_COVERAGE_MIGRATION,
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
    [`${NEON}/0001_account_sessions.sql`]: ZERO_COVERAGE_MIGRATION,
    'apps/web/lib/account-sessions.ts': [
      "import { getNeonDb } from './db';",
      'export async function listAccountSessions(userId: string) {',
      '  const db = getNeonDb();',
      '  return db.query(`select id from account_sessions where user_id = $1`, [userId]);',
      '}',
    ].join('\n'),
  });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}`);
  assert.match(result.stderr, /account_sessions/);
  assert.match(result.stderr, /stopped being true/);
});

test('pass 3 stays quiet when there is no TypeScript surface to scan at all', () => {
  const result = runOnSandbox({ [`${NEON}/0001_shares.sql`]: SHARES_MIGRATION });
  assert.equal(result.status, 0, `expected pass, got:\n${result.stderr}`);
});

test('a comment mentioning a scope token cannot satisfy the owner check', () => {
  // Regression: resolvesToScope scanned 600 raw characters after a declaration
  // for tokens like user_id, comments included, so prose near a statement was
  // enough to silence an RLS-bypass finding. waitlistService.ts passed for
  // exactly that reason until an unrelated edit moved the comment out of range.
  const result = runOnSandbox({
    [`${NEON}/0001_shares.sql`]: SHARES_MIGRATION,
    'apps/web/lib/shares.ts': [
      "import { getNeonDb } from './db';",
      '// Historical note: the retired RPC took (p_user_id text, p_code text)',
      '// and resolved the caller from user_id before the adapter landed.',
      'export async function listShares() {',
      '  const db = getNeonDb();',
      '  return db.query(`select id from shared_sessions order by created_at desc`);',
      '}',
    ].join('\n'),
  });

  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}${result.stderr}`);
  assert.match(result.stderr, /shared_sessions/);
  assert.match(result.stderr, /no owner constraint/);
});

test('a real owner constraint in code still satisfies the owner check', () => {
  const result = runOnSandbox({
    [`${NEON}/0001_shares.sql`]: SHARES_MIGRATION,
    'apps/web/lib/shares.ts': [
      "import { getNeonDb } from './db';",
      'export async function listShares(userId) {',
      '  const db = getNeonDb();',
      '  return db.query(`select id from shared_sessions where user_id = $1`, [userId]);',
      '}',
    ].join('\n'),
  });

  assert.equal(result.status, 0, `expected pass, got:\n${result.stdout}${result.stderr}`);
});

const TRAVEL_BOOKINGS_RLS_MIGRATION = `create table if not exists public.travel_bookings (
  id uuid primary key default gen_random_uuid(),
  user_id text not null
);
alter table public.travel_bookings enable row level security;
alter table public.travel_bookings force row level security;
`;

test('a table that gains RLS is scanned by pass 1 even though it is not in USER_OWNED_TABLES', () => {
  const result = runOnSandbox({
    [`${NEON}/0001_bookings.sql`]: TRAVEL_BOOKINGS_RLS_MIGRATION,
    'apps/web/lib/bookings.ts': [
      "import { getNeonDb } from './db';",
      'export async function listBookings() {',
      '  const db = getNeonDb();',
      '  return db.query(`select id from travel_bookings order by created_at desc`);',
      '}',
    ].join('\n'),
  });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}`);
  assert.match(result.stderr, /travel_bookings/);
  assert.match(result.stderr, /no owner constraint/);
});

test('an RLS-derived table with a real owner predicate passes pass 1', () => {
  const result = runOnSandbox({
    [`${NEON}/0001_bookings.sql`]: TRAVEL_BOOKINGS_RLS_MIGRATION,
    'apps/web/lib/bookings.ts': [
      "import { getNeonDb } from './db';",
      'export async function listBookings(userId) {',
      '  const db = getNeonDb();',
      '  return db.query(`select id from travel_bookings where user_id = $1`, [userId]);',
      '}',
    ].join('\n'),
  });
  assert.equal(result.status, 0, `expected pass, got:\n${result.stderr}`);
});

test('pass 1 now walks apps/web/features, not just apps/web/app/api and apps/web/lib', () => {
  const result = runOnSandbox({
    [`${NEON}/0001_shares.sql`]: SHARES_MIGRATION,
    'apps/web/features/sharing/server/list-shares.ts': [
      "import { getNeonDb } from '@/lib/server/neon-db';",
      'export async function listShares() {',
      '  const db = getNeonDb();',
      '  return db.query(`select id from shared_sessions order by created_at desc`);',
      '}',
    ].join('\n'),
  });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}`);
  assert.match(result.stderr, /shared_sessions/);
  assert.match(result.stderr, /features\/sharing\/server\/list-shares\.ts/);
});

test('pass 1 now walks every page under apps/web/app, not only apps/web/app/api', () => {
  const result = runOnSandbox({
    [`${NEON}/0001_shares.sql`]: SHARES_MIGRATION,
    'apps/web/app/workspace/layout.tsx': [
      "import { getNeonDb } from '@/lib/server/neon-db';",
      'export default async function WorkspaceLayout() {',
      '  const db = getNeonDb();',
      '  return db.query(`select id from shared_sessions order by created_at desc`);',
      '}',
    ].join('\n'),
  });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}`);
  assert.match(result.stderr, /shared_sessions/);
  assert.match(result.stderr, /app\/workspace\/layout\.tsx/);
});

const PROFILES_RLS_MIGRATION = `create table if not exists public.profiles (
  id text primary key,
  email text
);
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
`;

test('a bare id predicate scopes a statement over profiles, which has no user_id column', () => {
  const result = runOnSandbox({
    [`${NEON}/0001_profiles.sql`]: PROFILES_RLS_MIGRATION,
    'apps/web/lib/profile.ts': [
      "import { getNeonDb } from './db';",
      'export async function getProfile(userId) {',
      '  const db = getNeonDb();',
      '  return db.query(`select id, email from profiles where id = $1`, [userId]);',
      '}',
    ].join('\n'),
  });
  assert.equal(result.status, 0, `expected pass, got:\n${result.stderr}`);
});

test('an email lookup on profiles does not satisfy the self-id exemption', () => {
  const result = runOnSandbox({
    [`${NEON}/0001_profiles.sql`]: PROFILES_RLS_MIGRATION,
    'apps/web/lib/profile.ts': [
      "import { getNeonDb } from './db';",
      'export async function findProfileByEmail(email) {',
      '  const db = getNeonDb();',
      '  return db.query(`select id, email from profiles where lower(email) = lower($1)`, [email]);',
      '}',
    ].join('\n'),
  });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}`);
  assert.match(result.stderr, /profiles/);
  assert.match(result.stderr, /no owner constraint/);
});

test('a bare id predicate does not exempt a statement that also touches a non-self-id table', () => {
  const result = runOnSandbox({
    [`${NEON}/0001_profiles.sql`]: PROFILES_RLS_MIGRATION,
    [`${NEON}/0002_shares.sql`]: SHARES_MIGRATION,
    'apps/web/lib/mixed.ts': [
      "import { getNeonDb } from './db';",
      'export async function listMixed() {',
      '  const db = getNeonDb();',
      '  return db.query(',
      '    `select p.id from profiles p join shared_sessions s on s.id = p.id where p.id = s.id`,',
      '  );',
      '}',
    ].join('\n'),
  });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}`);
  assert.match(result.stderr, /shared_sessions/);
});

const CONVERSATIONS_MIGRATION = `create table if not exists public.web_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  organization_id uuid,
  title text
);

alter table public.web_conversations enable row level security;
`;

test('a workspace-scoped read carrying only user_id fails: it reads Personal and every organization', () => {
  const result = runOnSandbox({
    [`${NEON}/0001_conversations.sql`]: CONVERSATIONS_MIGRATION,
    'apps/web/lib/chats.ts': [
      "import { getNeonDb } from './db';",
      'export async function listChats(userId: string) {',
      '  const db = getNeonDb();',
      '  return db.query(`select id from web_conversations where user_id = $1`, [userId]);',
      '}',
    ].join('\n'),
  });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}`);
  assert.match(result.stderr, /workspace scope ratchet/);
  assert.match(result.stderr, /web_conversations/);
});

for (const { name, declarations, query, parameters = 'userId: string', status } of [
  {
    name: 'a nearby scoped declaration cannot lend scope to an unrelated literal',
    declarations: "const workspaceClause = 'true'; const otherClause = 'organization_id = $2';",
    query: '`select id from web_conversations where user_id = $1 and ${workspaceClause}`',
    status: 1,
  },
  {
    name: 'SQL comments in a literal cannot establish workspace scope',
    declarations: "const workspaceClause = 'true -- organization_id = $2';",
    query: '`select id from web_conversations where user_id = $1 and ${workspaceClause}`',
    status: 1,
  },
  {
    name: 'the real shadowing parameter wins over a scoped outer constant',
    declarations: "const workspaceClause = 'organization_id = $2';",
    parameters: 'userId: string, workspaceClause: string',
    query: '`select id from web_conversations where user_id = $1 and ${workspaceClause}`',
    status: 1,
  },
  {
    name: 'a mutable SQL binding never grants workspace scope',
    declarations: "let workspaceClause = 'organization_id = $2'; workspaceClause = 'true';",
    query: '`select id from web_conversations where user_id = $1 and ${workspaceClause}`',
    status: 1,
  },
  {
    name: 'a literal in a SELECT list is still not a workspace predicate',
    declarations: "const workspaceClause = 'organization_id = $2';",
    query: '`select ${workspaceClause} from web_conversations where user_id = $1`',
    status: 1,
  },
  {
    name: 'a quoted SQL value is still data rather than a workspace predicate',
    declarations: "const workspaceClause = 'organization_id = $2';",
    query:
      "`select id from web_conversations where user_id = $1 and id::text = '${workspaceClause}'`",
    status: 1,
  },
  {
    name: 'a tagged SQL expression is opaque to literal scope expansion',
    declarations: "const workspaceClause = 'organization_id = $2';",
    query: 'sql`select id from web_conversations where user_id = $1 and ${workspaceClause}`',
    status: 1,
  },
  {
    name: 'multiple statements in a literal never grant workspace scope',
    declarations:
      "const workspaceClause = 'organization_id = $2; select id from web_conversations';",
    query: '`select id from web_conversations where user_id = $1 and ${workspaceClause}`',
    status: 1,
  },
]) {
  test(name, () => {
    const result = runOnSandbox({
      [`${NEON}/0001_conversations.sql`]: CONVERSATIONS_MIGRATION,
      'apps/web/lib/chats.ts': [
        "import { getNeonDb } from './db';",
        declarations,
        `export async function listChats(${parameters}) {`,
        '  const db = getNeonDb();',
        `  return db.query(${query}, [userId]);`,
        '}',
      ].join('\n'),
    });
    assert.equal(result.status, status, result.stderr || result.stdout);
    if (status === 1) assert.match(result.stderr, /workspace scope ratchet/);
  });
}

test('adding the organization_id predicate satisfies the workspace rule', () => {
  const result = runOnSandbox({
    [`${NEON}/0001_conversations.sql`]: CONVERSATIONS_MIGRATION,
    'apps/web/lib/chats.ts': [
      "import { getNeonDb } from './db';",
      'export async function listChats(userId: string, organizationId: string | null) {',
      '  const db = getNeonDb();',
      '  return db.query(',
      '    `select id from web_conversations where user_id = $1 and organization_id is not distinct from $2`,',
      '    [userId, organizationId],',
      '  );',
      '}',
    ].join('\n'),
  });
  assert.equal(result.status, 0, `expected pass, got:\n${result.stderr}`);
});

test('the workspace memory predicate helper satisfies the workspace rule through its interpolation', () => {
  const result = runOnSandbox({
    [`${NEON}/0001_conversations.sql`]: CONVERSATIONS_MIGRATION,
    'apps/web/lib/chats.ts': [
      "import type { DatabaseAdapter } from '@agiworkforce/data-layer';",
      "import { workspaceMemoryPredicate } from '@/lib/services/managed-memory-context-service';",
      'export async function listChats(db: DatabaseAdapter, userId: string, organizationId: string | null) {',
      '  return db.query(',
      '    `select id from web_conversations where user_id = $1 and ${workspaceMemoryPredicate(2)}`,',
      '    [userId, organizationId],',
      '  );',
      '}',
    ].join('\n'),
  });
  assert.equal(result.status, 0, `expected pass, got:\n${result.stderr}`);
});

test('workspaceMemoryPredicate still renders the organization predicate the guard credits it with', () => {
  const source = readFileSync(
    join(REPO_ROOT, 'apps/web/lib/services/managed-memory-context-service.ts'),
    'utf8',
  );
  const body = /export function workspaceMemoryPredicate\([^)]*\)[^{]*\{([\s\S]*?)\n\}/.exec(
    source,
  );
  assert.ok(body, 'workspaceMemoryPredicate is gone; drop it from WORKSPACE_PREDICATE_HELPERS');
  assert.match(body[1], /organization_id is not distinct from \$\$\{paramIndex\}::uuid/);
});

function projectScopeSandbox(constantName, declaration) {
  return runOnSandbox({
    [`${NEON}/0001_projects.sql`]: [
      'create table if not exists public.user_projects (',
      '  id uuid primary key,',
      '  user_id text not null,',
      '  organization_id uuid',
      ');',
    ].join('\n'),
    'apps/web/lib/projects.ts': [
      "import type { DatabaseAdapter } from '@agiworkforce/data-layer';",
      declaration,
      'export async function readProject(db: DatabaseAdapter, id: string, userId: string) {',
      '  return db.query(',
      `    \`select p.id from user_projects p where p.user_id = $2 and \${${constantName}} limit 1\`,`,
      '    [id, userId],',
      '  );',
      '}',
    ].join('\n'),
  });
}

const LOCAL_PROJECT_SCOPE = (name) => `export const ${name} = \`p.id = $1 and p.user_id = $2\`;`;

test('the readable project scope satisfies the workspace rule through its interpolation', () => {
  const credited = projectScopeSandbox(
    'READABLE_PROJECT_SCOPE_SQL',
    "import { READABLE_PROJECT_SCOPE_SQL } from '@/lib/server/project-read-access';",
  );
  assert.equal(credited.status, 0, `expected pass, got:\n${credited.stderr}`);

  const other = projectScopeSandbox('OWNED_PROJECT_SQL', LOCAL_PROJECT_SCOPE('OWNED_PROJECT_SQL'));
  assert.equal(other.status, 1, 'an uncredited interpolation must not satisfy the workspace rule');
  assert.match(other.stderr, /workspace scope ratchet/);
});

test('a local constant that borrows the readable project scope name gets no credit', () => {
  const local = projectScopeSandbox(
    'READABLE_PROJECT_SCOPE_SQL',
    LOCAL_PROJECT_SCOPE('READABLE_PROJECT_SCOPE_SQL'),
  );
  assert.equal(local.status, 1, 'a same-named local constant must not satisfy the workspace rule');
  assert.match(local.stderr, /workspace scope ratchet/);

  const elsewhere = projectScopeSandbox(
    'READABLE_PROJECT_SCOPE_SQL',
    "import { READABLE_PROJECT_SCOPE_SQL } from './my-project-scope';",
  );
  assert.equal(elsewhere.status, 1, 'an import from another module must not satisfy the rule');
  assert.match(elsewhere.stderr, /workspace scope ratchet/);
});

test('a local workspaceMemoryPredicate gets no credit', () => {
  const result = runOnSandbox({
    [`${NEON}/0001_conversations.sql`]: CONVERSATIONS_MIGRATION,
    'apps/web/lib/chats.ts': [
      "import type { DatabaseAdapter } from '@agiworkforce/data-layer';",
      "import { workspaceMemoryPredicate } from './memory';",
      'export async function listChats(db: DatabaseAdapter, userId: string, organizationId: string | null) {',
      '  return db.query(',
      '    `select id from web_conversations where user_id = $1 and ${workspaceMemoryPredicate(2)}`,',
      '    [userId, organizationId],',
      '  );',
      '}',
    ].join('\n'),
  });
  assert.equal(result.status, 1, 'an import from another module must not satisfy the rule');
  assert.match(result.stderr, /workspace scope ratchet/);
});

test('READABLE_PROJECT_SCOPE_SQL still binds every branch to the admitted workspace', () => {
  const source = readFileSync(
    join(REPO_ROOT, 'apps/web/lib/server/project-read-access.ts'),
    'utf8',
  );
  const body = /export const READABLE_PROJECT_SCOPE_SQL = `([\s\S]*?)`;/.exec(source);
  assert.ok(body, 'READABLE_PROJECT_SCOPE_SQL is gone; drop it from WORKSPACE_PREDICATE_HELPERS');
  assert.match(body[1], /p\.user_id = \$2 and p\.organization_id is not distinct from \$3::uuid/);
  assert.match(body[1], /\$3::uuid is not null/);
  assert.match(body[1], /s\.organization_id = \$3::uuid/);
});

test('a cron sweep is exempt from the workspace rule, a settings route is not', () => {
  const exempt = runOnSandbox({
    [`${NEON}/0001_conversations.sql`]: CONVERSATIONS_MIGRATION,
    'apps/web/app/api/cron/purge/route.ts': [
      "import { getNeonDb } from '@/lib/db';",
      'export async function GET() {',
      '  const db = getNeonDb();',
      '  return db.query(`select id from web_conversations where user_id = $1`, ["u"]);',
      '}',
    ].join('\n'),
  });
  assert.equal(exempt.status, 0, `expected pass, got:\n${exempt.stderr}`);

  const policed = runOnSandbox({
    [`${NEON}/0001_conversations.sql`]: CONVERSATIONS_MIGRATION,
    'apps/web/app/api/settings/chats/route.ts': [
      "import { getNeonDb } from '@/lib/db';",
      'export async function GET() {',
      '  const db = getNeonDb();',
      '  return db.query(`select id from web_conversations where user_id = $1`, ["u"]);',
      '}',
    ].join('\n'),
  });
  assert.equal(policed.status, 1, `expected failure, got:\n${policed.stdout}`);
});

test('a baselined file that no longer leaks must lower its baseline entry', () => {
  const result = runOnSandbox({
    [`${NEON}/0001_conversations.sql`]: CONVERSATIONS_MIGRATION,
    'apps/web/lib/triggers/trigger-service.ts': [
      "import { getNeonDb } from '@/lib/db';",
      'export async function listTriggers(userId: string, organizationId: string | null) {',
      '  const db = getNeonDb();',
      '  return db.query(',
      '    `select id from web_conversations where user_id = $1 and organization_id is not distinct from $2`,',
      '    [userId, organizationId],',
      '  );',
      '}',
    ].join('\n'),
  });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}`);
  assert.match(result.stderr, /Lower the\n?\s*WORKSPACE_SCOPE_BASELINE entry/);
});

test('a baselined file may not grow past its allowance', () => {
  const result = runOnSandbox({
    [`${NEON}/0001_conversations.sql`]: CONVERSATIONS_MIGRATION,
    'apps/web/lib/triggers/trigger-service.ts': [
      "import { getNeonDb } from '@/lib/db';",
      'export async function listTriggers(userId: string) {',
      '  const db = getNeonDb();',
      '  await db.query(`select id from web_conversations where user_id = $1`, [userId]);',
      '  return db.query(`select id from user_memories where user_id = $1`, [userId]);',
      '}',
    ].join('\n'),
  });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}`);
  assert.match(result.stderr, /baseline allows 1/);
});
