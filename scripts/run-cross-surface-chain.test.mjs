import assert from 'node:assert/strict';
import test from 'node:test';

import { runChain } from './run-cross-surface-chain.mjs';

const TENANT = {
  id: 'QA_ENTERPRISE_TENANT_ID',
  token: 'QA_ENTERPRISE_TENANT_TOKEN',
  unblockedBy:
    'Create the QA enterprise tenant and add QA_ENTERPRISE_TENANT_ID and QA_ENTERPRISE_TENANT_TOKEN repository secrets.',
};
const ENV = {
  QA_ENTERPRISE_TENANT_ID: 'fixture-tenant',
  QA_ENTERPRISE_TENANT_TOKEN: 'fixture-token',
};
const CHAIN = {
  tenant: TENANT,
  surfaces: { web: { drivable: true } },
  steps: [
    {
      order: 1,
      title: 'First step',
      surface: 'web',
      status: 'covered',
      command: 'first-fixture-command',
    },
    {
      order: 2,
      title: 'Second step',
      surface: 'web',
      status: 'covered',
      command: 'second-fixture-command',
    },
  ],
};

for (const env of [
  {},
  { QA_ENTERPRISE_TENANT_ID: 'fixture-tenant', QA_ENTERPRISE_TENANT_TOKEN: ' \t ' },
]) {
  test(`the absent tenant reports exactly its missing secrets (${Object.keys(env).length} entries)`, () => {
    const reports = [];
    const code = runChain({
      env,
      chainSpec: CHAIN,
      spawnImpl: () => assert.fail('no chain step may run without both tenant credentials'),
      report: (report) => reports.push(report),
    });

    assert.equal(code, 0);
    assert.equal(reports.length, 1);
    assert.match(reports[0].reason, /QA_ENTERPRISE_TENANT_TOKEN/u);
    assert.equal(
      reports[0].reason.includes('QA_ENTERPRISE_TENANT_ID'),
      !env.QA_ENTERPRISE_TENANT_ID,
    );
    assert.match(reports[0].reason, /0 of 2 §110 steps executed/u);
    assert.match(reports[0].details, /First step/u);
    assert.match(reports[0].details, /Second step/u);
    assert.equal(reports[0].unblockedBy, TENANT.unblockedBy);
    assert.equal(reports[0].flawId, 'CI-CROSS-SURFACE-TENANT-MISSING-01');
    assert.ok(!JSON.stringify(reports).includes('fixture-tenant'));
  });
}

test('configured credentials do not turn a chain with no runnable steps green', () => {
  const code = runChain({
    env: ENV,
    chainSpec: { ...CHAIN, steps: CHAIN.steps.map((step) => ({ ...step, status: 'blocked' })) },
    spawnImpl: () => assert.fail('blocked steps must not execute'),
    report: () => assert.fail('a configured tenant is not a missing prerequisite'),
  });

  assert.equal(code, 1);
});

for (const statuses of [
  [0, 0],
  [1, 0],
  [0, 1],
  [null, 0],
]) {
  test(`configured chain preserves execution failures (${statuses.join(', ')})`, () => {
    const calls = [];
    const code = runChain({
      env: ENV,
      chainSpec: CHAIN,
      spawnImpl: (...args) => {
        calls.push(args);
        return { status: statuses[calls.length - 1] };
      },
      report: () => assert.fail('a configured chain must not report a missing prerequisite'),
    });

    assert.equal(code, statuses.every((status) => status === 0) ? 0 : 1);
    assert.equal(calls.length, 2);
    assert.deepEqual(
      calls.map((call) => call.slice(0, 2)),
      [
        ['bash', ['-lc', CHAIN.steps[0].command]],
        ['bash', ['-lc', CHAIN.steps[1].command]],
      ],
    );
    assert.equal(calls[0][2].env, ENV);
  });
}
