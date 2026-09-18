import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  findDuplicateVocabularies,
  loadRegistry,
  missingContractColumns,
  readSchemaInventory,
  readVocabularies,
} from './check-concept-registry.mjs';

function fixtureRoot(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'concept-registry-'));
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolute = path.join(root, relativePath);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents);
  }
  return root;
}

const VOCABULARY_DIR = 'packages/contracts/types/src';

test('an unregistered duplicate vocabulary is flagged', () => {
  const root = fixtureRoot({
    [`${VOCABULARY_DIR}/first.ts`]:
      "export type ProbeStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';\n",
    [`${VOCABULARY_DIR}/second.ts`]:
      "export type ProbeRunState = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';\n",
  });

  const duplicates = findDuplicateVocabularies(
    readVocabularies(root, [`${VOCABULARY_DIR}/first.ts`, `${VOCABULARY_DIR}/second.ts`]),
  );

  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].shared, 5);
  assert.deepEqual([duplicates[0].left.name, duplicates[0].right.name].sort(), [
    'ProbeRunState',
    'ProbeStatus',
  ]);
});

test('a union derived from its const array is one vocabulary, not two', () => {
  const root = fixtureRoot({
    [`${VOCABULARY_DIR}/derived.ts`]:
      "export const PROBE_STATUSES = ['queued', 'running', 'done', 'failed', 'cancelled'] as const;\n" +
      'export type ProbeStatus = (typeof PROBE_STATUSES)[number];\n',
  });

  const vocabularies = readVocabularies(root, [`${VOCABULARY_DIR}/derived.ts`]);

  assert.equal(vocabularies.size, 1);
  assert.deepEqual(findDuplicateVocabularies(vocabularies), []);
});

test('a const array typed by a union in the same file is that union', () => {
  const root = fixtureRoot({
    [`${VOCABULARY_DIR}/annotated.ts`]:
      "export type ProbeStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';\n" +
      'export const PROBE_STATUSES: readonly ProbeStatus[] = [\n' +
      "  'queued', 'running', 'done', 'failed', 'cancelled',\n" +
      '] as const;\n',
  });

  assert.equal(readVocabularies(root, [`${VOCABULARY_DIR}/annotated.ts`]).size, 1);
});

test('vocabularies below the member floor are not compared', () => {
  const root = fixtureRoot({
    [`${VOCABULARY_DIR}/small-a.ts`]: "export type ProbeA = 'one' | 'two' | 'three';\n",
    [`${VOCABULARY_DIR}/small-b.ts`]: "export type ProbeB = 'one' | 'two' | 'three';\n",
  });

  assert.deepEqual(
    findDuplicateVocabularies(
      readVocabularies(root, [`${VOCABULARY_DIR}/small-a.ts`, `${VOCABULARY_DIR}/small-b.ts`]),
    ),
    [],
  );
});

test('the schema inventory reads columns from create and alter statements', () => {
  const inventory = readSchemaInventory([
    {
      name: '0100_probe.sql',
      ordinal: 100,
      sql: 'create table if not exists public.probe (\n  id uuid primary key,\n  user_id text not null\n);',
    },
    {
      name: '0101_probe_columns.sql',
      ordinal: 101,
      sql: 'alter table public.probe add column if not exists created_by text;',
    },
  ]);

  const probe = inventory.tables.get('probe');
  assert.equal(probe.createdIn, 100);
  assert.deepEqual([...probe.columns].sort(), ['created_by', 'id', 'user_id']);
});

test('the shipped registry keeps every duplicate pair dated', () => {
  const registry = loadRegistry();
  assert.ok(registry.duplicateVocabularies.length > 0);
  for (const entry of registry.duplicateVocabularies) {
    assert.match(entry.migrateBy, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(entry.why.length > 20);
  }
});

test('the shipped column contract names a column for every required role', () => {
  const { roles } = loadRegistry().columnContract;
  assert.deepEqual(missingContractColumns({ columns: new Set(), roles }).sort(), [
    'createdAt',
    'createdBy',
    'owner',
    'updatedAt',
    'version',
  ]);
  for (const role of ['owner', 'createdAt', 'updatedAt', 'createdBy', 'version']) {
    assert.equal(typeof roles[role].column, 'string');
    assert.ok(roles[role].why.length > 10);
  }
});
