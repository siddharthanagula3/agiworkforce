import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CONTRACT_PATH,
  CRON_DIR,
  REPO_ROOT,
  VERCEL_CONFIG,
  checkCronContract,
  cronRoutes,
  firingMinutes,
  isFixedHour,
  leavesARecord,
  shortestInterval,
  readRoute,
  registeredCrons,
} from './check-cron-contract.mjs';

const roots = [];

const CONTRACT = {
  allowedRuntimes: ['nodejs'],
  minSeconds: 30,
  maxSeconds: 800,
  heavySeconds: 300,
  boundedByConstruction: [],
  allowedCollisions: [],
};

function route({
  seconds = 300,
  runtime = "export const runtime = 'nodejs';",
  auth = true,
  loop = false,
  ceiling = false,
  record = true,
} = {}) {
  return [
    "import { NextRequest, NextResponse } from 'next/server';",
    "import { verifyCronRequest } from '@/lib/server/cron-auth';",
    '',
    runtime,
    seconds === null ? '' : `export const maxDuration = ${seconds};`,
    ceiling ? 'const MAX_ROWS_PER_RUN = 100;' : '',
    '',
    'export async function GET(request: NextRequest) {',
    auth
      ? '  if (!verifyCronRequest(request)) {\n    return NextResponse.json({ error: 1 }, { status: 401 });\n  }'
      : '  const ok = true;',
    loop ? '  for (const row of rows) {\n    await work(row);\n  }' : '',
    record ? "  logger.info({ swept: rows.length }, 'swept');" : '',
    '  return NextResponse.json({});',
    '}',
  ].join('\n');
}

function fixture({ routes, crons, contract = CONTRACT }) {
  const root = mkdtempSync(path.join(tmpdir(), 'cron-contract-'));
  roots.push(root);
  mkdirSync(path.join(root, path.dirname(CONTRACT_PATH)), { recursive: true });
  writeFileSync(path.join(root, CONTRACT_PATH), JSON.stringify(contract));
  writeFileSync(path.join(root, VERCEL_CONFIG), JSON.stringify({ crons }));
  for (const [name, source] of Object.entries(routes)) {
    mkdirSync(path.join(root, CRON_DIR, name), { recursive: true });
    writeFileSync(path.join(root, CRON_DIR, name, 'route.ts'), source);
  }
  return root;
}

function errorsFor(options) {
  return checkCronContract(fixture(options)).errors;
}

const CLEAN = {
  routes: { sweep: route() },
  crons: [{ path: '/api/cron/sweep', schedule: '0 3 * * *' }],
};

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('the real guard passes on the repository as it stands', () => {
  const { errors, report } = checkCronContract(REPO_ROOT);
  assert.deepEqual(errors, []);
  assert.ok(report.routes > 30, 'every cron route is measured');
  assert.equal(report.routes, report.scheduled);
});

test('it enumerates the real routes rather than a listed subset', () => {
  const names = cronRoutes(REPO_ROOT);
  assert.ok(names.includes('drain-background-jobs'));
  assert.ok(names.includes('purge-temporary-chats'));
  assert.equal(registeredCrons(REPO_ROOT).length, names.length);
});

test('every real cron route declares its own ceiling and refuses an unauthenticated call', () => {
  for (const name of cronRoutes(REPO_ROOT)) {
    const source = readRoute(REPO_ROOT, name);
    assert.match(source, /export const maxDuration = \d+;/u, `${name} declares maxDuration`);
    assert.match(
      source,
      /if \(!verifyCronRequest\(request\)\)/u,
      `${name} refuses on a false answer`,
    );
  }
});

test('a synthetic clean tree passes', () => {
  assert.deepEqual(errorsFor(CLEAN), []);
});

test('a route that never checks the cron secret fails', () => {
  const errors = errorsFor({ ...CLEAN, routes: { sweep: route({ auth: false }) } });
  assert.ok(errors.some((error) => /does not call verifyCronRequest/.test(error)));
});

test('a route that calls the check but ignores the answer fails', () => {
  const source = route().replace(
    '  if (!verifyCronRequest(request)) {\n    return NextResponse.json({ error: 1 }, { status: 401 });\n  }',
    '  verifyCronRequest(request);\n  const unused = { status: 401 };',
  );
  const errors = errorsFor({ ...CLEAN, routes: { sweep: source } });
  assert.ok(errors.some((error) => /does not refuse on a false answer/.test(error)));
});

