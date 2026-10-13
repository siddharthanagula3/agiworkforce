import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RollbackError,
  chooseRollbackTarget,
  listProductionDeployments,
  parseArguments,
  readEnvironment,
  requestRollback,
  runRollback,
  teamQuery,
} from './rollback.mjs';

const CONFIG = { token: 'token', orgId: 'team_abc', projectId: 'prj_1' };

const SERVING = { id: 'dpl_new', createdAt: 3000 };
const DEPLOYMENTS = [
  { uid: 'dpl_rejected', readyState: 'READY', createdAt: 4000 },
  { uid: 'dpl_new', readyState: 'READY', createdAt: 3000 },
  { uid: 'dpl_good', readyState: 'READY', createdAt: 2000 },
  { uid: 'dpl_broken', readyState: 'ERROR', createdAt: 2500 },
  { uid: 'dpl_older', readyState: 'READY', createdAt: 1000 },
];

test('a rollback without a reason is refused', () => {
  assert.throws(() => parseArguments([]), RollbackError);
  assert.deepEqual(parseArguments(['--reason', 'bad deploy']).reason, 'bad deploy');
});

test('a drill never acts', () => {
  const options = parseArguments(['--drill']);
  assert.equal(options.drill, true);
  assert.equal(options.dryRun, true);
});

test('an unknown argument is refused rather than ignored', () => {
  assert.throws(() => parseArguments(['--force']), RollbackError);
});

test('a missing credential names itself instead of failing at the API', () => {
  assert.throws(
    () => readEnvironment({ VERCEL_TOKEN: 'token' }),
    (error) =>
      error.details.includes('VERCEL_ORG_ID') && error.details.includes('VERCEL_PROJECT_ID'),
  );
});

test('a personal account sends no teamId', () => {
  assert.equal(teamQuery('prj_personal').get('teamId'), null);
  assert.equal(teamQuery('team_abc').get('teamId'), 'team_abc');
});

test('the target is the newest ready deployment older than the one serving', () => {
  const target = chooseRollbackTarget(SERVING, DEPLOYMENTS);
  assert.equal(target.uid, 'dpl_good');
});

test('a deployment that was already rolled back away from is never the target', () => {
  const target = chooseRollbackTarget(SERVING, DEPLOYMENTS);
  assert.notEqual(target.uid, 'dpl_rejected');
});

test('a failed build is never the target', () => {
  const target = chooseRollbackTarget({ id: 'dpl_new', createdAt: 3000 }, [
    { uid: 'dpl_broken', readyState: 'ERROR', createdAt: 2900 },
    { uid: 'dpl_good', readyState: 'READY', createdAt: 2000 },
  ]);
  assert.equal(target.uid, 'dpl_good');
});

test('an explicit target must be a ready production deployment', () => {
  assert.equal(chooseRollbackTarget(SERVING, DEPLOYMENTS, 'dpl_older').uid, 'dpl_older');
  assert.throws(() => chooseRollbackTarget(SERVING, DEPLOYMENTS, 'dpl_broken'), RollbackError);
  assert.throws(() => chooseRollbackTarget(SERVING, DEPLOYMENTS, 'dpl_unknown'), RollbackError);
});

test('rolling back to the deployment already serving is refused', () => {
  assert.throws(() => chooseRollbackTarget(SERVING, DEPLOYMENTS, 'dpl_new'), RollbackError);
});

test('a project with no earlier deployment refuses rather than picking the current one', () => {
  assert.throws(
    () =>
      chooseRollbackTarget({ id: 'dpl_only', createdAt: 1 }, [
        { uid: 'dpl_only', readyState: 'READY', createdAt: 1 },
      ]),
    RollbackError,
  );
  assert.throws(() => chooseRollbackTarget(null, DEPLOYMENTS), RollbackError);
});

