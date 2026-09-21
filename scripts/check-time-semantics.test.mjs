import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CONTRACT_PATH,
  MIGRATIONS_DIR,
  REPO_ROOT,
  checkTimeSemantics,
  loadContract,
  readTimeColumns,
} from './check-time-semantics.mjs';

const roots = [];

function write(root, relativePath, contents) {
  const absolute = path.join(root, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

const MIGRATION = `
create table tasks (
  id uuid primary key default gen_random_uuid(),
  cron_expression text not null,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now()
);
`;

const ZONED = `
export function zonedParts(timezone: string, at: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).formatToParts(at);
}
`;

const SCHEDULER = `
import { zonedParts } from './zoned-time';
export const validateTimeZone = (zone: string) => zone;
export function nextRunAt(timezone: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
}
`;

function fixture(overrides = {}, files = {}, migration = MIGRATION) {
  const root = mkdtempSync(path.join(tmpdir(), 'time-semantics-'));
  roots.push(root);
  write(root, `${MIGRATIONS_DIR}/0001_tasks.sql`, migration);
  write(root, CONTRACT_PATH, JSON.stringify({ ...loadContract(REPO_ROOT), ...overrides }));
  write(root, 'apps/web/lib/schedules/zoned-time.ts', ZONED);
  write(root, 'apps/web/lib/schedules/schedule-time.ts', SCHEDULER);
  for (const [relativePath, contents] of Object.entries(files)) write(root, relativePath, contents);
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('the real guard passes on the repository as it stands', () => {
  const { errors } = checkTimeSemantics(REPO_ROOT);
  assert.deepEqual(errors, []);
});

test('a clean schema passes', () => {
  assert.deepEqual(checkTimeSemantics(fixture()).errors, []);
});

test('a naive timestamp column fails until it is recorded', () => {
  const naive = MIGRATION.replace('created_at timestamptz', 'created_at timestamp');
  const { errors } = checkTimeSemantics(fixture({}, {}, naive));
  assert.ok(
    errors.some((error) => error.includes('stores a wall clock')),
    errors.join('\n'),
  );

  const recorded = checkTimeSemantics(
    fixture(
      {
        naiveTimeExemptions: [{ table: 'tasks', column: 'created_at', why: 'a local wall clock' }],
      },
      {},
      naive,
    ),
  );
  assert.deepEqual(recorded.errors, []);

  const stale = checkTimeSemantics(
    fixture({ naiveTimeExemptions: [{ table: 'tasks', column: 'created_at', why: 'x' }] }),
  );
  assert.ok(
    stale.errors.some((error) => error.includes('is no longer naive')),
    stale.errors.join('\n'),
  );
});

test('a recurrence with no zone fails', () => {
  const zoneless = MIGRATION.replace("  timezone text not null default 'UTC',\n", '');
  const { errors } = checkTimeSemantics(fixture({}, {}, zoneless));
  assert.ok(
    errors.some((error) => error.includes('stores a recurrence and no zone')),
    errors.join('\n'),
  );
});

test('a schema with no recurrence at all fails, so the rule cannot go quiet', () => {
  const { errors } = checkTimeSemantics(
    fixture(
      {},
      {},
      'create table notes (\n  id uuid primary key default gen_random_uuid(),\n  created_at timestamptz not null default now()\n);\n',
    ),
  );
  assert.ok(
    errors.some((error) => error.includes('so the schedule zone rule is reading nothing')),
    errors.join('\n'),
  );
});

test('resolving a local time with a fixed offset fails', () => {
  const { errors } = checkTimeSemantics(
    fixture(
      {},
      {
        'apps/web/lib/schedules/zoned-time.ts':
          'export function zonedParts(at: Date) { return at.getTimezoneOffset(); }',
      },
    ),
  );
  assert.ok(
    errors.some((error) => error.includes('no longer uses Intl.DateTimeFormat')),
    errors.join('\n'),
  );
});

test('a scheduler that resolves times without naming a zone fails', () => {
  const { errors } = checkTimeSemantics(
    fixture(
      {},
      { 'apps/web/lib/schedules/schedule-time.ts': 'export const nextRunAt = () => new Date();' },
    ),
  );
  assert.ok(
    errors.some((error) => error.includes('resolves a local time without naming a zone')),
    errors.join('\n'),
  );
});

test('a presentation helper pinned to the server zone fails', () => {
  const { errors } = checkTimeSemantics(
    fixture(
      {},
      {
        'apps/web/lib/schedules/schedule-time.ts':
          "export const f = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC' });\nexport const validateTimeZone = (z: string) => z;",
      },
    ),
  );
  assert.ok(
    errors.some((error) => error.includes('pins the presentation zone')),
    errors.join('\n'),
  );
});

test('a consequential time the caller supplies fails until it is recorded', () => {
  const caller = MIGRATION.replace(
    'created_at timestamptz not null default now()',
    'created_at timestamptz not null',
  );
  const { errors } = checkTimeSemantics(fixture({}, {}, caller));
  assert.ok(
    errors.some((error) => error.includes('takes the time from whoever inserted the row')),
    errors.join('\n'),
  );

  const recorded = checkTimeSemantics(
    fixture(
      { callerStampedExemptions: [{ table: 'tasks', column: 'created_at', why: 'imported rows' }] },
      {},
      caller,
    ),
  );
  assert.deepEqual(recorded.errors, []);
});

test('the time columns are read from the migrations with their defaults', () => {
  const columns = readTimeColumns(fixture());
  const created = columns.find((entry) => entry.column === 'created_at');
  assert.equal(created.table, 'tasks');
  assert.equal(created.type, 'timestamptz');
  assert.match(created.rest, /default now\(\)/);
});