test('a route that never answers 401 fails', () => {
  const source = route().replace('{ status: 401 }', '{ status: 200 }');
  const errors = errorsFor({ ...CLEAN, routes: { sweep: source } });
  assert.ok(errors.some((error) => /never answers 401/.test(error)));
});

test('a route with no maxDuration fails', () => {
  const errors = errorsFor({ ...CLEAN, routes: { sweep: route({ seconds: null }) } });
  assert.ok(errors.some((error) => /declares no maxDuration/.test(error)));
});

test('a maxDuration outside the declared band fails', () => {
  assert.ok(
    errorsFor({ ...CLEAN, routes: { sweep: route({ seconds: 5 }) } }).some((e) =>
      /outside the 30 to 800/.test(e),
    ),
  );
  assert.ok(
    errorsFor({ ...CLEAN, routes: { sweep: route({ seconds: 3600 }) } }).some((e) =>
      /outside the 30 to 800/.test(e),
    ),
  );
});

test('a route with no runtime, or an unallowed one, fails', () => {
  assert.ok(
    errorsFor({ ...CLEAN, routes: { sweep: route({ runtime: '' }) } }).some((e) =>
      /declares no runtime/.test(e),
    ),
  );
  const edge = route({ runtime: "export const runtime = 'edge';" });
  assert.ok(errorsFor({ ...CLEAN, routes: { sweep: edge } }).some((e) => /does not allow/.test(e)));
});

test('a route that loops with no ceiling fails, and a declared reason clears it', () => {
  const looping = route({ loop: true });
  assert.ok(
    errorsFor({ ...CLEAN, routes: { sweep: looping } }).some((e) =>
      /loops without a declared per-run ceiling/.test(e),
    ),
  );

  assert.deepEqual(
    errorsFor({
      ...CLEAN,
      routes: { sweep: looping },
      contract: {
        ...CONTRACT,
        boundedByConstruction: [{ id: 'sweep', reason: 'it walks a constant in the repository' }],
      },
    }),
    [],
  );

  assert.deepEqual(
    errorsFor({ ...CLEAN, routes: { sweep: route({ loop: true, ceiling: true }) } }),
    [],
  );
});

test('a boundedByConstruction entry with no reason, or for a route that no longer loops, fails', () => {
  const noReason = errorsFor({
    ...CLEAN,
    routes: { sweep: route({ loop: true }) },
    contract: { ...CONTRACT, boundedByConstruction: [{ id: 'sweep', reason: '' }] },
  });
  assert.ok(noReason.some((error) => /carries no reason/.test(error)));

  const stale = errorsFor({
    ...CLEAN,
    contract: { ...CONTRACT, boundedByConstruction: [{ id: 'sweep', reason: 'was constant' }] },
  });
  assert.ok(stale.some((error) => /no longer loops/.test(error)));
});

test('an unscheduled route and a schedule with no route both fail', () => {
  assert.ok(errorsFor({ ...CLEAN, crons: [] }).some((e) => /so the route never runs/.test(e)));
  assert.ok(
    errorsFor({
      ...CLEAN,
      crons: [...CLEAN.crons, { path: '/api/cron/ghost', schedule: '0 4 * * *' }],
    }).some((e) => /which has no route on disk/.test(e)),
  );
});

test('a malformed schedule and a duplicated path both fail', () => {
  assert.ok(
    errorsFor({ ...CLEAN, crons: [{ path: '/api/cron/sweep', schedule: '0 3 * *' }] }).some((e) =>
      /not a five field expression/.test(e),
    ),
  );
  assert.ok(
    errorsFor({ ...CLEAN, crons: [...CLEAN.crons, ...CLEAN.crons] }).some((e) =>
      /the same path more than once/.test(e),
    ),
  );
});

test('two heavy routes firing in the same minute fail, and a declared collision needs a reason and a fix', () => {
  const colliding = {
    routes: { sweep: route(), purge: route() },
    crons: [
      { path: '/api/cron/sweep', schedule: '40 4 * * *' },
      { path: '/api/cron/purge', schedule: '40 4 * * *' },
    ],
  };
  const errors = errorsFor(colliding);
  assert.ok(errors.some((error) => /fire in the same minute every day/.test(error)));

  assert.deepEqual(
    errorsFor({
      ...colliding,
      contract: {
        ...CONTRACT,
        allowedCollisions: [
          { id: 'purge + sweep', reason: 'the schedule is frozen', fix: 'move purge to 50 4' },
        ],
      },
    }),
    [],
  );

  const noFix = errorsFor({
    ...colliding,
    contract: {
      ...CONTRACT,
      allowedCollisions: [{ id: 'purge + sweep', reason: 'the schedule is frozen' }],
    },
  });
  assert.ok(noFix.some((error) => /names no fix/.test(error)));
});

