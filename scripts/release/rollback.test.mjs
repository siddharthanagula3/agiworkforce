import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RollbackError,
  chooseRollbackTarget,
  listProductionDeployments,
  parseArguments,
  readEnvironment,
  requestRollback,
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
