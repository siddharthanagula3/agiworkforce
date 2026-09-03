import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CORE_TABLES, parseArgs, runRestoreDrill } from './db-restore-drill.mjs';

function fakeFetch({ onCreate, onDelete }) {
  return async (url, options) => {
    if (options.method === 'POST') {
      onCreate?.(url, JSON.parse(options.body));
      return {
        ok: true,
        json: async () => ({
          branch: { id: 'br-drill-test' },
          connection_uris: [
            { connection_uri: 'postgresql://EXAMPLE:EXAMPLE@db.example.com/neondb' },
          ],
        }),
      };
    }
    if (options.method === 'DELETE') {
      onDelete?.(url);
      return { ok: true, json: async () => ({}) };
    }
    throw new Error(`Unexpected method: ${options.method}`);
  };
}

function fakeQueryBuilder(rowCount) {
  const calls = [];
  return {
    calls,
    build: () => async (text) => {
      calls.push(text);
      if (text === 'select 1') return [{ '?column?': 1 }];
      return [{ count: rowCount }];
    },
  };
}

test('parseArgs requires --at and rejects an invalid timestamp', () => {
  assert.throws(() => parseArgs([]), /--at/);
  assert.throws(() => parseArgs(['--at=not-a-date']), /not a valid timestamp/);
  const args = parseArgs(['--at=2026-08-30T00:00:00Z', '--keep']);
  assert.equal(args.at, '2026-08-30T00:00:00Z');
  assert.equal(args.keep, true);
});

test('runRestoreDrill creates a branch from the recovery point, counts core tables, and deletes the branch', async () => {
  let deleted = false;
  const fetchImpl = fakeFetch({
    onCreate: (url, body) => {
      assert.match(url, /\/projects\/proj-1\/branches$/);
      assert.equal(body.branch.parent_timestamp, '2026-08-30T00:00:00Z');
      assert.equal(body.endpoints[0].type, 'read_write');
    },
    onDelete: (url) => {
      deleted = true;
      assert.match(url, /\/branches\/br-drill-test$/);
    },
  });
  const { build, calls } = fakeQueryBuilder(42);

  const report = await runRestoreDrill({
    at: '2026-08-30T00:00:00Z',
    apiKey: 'test-key',
    projectId: 'proj-1',
    fetchImpl,
    buildQueryImpl: build,
    tables: CORE_TABLES,
  });

  assert.equal(report.branchId, 'br-drill-test');
  assert.equal(report.kept, false);
  assert.equal(deleted, true);
  for (const table of CORE_TABLES) {
    assert.equal(report.tables[table], 42);
  }
  assert.equal(calls.filter((text) => text.includes('count(*)')).length, CORE_TABLES.length);
});

test('runRestoreDrill keeps the branch when keep is true', async () => {
  let deleted = false;
  const fetchImpl = fakeFetch({ onDelete: () => (deleted = true) });
  const { build } = fakeQueryBuilder(0);

  const report = await runRestoreDrill({
    at: '2026-08-30T00:00:00Z',
    keep: true,
    apiKey: 'test-key',
    projectId: 'proj-1',
    fetchImpl,
    buildQueryImpl: build,
    tables: ['public.profiles'],
  });

  assert.equal(report.kept, true);
  assert.equal(deleted, false);
});

test('runRestoreDrill still deletes the branch when a query fails', async () => {
  let deleted = false;
  const fetchImpl = fakeFetch({ onDelete: () => (deleted = true) });
  const build = () => async (text) => {
    if (text === 'select 1') return [{}];
    throw new Error('relation does not exist');
  };

  await assert.rejects(
    runRestoreDrill({
      at: '2026-08-30T00:00:00Z',
      apiKey: 'test-key',
      projectId: 'proj-1',
      fetchImpl,
      buildQueryImpl: build,
      tables: ['public.profiles'],
    }),
    /relation does not exist/,
  );
  assert.equal(deleted, true);
});

test('runRestoreDrill requires an api key and a project id', async () => {
  await assert.rejects(
    runRestoreDrill({
      at: '2026-08-30T00:00:00Z',
      projectId: 'proj-1',
      buildQueryImpl: () => async () => [],
    }),
    /NEON_API_KEY/,
  );
  await assert.rejects(
    runRestoreDrill({
      at: '2026-08-30T00:00:00Z',
      apiKey: 'test-key',
      buildQueryImpl: () => async () => [],
    }),
    /NEON_PROJECT_ID/,
  );
});