test('a light route sharing a minute with a heavy one is not a collision', () => {
  assert.deepEqual(
    errorsFor({
      routes: { sweep: route(), ping: route({ seconds: 60 }) },
      crons: [
        { path: '/api/cron/sweep', schedule: '40 4 * * *' },
        { path: '/api/cron/ping', schedule: '40 4 * * *' },
      ],
    }),
    [],
  );
});

test('a collision allowance that no longer applies fails', () => {
  const errors = errorsFor({
    ...CLEAN,
    contract: {
      ...CONTRACT,
      allowedCollisions: [{ id: 'a + b', reason: 'historic', fix: 'move one' }],
    },
  });
  assert.ok(errors.some((error) => /no longer collides/.test(error)));
});

test('an empty cron tree is reported rather than passing vacuously', () => {
  const { errors } = checkCronContract(fixture({ routes: {}, crons: [] }));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /no cron routes were read/);
});

test('the schedule helpers expand what the collision rule depends on', () => {
  assert.deepEqual([...firingMinutes('40 4 * * *')], ['04:40']);
  assert.equal(firingMinutes('*/30 * * * *').size, 48);
  assert.equal(firingMinutes('5,20,35,50 * * * *').size, 96);
  assert.equal(firingMinutes('0 3 * *'), null);
  assert.equal(firingMinutes('x 3 * * *'), null);
  assert.equal(isFixedHour('40 4 * * *'), true);
  assert.equal(isFixedHour('*/5 * * * *'), false);
});

test('a route that leaves no record fails', () => {
  const root = fixture({
    routes: { sweep: route({ record: false }) },
    crons: [{ path: '/api/cron/sweep', schedule: '0 4 * * *' }],
  });
  const { errors } = checkCronContract(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /emits no structured log/);
});

test('a route that can still be running when it next fires needs a declared mechanism', () => {
  const crons = [{ path: '/api/cron/drain', schedule: '*/5 * * * *' }];
  const routes = { drain: route({ seconds: 300 }) };

  const undeclared = fixture({ routes, crons });
  const first = checkCronContract(undeclared).errors;
  assert.equal(first.length, 1);
  assert.match(first[0], /fires every 300s and may run for 300s/);

  const declared = fixture({
    routes,
    crons,
    contract: { ...CONTRACT, overlapSafe: [{ id: 'drain', mechanism: 'each job is leased' }] },
  });
  assert.deepEqual(checkCronContract(declared).errors, []);

  const noMechanism = fixture({
    routes,
    crons,
    contract: { ...CONTRACT, overlapSafe: [{ id: 'drain', mechanism: '  ' }] },
  });
  assert.ok(checkCronContract(noMechanism).errors.some((e) => /names no mechanism/.test(e)));
});

test('a schedule that leaves room for the ceiling needs no declaration, and a stale one fails', () => {
  const routes = { drain: route({ seconds: 300 }) };
  const crons = [{ path: '/api/cron/drain', schedule: '*/10 * * * *' }];
  assert.deepEqual(checkCronContract(fixture({ routes, crons })).errors, []);

  const stale = fixture({
    routes,
    crons,
    contract: { ...CONTRACT, overlapSafe: [{ id: 'drain', mechanism: 'each job is leased' }] },
  });
  assert.match(checkCronContract(stale).errors[0], /overlapSafe still lists drain/);
});

test('the interval helper measures the gap the overlap rule depends on', () => {
  assert.equal(shortestInterval('*/5 * * * *'), 300);
  assert.equal(shortestInterval('0 4 * * *'), 86_400);
  assert.equal(shortestInterval('0,30 * * * *'), 1_800);
  assert.equal(shortestInterval('55 3 * * *'), 86_400);
  assert.equal(shortestInterval('0 23,0 * * *'), 3_600);
  assert.equal(shortestInterval('not a schedule'), null);
});

test('the record helper reads a structured log and not a bare console call', () => {
  assert.equal(leavesARecord("logger.info({ a }, 'done');"), true);
  assert.equal(leavesARecord("logger.warn('nothing to do');"), true);
  assert.equal(leavesARecord("console.log('done');"), false);
  assert.equal(leavesARecord('const logger = 1;'), false);
});
