import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  cronScheduleFailures,
  fetchArguments,
  selfInvokingRoutes,
  vercelCostLoops,
} from './check-vercel-cost-loops.mjs';

function repoWith({ routes = {}, crons = [] }) {
  const root = mkdtempSync(join(tmpdir(), 'cost-loops-'));
  for (const [name, source] of Object.entries(routes)) {
    const directory = join(root, 'apps/web/app/api', name);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'route.ts'), source, 'utf8');
  }
  writeFileSync(join(root, 'vercel.json'), JSON.stringify({ crons }), 'utf8');
  return root;
}

function run(input) {
  const root = repoWith(input);
  try {
    return vercelCostLoops(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('a route that fetches its own deployment origin is reported', () => {
  const failures = run({
    routes: {
      'cron/fan-out': "await fetch(`${process.env['NEXT_PUBLIC_APP_URL']}/api/cron/fan-out`);",
    },
  });

  assert.equal(failures.length, 1);
  assert.match(failures[0], /fetches its own deployment origin/);
});

test('every way of naming this deployment counts as its own origin', () => {
  for (const origin of [
    'fetch(`https://${process.env.VERCEL_URL}/api/x`)',
    'fetch(new URL("/api/x", request.nextUrl.origin))',
    'fetch(`${process.env.VERCEL_BRANCH_URL}/api/x`)',
  ]) {
    assert.equal(run({ routes: { probe: origin } }).length, 1, origin);
  }
});

test('reading the request URL without fetching it is not a loop', () => {
  assert.deepEqual(
    run({
      routes: {
        'cron/retention': "const dryRun = new URL(request.url).searchParams.get('dryRun');",
      },
    }),
    [],
  );
});

test('a fetch to somebody else is left alone', () => {
  assert.deepEqual(
    run({ routes: { probe: "await fetch('https://api.example.com/v1/things');" } }),
    [],
  );
});

test('a comment mentioning the origin does not fail the guard', () => {
  assert.deepEqual(
    run({ routes: { probe: '// never fetch NEXT_PUBLIC_APP_URL from here\nexport const x = 1;' } }),
    [],
  );
});

test('a cron scheduled every minute is refused', () => {
  const failures = cronScheduleFailures(
    repoWith({ crons: [{ path: '/api/cron/a', schedule: '* * * * *' }] }),
  );

  assert.equal(failures.length, 1);
  assert.match(failures[0], /overlaps the next one/);
});

test('the same cron path scheduled twice is billed twice and refused', () => {
  const failures = cronScheduleFailures(
    repoWith({
      crons: [
        { path: '/api/cron/a', schedule: '0 1 * * *' },
        { path: '/api/cron/a', schedule: '0 2 * * *' },
      ],
    }),
  );

  assert.equal(failures.length, 1);
  assert.match(failures[0], /2 times/);
});

test('a cron entry missing a field is refused rather than skipped', () => {
  const failures = cronScheduleFailures(repoWith({ crons: [{ path: '/api/cron/a' }] }));

  assert.equal(failures.length, 1);
  assert.match(failures[0], /no path or no schedule/);
});

test('a nested call inside the fetch argument is read whole', () => {
  assert.deepEqual(fetchArguments('fetch(new URL(join(a, b)), { method: "GET" })'), [
    'new URL(join(a, b)), { method: "GET" }',
  ]);
});

test('this repository has no self-invoking route and no duplicate cron', () => {
  assert.deepEqual(selfInvokingRoutes(process.cwd()), []);
  assert.deepEqual(cronScheduleFailures(process.cwd()), []);
});
