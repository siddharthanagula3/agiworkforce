import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  GATE_MODULE,
  auditRepository,
  auditSource,
  createsMemoryText,
  extractSqlLiterals,
} from './check-memory-write-gate.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const GUARD = path.join(REPO_ROOT, 'scripts', 'check-memory-write-gate.mjs');

const sandboxes = [];
function makeSandbox(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'check-memory-write-gate-'));
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

const UNGATED = [
  'export async function save(db, userId, content) {',
  '  return db.query(`insert into user_memories (user_id, content) values ($1, $2)`, [userId, content]);',
  '}',
].join('\n');

const GATED = [
  'import { memoryWriteAdmission } from "@/lib/services/managed-memory-context-service";',
  'export async function save(db, userId, content) {',
  '  const decision = await memoryWriteAdmission(db, { userId, content });',
  '  if (!decision.eligible) return null;',
  '  return db.query(`insert into user_memories (user_id, content) values ($1, $2)`, [userId, content]);',
  '}',
].join('\n');

const SOFT_DELETE = [
  'export async function forget(db, userId, id) {',
  '  return db.query(`update user_memories set is_deleted = true where user_id = $1 and id = $2`, [userId, id]);',
  '}',
].join('\n');

test('counts an insert and a content update as creating memory text', () => {
  assert.equal(
    createsMemoryText('insert into user_memories (user_id, content) values ($1, $2)'),
    true,
  );
  assert.equal(createsMemoryText('update user_memories set content = $1 where user_id = $2'), true);
  assert.equal(createsMemoryText('select content from user_memories where user_id = $1'), false);
});

test('leaves a soft delete and an expiry blanking alone', () => {
  assert.deepEqual(auditSource('apps/web/app/api/memory/[id]/route.ts', SOFT_DELETE), []);
  assert.equal(
    createsMemoryText(
      "update user_memories set is_deleted = true, content = '' where user_id = $1",
    ),
    false,
  );
});

test('fails a module that writes memory text without reaching the gate', () => {
  const failures = auditSource('apps/web/lib/services/rogue.ts', UNGATED);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /without reaching the shared gate/);
});

test('passes the same module once it decides through the gate', () => {
  assert.deepEqual(auditSource('apps/web/lib/services/rogue.ts', GATED), []);
});

test('never asks the gate module to call itself', () => {
  assert.deepEqual(auditSource(GATE_MODULE, UNGATED), []);
  assert.deepEqual(extractSqlLiterals('`a` `b`'), ['a', 'b']);
});

test('accepts a store whose driving route decided through the gate', () => {
  const dir = makeSandbox({
    [GATE_MODULE]: 'export function memoryWriteAdmission() {}',
    'apps/web/lib/memory/store.ts': UNGATED,
    'apps/web/app/api/memory/import/route.ts': [
      'import { memoryWriteAdmission } from "@/lib/services/managed-memory-context-service";',
      'import { save } from "@/lib/memory/store";',
      'export async function POST() { await memoryWriteAdmission(); return save(); }',
    ].join('\n'),
  });
  const result = spawnSync(process.execPath, [GUARD], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('exits non-zero when a store has no gated caller at all', () => {
  const dir = makeSandbox({
    [GATE_MODULE]: 'export function memoryWriteAdmission() {}',
    'apps/web/lib/memory/store.ts': UNGATED,
  });
  const result = spawnSync(process.execPath, [GUARD], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /without reaching the shared gate/);
});

test('exits non-zero when the gate module is gone', () => {
  const dir = makeSandbox({ 'apps/web/lib/x.ts': 'export const a = 1;' });
  const result = spawnSync(process.execPath, [GUARD], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /is missing/);
});

test('holds over the repository it guards', () => {
  const { writers, failures } = auditRepository(REPO_ROOT);
  assert.deepEqual(failures, []);
  assert.ok(writers > 0);
});