test('the deployment listing asks only for ready production builds', async () => {
  let seen = null;
  await listProductionDeployments(async (url) => {
    seen = new URL(url);
    return { ok: true, json: async () => ({ deployments: DEPLOYMENTS }) };
  }, CONFIG);

  assert.equal(seen.searchParams.get('target'), 'production');
  assert.equal(seen.searchParams.get('state'), 'READY');
  assert.equal(seen.searchParams.get('projectId'), 'prj_1');
  assert.equal(seen.searchParams.get('teamId'), 'team_abc');
});

test('the rollback call carries the reason and builds nothing', async () => {
  let seen = null;
  let method = null;
  await requestRollback(
    async (url, init) => {
      seen = new URL(url);
      method = init.method;
      return { ok: true, json: async () => ({}) };
    },
    CONFIG,
    'dpl_good',
    'verification failed',
  );

  assert.equal(method, 'POST');
  assert.equal(seen.pathname, '/v1/projects/prj_1/rollback/dpl_good');
  assert.equal(seen.searchParams.get('description'), 'verification failed');
});

test('a refused rollback is an error, not a silent no-op', async () => {
  await assert.rejects(
    () => requestRollback(async () => ({ ok: false, status: 403 }), CONFIG, 'dpl_good', 'why'),
    RollbackError,
  );
});

