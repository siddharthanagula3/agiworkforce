#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  cascadingColumns,
  checkConstraintValues,
  enqueueCaseKinds,
  liveFunctionBodies,
  quotedArgumentsTo,
  readMigrations,
  singleSourceMapping,
  stringArrayConst,
  switchArmBodies,
  switchCaseArms,
} from './lib/search-index-coverage.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

const CONTRACT = 'packages/platform/data-layer/src/search/types.ts';
const LOADER = 'apps/web/lib/services/retrieval-index-service.ts';
const MIGRATIONS = 'apps/web/db/neon';
const LOADER_MARKER = 'switch (document.source_kind)';

/** What a source table says when a row is still live. */
const LIFECYCLE_PREDICATES = [
  'deleted_at is null',
  'superseded_at is null',
  'archived_at is null',
  'is_temporary = false',
  "status = 'completed'",
];

const failures = [];

function read(relative) {
  const full = path.join(scanRoot, relative);
  if (!fs.existsSync(full)) {
    failures.push(`${relative} is missing, so nothing declares what the index covers`);
    return null;
  }
  return fs.readFileSync(full, 'utf8');
}

function sorted(list) {
  return [...list].sort();
}

function sameSet(label, actual, expected, where) {
  if (actual === null) {
    failures.push(`${where} does not declare ${label} in a shape this guard can read`);
    return;
  }
  const missing = expected.filter((kind) => !actual.includes(kind));
  const extra = actual.filter((kind) => !expected.includes(kind));
  if (missing.length > 0) {
    failures.push(`${where} is missing ${label}: ${sorted(missing).join(', ')}`);
  }
  if (extra.length > 0) {
    failures.push(`${where} declares ${label} the contract does not: ${sorted(extra).join(', ')}`);
  }
}

const contract = read(CONTRACT);
const loader = read(LOADER);
const migrationDir = path.join(scanRoot, MIGRATIONS);
if (!fs.existsSync(migrationDir)) {
  failures.push(`${MIGRATIONS} is missing, so nothing stores the index`);
}

let kinds = [];
if (contract && loader && failures.length === 0) {
  kinds = stringArrayConst(contract, 'SEARCH_SOURCE_KINDS') ?? [];
  if (kinds.length === 0) {
    failures.push(`${CONTRACT} declares no SEARCH_SOURCE_KINDS`);
  }

  const migrations = readMigrations(migrationDir);
  const table = migrations.find(({ sql }) =>
    sql.includes('create table if not exists public.retrieval_documents'),
  );
  if (!table) {
    failures.push(`no migration creates retrieval_documents, so the index has no storage`);
  }

  if (kinds.length > 0 && table) {
    sameSet(
      'source kind',
      checkConstraintValues(table.sql, 'source_kind'),
      kinds,
      `${MIGRATIONS}/${table.name} check constraint`,
    );

    const mapping = singleSourceMapping(table.sql);
    sameSet(
      'source kind',
      Object.keys(mapping),
      kinds,
      `${MIGRATIONS}/${table.name} single-source constraint`,
    );

    const cascades = cascadingColumns(table.sql);
    for (const kind of kinds) {
      const column = mapping[kind];
      if (!column) continue;
      if (!cascades.includes(column)) {
        failures.push(
          `${MIGRATIONS}/${table.name}: ${column} does not cascade on delete, so deleting a ` +
            `${kind} leaves its chunks behind`,
        );
      }
    }

    const enqueueFn = liveFunctionBodies(migrations).get('retrieval_enqueue_document');
    sameSet(
      'source kind',
      enqueueFn ? enqueueCaseKinds(enqueueFn) : null,
      kinds,
      'retrieval_enqueue_document',
    );

    const bodies = liveFunctionBodies(migrations);
    const trackers = [...bodies.entries()].filter(([name]) => name.startsWith('retrieval_track_'));
    const enqueued = new Set();
    const withdrawn = new Set();
    const refreshed = new Set();
    for (const [, body] of trackers) {
      for (const kind of quotedArgumentsTo(body, 'retrieval_enqueue_document')) enqueued.add(kind);
      for (const kind of quotedArgumentsTo(body, 'retrieval_forget_document')) withdrawn.add(kind);
      for (const kind of quotedArgumentsTo(body, 'retrieval_mark_stale')) refreshed.add(kind);
      const rewrites = body.includes("set status = 'stale'");
      for (const kind of kinds) {
        const column = mapping[kind];
        if (!column || !body.includes(column)) continue;
        if (body.includes('delete from public.retrieval_documents')) withdrawn.add(kind);
        if (rewrites) refreshed.add(kind);
      }
    }
    for (const kind of kinds) {
      if (!enqueued.has(kind)) {
        failures.push(`no trigger enqueues a '${kind}', so that source is never indexed`);
      }
      if (!refreshed.has(kind)) {
        failures.push(
          `no trigger marks a '${kind}' stale when its text changes, so an edit leaves the old ` +
            `passage searchable`,
        );
      }
      if (!withdrawn.has(kind)) {
        failures.push(
          `no trigger withdraws a '${kind}' from the index, so withdrawing the source leaves it ` +
            `retrievable until the row is hard-deleted`,
        );
      }
    }
  }

  if (kinds.length > 0) {
    sameSet('source kind', switchCaseArms(loader, LOADER_MARKER), kinds, `${LOADER} source loader`);
    const arms = switchArmBodies(loader, LOADER_MARKER) ?? {};
    for (const kind of kinds) {
      const arm = arms[kind];
      if (arm === undefined) continue;
      if (LIFECYCLE_PREDICATES.some((predicate) => arm.includes(predicate))) continue;
      failures.push(
        `${LOADER} reads a '${kind}' without a lifecycle predicate, so withdrawn text is read ` +
          `back and embedded. One of: ${LIFECYCLE_PREDICATES.join(', ')}`,
      );
    }
  }
}

if (failures.length === 0) {
  console.log(
    `check-search-index-coverage: ${kinds.length} source kind(s) declared, stored, enqueued, ` +
      `withdrawn and loadable.`,
  );
  process.exit(0);
}

console.error('Search index coverage that the contract claims and the database does not have:\n');
for (const failure of failures) console.error(`  - ${failure}`);
console.error(`\n${failures.length} finding(s).`);
process.exit(1);
