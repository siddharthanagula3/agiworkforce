import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  auditRepository,
  auditSource,
  auditStatement,
  extractSqlLiterals,
  isMemoryStatement,
  returnsMemoryContent,
} from './check-memory-isolation.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const GUARD = path.join(REPO_ROOT, 'scripts', 'check-memory-isolation.mjs');

const sandboxes = [];
function makeSandbox(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'check-memory-isolation-'));
  sandboxes.push(dir);
  for (const [relative, contents] of Object.entries(files)) {
    const absolute = path.join(dir, relative);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents, 'utf8');
  }
  return dir;
}

after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

const SCOPED = [
  'const rows = await db.query(',
  '  `select id, content from user_memories',
  '     where user_id = $1 and ${workspaceMemoryPredicate(2)}`,',
  '  [userId, organizationId],',
  ');',
].join('\n');

const UNSCOPED_ACCOUNT = [
  'const rows = await db.query(',
  '  `select id, content from user_memories where is_deleted = false`,',
  ');',
].join('\n');

const UNSCOPED_WORKSPACE = [
  'const rows = await db.query(',
  '  `select id, content from user_memories where user_id = $1`,',
  '  [userId],',
  ');',
].join('\n');

test('reads SQL out of template literals and ignores everything else', () => {
  assert.deepEqual(extractSqlLiterals('const a = `one`; const b = `two`;'), ['one', 'two']);
  assert.equal(isMemoryStatement('user_memories/abc'), false);
  assert.equal(isMemoryStatement('select 1 from user_memories'), true);
});

test('passes a statement scoped by account and workspace', () => {
  assert.deepEqual(auditSource('apps/web/app/api/memory/route.ts', SCOPED), []);
});

test('fails a statement that reaches the table with no account predicate', () => {
  const failures = auditSource('apps/web/lib/services/x.ts', UNSCOPED_ACCOUNT);
  assert.equal(failures.length, 2);
  assert.match(failures.join('\n'), /no user_id predicate/);
  assert.match(failures.join('\n'), /workspace predicate/);
});

test('fails a request-scoped read that returns content with no workspace predicate', () => {
  const failures = auditSource('apps/web/app/api/memory/route.ts', UNSCOPED_WORKSPACE);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /workspace predicate/);
});

test('leaves an account-wide export alone, and still demands the account predicate', () => {
  assert.deepEqual(auditSource('apps/web/app/api/user/export/route.ts', UNSCOPED_WORKSPACE), []);
  assert.equal(auditSource('apps/web/app/api/user/export/route.ts', UNSCOPED_ACCOUNT).length, 1);
});

test('accepts an insert that names user_id among the columns it writes', () => {
  const insert = 'const q = `insert into user_memories (user_id, content) select $1, $2`;';
  assert.deepEqual(auditStatement(extractSqlLiterals(insert)[0], { requestScoped: true }), []);
});

test('does not mistake a content assignment for a read', () => {
  assert.equal(
    returnsMemoryContent("update user_memories set content = '' where user_id = $1"),
    false,
  );
});

test('exits non-zero on a tree that carries an unscoped read', () => {
  const dir = makeSandbox({
    'apps/web/lib/services/leaky-memory-service.ts': UNSCOPED_ACCOUNT,
  });
  const result = spawnSync(process.execPath, [GUARD], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no user_id predicate/);
});

test('exits non-zero when nothing in the tree touches the table at all', () => {
  const dir = makeSandbox({ 'apps/web/lib/services/unrelated.ts': 'export const a = 1;' });
  const result = spawnSync(process.execPath, [GUARD], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /found no module/);
});

test('holds over the repository it guards', () => {
  const { scanned, failures } = auditRepository(REPO_ROOT);
  assert.ok(scanned > 0);
  assert.deepEqual(failures, []);
});