function recordingFetch(calls) {
  return async (url, init = {}) => {
    calls.push({ url, method: init.method ?? 'GET' });
    if (url.includes('/v9/projects/')) {
      return { ok: true, status: 200, json: async () => ({ targets: { production: SERVING } }) };
    }
    if (url.includes('/v6/deployments')) {
      return { ok: true, status: 200, json: async () => ({ deployments: DEPLOYMENTS }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };
}

const ENV = {
  VERCEL_TOKEN: 'token',
  VERCEL_ORG_ID: 'team_abc',
  VERCEL_PROJECT_ID: 'prj_1',
  GITHUB_ACTOR: 'operator',
};

test('a dry run resolves the plan and issues no write of any kind', async () => {
  const calls = [];
  const result = await runRollback({
    argv: ['--dry-run', '--reason', 'checking the path'],
    env: ENV,
    fetchImpl: recordingFetch(calls),
  });

  assert.deepEqual(result, { rolledBack: false, targetId: 'dpl_good', currentId: 'dpl_new' });
  assert.deepEqual(
    calls.map((call) => call.method),
    ['GET', 'GET'],
  );
  assert.ok(!calls.some((call) => call.url.includes('/rollback/')));
});

test('a dry run writes no audit event, so it cannot be mistaken for a rollback', async () => {
  const calls = [];
  await runRollback({
    argv: ['--dry-run', '--reason', 'checking the path'],
    env: { ...ENV, AGI_DATABASE_URL: 'postgresql://127.0.0.1:1/nothing-listens-here' },
    fetchImpl: recordingFetch(calls),
  });
  assert.equal(calls.length, 2);
});

test('a real rollback posts to the rollback endpoint after reading the plan', async () => {
  const calls = [];
  const result = await runRollback({
    argv: ['--reason', 'bad deploy'],
    env: ENV,
    fetchImpl: recordingFetch(calls),
  });

  assert.equal(result.rolledBack, true);
  assert.equal(result.targetId, 'dpl_good');
  const write = calls.find((call) => call.method === 'POST');
  assert.ok(write, 'no POST was made');
  assert.ok(write.url.includes('/rollback/dpl_good'));
  assert.ok(decodeURIComponent(write.url).includes('description=bad+deploy'));
});

for (const env of [{}, { VERCEL_TOKEN: 'fixture-token', VERCEL_ORG_ID: ' \t ' }]) {
  test(`a drill reports missing prerequisites without contacting Vercel or the database (${Object.keys(env).join(', ') || 'all missing'})`, async () => {
    const reports = [];
    const result = await runRollback({
      argv: ['--drill'],
      env,
      fetchImpl: () => assert.fail('an unconfigured drill must not contact Vercel'),
      recordEventImpl: () => assert.fail('an unconfigured drill must not write an audit event'),
      report: (report) => reports.push(report),
    });

    const missing = env.VERCEL_TOKEN
      ? ['VERCEL_ORG_ID', 'VERCEL_PROJECT_ID']
      : ['VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID'];
    assert.deepEqual(result, { rolledBack: false, notRun: true, missing });
    assert.equal(reports.length, 1);
    for (const name of missing) {
      assert.ok(reports[0].reason.includes(name));
      assert.ok(reports[0].unblockedBy.includes(name));
    }
    if (env.VERCEL_TOKEN) assert.ok(!reports[0].reason.includes('VERCEL_TOKEN'));
    assert.ok(!JSON.stringify(reports).includes('fixture-token'));
    assert.equal(reports[0].flawId, 'CI-ROLLBACK-DRILL-CONFIG-MISSING-01');
  });
}

for (const argv of [
  ['--reason', 'fixture'],
  ['--dry-run', '--reason', 'fixture'],
]) {
  test(`missing credentials still block a rollback outside the drill (${argv.join(' ')})`, async () => {
    await assert.rejects(
      runRollback({
        argv,
        env: {},
        fetchImpl: () => assert.fail('missing credentials must stop before the API'),
        recordEventImpl: () => assert.fail('missing credentials must stop before audit storage'),
        report: () => assert.fail('only a drill may report missing prerequisites'),
      }),
      RollbackError,
    );
  });
}

test('a configured drill resolves its target and records the drill without requesting rollback', async () => {
  const calls = [];
  const events = [];
  const result = await runRollback({
    argv: ['--drill', '--reason', 'fixture drill'],
    env: { ...ENV, AGI_DATABASE_URL: 'postgresql://fixture.invalid/audit' },
    fetchImpl: recordingFetch(calls),
    recordEventImpl: async (_config, event) => events.push(event),
    report: () => assert.fail('configured drills must not report a missing prerequisite'),
  });

  assert.deepEqual(result, { rolledBack: false, targetId: 'dpl_good', currentId: 'dpl_new' });
  assert.deepEqual(
    calls.map((call) => call.method),
    ['GET', 'GET'],
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].event, 'rollback_drill');
  assert.equal(events[0].outcome, 'succeeded');
  assert.equal(events[0].deploymentId, 'dpl_good');
});

test('a configured drill fails when Vercel refuses its credentials', async () => {
  await assert.rejects(
    runRollback({
      argv: ['--drill'],
      env: ENV,
      fetchImpl: async () => ({ ok: false, status: 403 }),
      recordEventImpl: () => assert.fail('a failed lookup must not record success'),
      report: () => assert.fail('an API failure is not a missing prerequisite'),
    }),
    /Vercel project lookup returned 403/u,
  );
});

test('a configured drill fails when there is no earlier ready deployment', async () => {
  await assert.rejects(
    runRollback({
      argv: ['--drill'],
      env: ENV,
      fetchImpl: async (url) => ({
        ok: true,
        json: async () =>
          url.includes('/v9/projects/')
            ? { targets: { production: SERVING } }
            : { deployments: [] },
      }),
      recordEventImpl: () => assert.fail('a failed resolution must not record success'),
      report: () => assert.fail('a failed resolution is not missing configuration'),
    }),
    /No earlier ready production deployment/u,
  );
});

test('a configured drill preserves an audit-storage failure', async () => {
  await assert.rejects(
    runRollback({
      argv: ['--drill'],
      env: { ...ENV, AGI_DATABASE_URL: 'postgresql://fixture.invalid/audit' },
      fetchImpl: recordingFetch([]),
      recordEventImpl: async () => {
        throw new Error('fixture audit write failed');
      },
      report: () => assert.fail('an audit-storage failure is not a missing prerequisite'),
    }),
    /fixture audit write failed/u,
  );
});
