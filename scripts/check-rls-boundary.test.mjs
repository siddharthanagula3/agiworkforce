import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const GUARD = join(REPO_ROOT, 'scripts', 'check-rls-boundary.mjs');
const ALLOWLIST_PATH = 'scripts/config/rls-boundary-allowlist.json';

function runOnSandbox(files) {
  const sandbox = mkdtempSync(join(tmpdir(), 'rls-boundary-'));
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

function allowlist(entries) {
  return JSON.stringify({ schemaVersion: 1, entries });
}

const OFFENDING_ROUTE = [
  "import { getNeonDb } from '@/lib/server/neon-db';",
  'export async function listShares() {',
  '  const db = getNeonDb();',
  '  return db.query(`select id from shared_sessions order by created_at desc`);',
  '}',
].join('\n');

test('the real guard passes on the repository as it stands', () => {
  const result = spawnSync(process.execPath, [GUARD], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, `guard failed on the real repo:\n${result.stderr}`);
  assert.match(result.stdout, /all allowlisted/);
});

test('an offender not allowlisted fails', () => {
  const result = runOnSandbox({ 'apps/web/lib/shares.ts': OFFENDING_ROUTE });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}${result.stderr}`);
  assert.match(result.stderr, /apps\/web\/lib\/shares\.ts/);
  assert.match(result.stderr, /shared_sessions/);
  assert.match(result.stderr, /no entry/);
});

test('an allowlisted offender passes', () => {
  const result = runOnSandbox({
    'apps/web/lib/shares.ts': OFFENDING_ROUTE,
    [ALLOWLIST_PATH]: allowlist([
      { path: 'apps/web/lib/shares.ts', reason: 'pending scoped migration' },
    ]),
  });
  assert.equal(result.status, 0, `expected pass, got:\n${result.stderr}`);
  assert.match(result.stdout, /all allowlisted/);
});

test('a file using getUserScopedDb passes', () => {
  const result = runOnSandbox({
    'apps/web/app/api/shares/route.ts': [
      "import { getUserScopedDb } from '@/lib/server/rls-db';",
      'export async function listShares(request) {',
      '  const { db, userId } = await getUserScopedDb(request);',
      '  return db.query(`select id from shared_sessions where user_id = $1`, [userId]);',
      '}',
    ].join('\n'),
  });
  assert.equal(result.status, 0, `expected pass, got:\n${result.stderr}`);
});

test('a file that names a user-owned table only in a comment passes', () => {
  const result = runOnSandbox({
    'apps/web/lib/shares.ts': [
      "import { getNeonDb } from '@/lib/server/neon-db';",
      '// historical note: this used to read from shared_sessions directly',
      'export async function listReleaseChannels() {',
      '  const db = getNeonDb();',
      '  return db.query(`select id from release_channels order by created_at desc`);',
      '}',
    ].join('\n'),
  });
  assert.equal(result.status, 0, `expected pass, got:\n${result.stderr}`);
});

test('a stale allowlist entry whose file no longer offends fails', () => {
  const result = runOnSandbox({
    'apps/web/lib/shares.ts': [
      "import { getUserScopedDb } from '@/lib/server/rls-db';",
      'export async function listShares(request) {',
      '  const { db, userId } = await getUserScopedDb(request);',
      '  return db.query(`select id from shared_sessions where user_id = $1`, [userId]);',
      '}',
    ].join('\n'),
    [ALLOWLIST_PATH]: allowlist([
      { path: 'apps/web/lib/shares.ts', reason: 'pending scoped migration' },
    ]),
  });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}${result.stderr}`);
  assert.match(result.stderr, /no longer offend/);
  assert.match(result.stderr, /apps\/web\/lib\/shares\.ts/);
});

test('an allowlist entry with a placeholder reason fails validation', () => {
  const result = runOnSandbox({
    'apps/web/lib/shares.ts': OFFENDING_ROUTE,
    [ALLOWLIST_PATH]: allowlist([{ path: 'apps/web/lib/shares.ts', reason: 'todo' }]),
  });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}`);
  assert.match(result.stderr, /needs a one-line reason/);
});

test('a duplicate allowlist entry fails', () => {
  const result = runOnSandbox({
    'apps/web/lib/shares.ts': OFFENDING_ROUTE,
    [ALLOWLIST_PATH]: allowlist([
      { path: 'apps/web/lib/shares.ts', reason: 'pending scoped migration' },
      { path: 'apps/web/lib/shares.ts', reason: 'pending scoped migration' },
    ]),
  });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}`);
  assert.match(result.stderr, /duplicate entry/);
});

test('an allowlist entry with an unknown key fails validation', () => {
  const result = runOnSandbox({
    'apps/web/lib/shares.ts': OFFENDING_ROUTE,
    [ALLOWLIST_PATH]: JSON.stringify({
      schemaVersion: 1,
      entries: [
        { path: 'apps/web/lib/shares.ts', reason: 'pending scoped migration', owner: 'nobody' },
      ],
    }),
  });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}`);
  assert.match(result.stderr, /unknown key "owner"/);
});

test('an allowlist with an unknown top-level key fails validation', () => {
  const result = runOnSandbox({
    'apps/web/lib/shares.ts': OFFENDING_ROUTE,
    [ALLOWLIST_PATH]: JSON.stringify({
      schemaVersion: 1,
      entries: [{ path: 'apps/web/lib/shares.ts', reason: 'pending scoped migration' }],
      notes: 'draft',
    }),
  });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}`);
  assert.match(result.stderr, /unknown top-level key "notes"/);
});

test('a table mentioned only as a coincidental identifier still offends, by design', () => {
  const result = runOnSandbox({
    'apps/web/lib/shares.ts': [
      "import { getNeonDb } from '@/lib/server/neon-db';",
      'export async function countFeedback() {',
      '  const feedback = 1;',
      '  const db = getNeonDb();',
      '  return db.query(`select count(*) from release_channels`, [feedback]);',
      '}',
    ].join('\n'),
  });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}`);
  assert.match(result.stderr, /feedback/);
});
