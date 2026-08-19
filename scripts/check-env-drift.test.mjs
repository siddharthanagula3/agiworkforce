import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareEnvKeys,
  declaredContract,
  fetchProjectEnvKeys,
  formatDrift,
  hasDrift,
  run,
} from './check-env-drift.mjs';

const okResponse = (body) => ({ ok: true, status: 200, json: async () => body });

test('a deleted required variable is reported as drift', () => {
  const drift = compareEnvKeys({
    required: ['CLERK_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
    present: ['CLERK_SECRET_KEY'],
  });

  assert.deepEqual(drift.missing, ['STRIPE_WEBHOOK_SECRET']);
  assert.equal(hasDrift(drift), true);
});

test('an alternative-satisfied group is not drift, a fully deleted group is', () => {
  const groups = [
    ['UPSTASH_REDIS_REST_URL', 'KV_REST_API_URL'],
    ['UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_TOKEN'],
  ];

  const satisfied = compareEnvKeys({
    groups,
    present: ['KV_REST_API_URL', 'UPSTASH_REDIS_REST_TOKEN'],
  });
  assert.deepEqual(satisfied.unsatisfiedGroups, []);
  assert.equal(hasDrift(satisfied), false);

  const deleted = compareEnvKeys({ groups, present: ['KV_REST_API_URL'] });
  assert.deepEqual(deleted.unsatisfiedGroups, [['UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_TOKEN']]);
  assert.equal(hasDrift(deleted), true);
});

test('a security escape hatch configured in production is drift', () => {
  const drift = compareEnvKeys({
    forbidden: ['ACCOUNT_STATUS_FAIL_OPEN'],
    present: ['CLERK_SECRET_KEY', 'ACCOUNT_STATUS_FAIL_OPEN'],
  });

  assert.deepEqual(drift.forbiddenPresent, ['ACCOUNT_STATUS_FAIL_OPEN']);
  assert.equal(hasDrift(drift), true);
});

test('a fully configured environment reports no drift', () => {
  const drift = compareEnvKeys({
    required: ['CLERK_SECRET_KEY'],
    groups: [['DATABASE_URL', 'AGI_DATABASE_URL']],
    forbidden: ['ACCOUNT_STATUS_FAIL_OPEN'],
    present: ['CLERK_SECRET_KEY', 'AGI_DATABASE_URL', 'LOG_SALT'],
  });

  assert.deepEqual(drift, { missing: [], unsatisfiedGroups: [], forbiddenPresent: [] });
  assert.equal(hasDrift(drift), false);
});

test('the declared contract comes from the env-doctor contract, not a second list', () => {
  const production = declaredContract('web', 'production');

  assert.ok(production.required.includes('STRIPE_WEBHOOK_SECRET'));
  assert.ok(
    production.groups.some(
      (group) => group.includes('UPSTASH_REDIS_REST_URL') && group.includes('KV_REST_API_URL'),
    ),
  );
  assert.deepEqual(production.forbidden, [
    'ACCOUNT_STATUS_FAIL_OPEN',
    'AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY',
    'AGI_DURABLE_INITIAL_TURNS',
  ]);
  assert.deepEqual(declaredContract('web', 'preview').forbidden, []);
});

test('the durable-turn kill-switch configured in production is reconciled as drift', async () => {
  const posted = [];
  const contract = declaredContract('web', 'production');
  const present = [
    ...contract.required,
    ...contract.groups.map((group) => group[0]),
    'AGI_DURABLE_INITIAL_TURNS',
  ];

  const code = await run(
    ['--scope', 'web', '--target', 'production'],
    {
      VERCEL_TOKEN: 'token-under-test',
      VERCEL_PROJECT_ID: 'prj_under_test',
      PAGER_WEBHOOK_URL: 'https://pager.invalid/hook',
    },
    {
      fetchImpl: async (url, init) => {
        if (new URL(String(url)).hostname === 'pager.invalid') {
          posted.push(JSON.parse(init.body));
          return okResponse({});
        }
        return okResponse({ envs: present.map((key) => ({ key, target: ['production'] })) });
      },
    },
  );

  assert.equal(code, 1);
  assert.equal(posted.length, 1);
  assert.ok(posted[0].text.includes('escape hatch AGI_DURABLE_INITIAL_TURNS is configured'));
});

test('a fail-open rate-limit policy override in production is reconciled as drift', async () => {
  const posted = [];
  const contract = declaredContract('web', 'production');
  const present = [
    ...contract.required,
    ...contract.groups.map((group) => group[0]),
    'AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY',
  ];

  const code = await run(
    ['--scope', 'web', '--target', 'production'],
    {
      VERCEL_TOKEN: 'token-under-test',
      VERCEL_PROJECT_ID: 'prj_under_test',
      PAGER_WEBHOOK_URL: 'https://pager.invalid/hook',
    },
    {
      fetchImpl: async (url, init) => {
        if (new URL(String(url)).hostname === 'pager.invalid') {
          posted.push(JSON.parse(init.body));
          return okResponse({});
        }
        return okResponse({ envs: present.map((key) => ({ key, target: ['production'] })) });
      },
    },
  );

  assert.equal(code, 1);
  assert.equal(posted.length, 1);
  assert.ok(
    posted[0].text.includes('escape hatch AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY is configured'),
  );
});

test('only names are read from the Vercel listing, never values', async () => {
  let requestedUrl = '';
  const keys = await fetchProjectEnvKeys({
    token: 'token-under-test',
    projectId: 'prj_under_test',
    orgId: 'team_under_test',
    target: 'production',
    fetchImpl: async (url) => {
      requestedUrl = String(url);
      return okResponse({
        envs: [
          { key: 'CLERK_SECRET_KEY', target: ['production'], value: 'do-not-read-this' },
          { key: 'PREVIEW_ONLY', target: ['preview'], value: 'do-not-read-this' },
          { key: 'BRANCH_ONLY', target: ['production'], gitBranch: 'staging' },
          { key: 'LOG_SALT', target: 'production', value: 'do-not-read-this' },
        ],
      });
    },
  });

  assert.deepEqual(keys, ['CLERK_SECRET_KEY', 'LOG_SALT']);
  assert.ok(requestedUrl.includes('decrypt=false'));
  assert.ok(requestedUrl.includes('teamId=team_under_test'));
  assert.equal(JSON.stringify(keys).includes('do-not-read-this'), false);
});

test('drift pages the on-call webhook with names only and exits non-zero', async () => {
  const posted = [];
  const env = {
    VERCEL_TOKEN: 'token-under-test',
    VERCEL_PROJECT_ID: 'prj_under_test',
    PAGER_WEBHOOK_URL: 'https://pager.invalid/hook',
  };

  const code = await run(['--scope', 'web', '--target', 'production'], env, {
    fetchImpl: async (url, init) => {
      if (new URL(String(url)).hostname === 'pager.invalid') {
        posted.push(JSON.parse(init.body));
        return okResponse({});
      }
      return okResponse({
        envs: [{ key: 'CLERK_SECRET_KEY', target: ['production'], value: 'do-not-read-this' }],
      });
    },
  });

  assert.equal(code, 1);
  assert.equal(posted.length, 1);
  assert.equal(posted[0].source, 'env-drift');
  assert.ok(posted[0].text.includes('missing required STRIPE_WEBHOOK_SECRET'));
  assert.ok(posted[0].text.includes('UPSTASH_REDIS_REST_URL / KV_REST_API_URL'));
  assert.equal(posted[0].text.includes('do-not-read-this'), false);
});

test('a satisfied production environment exits zero and pages nobody', async () => {
  const posted = [];
  const contract = declaredContract('web', 'production');
  const present = [
    ...contract.required,
    ...contract.groups.map((group) => group[0]),
    'ACCOUNT_STATUS_FAIL_OPEN_LOOKALIKE',
  ];

  const code = await run(
    [],
    { VERCEL_TOKEN: 't', VERCEL_PROJECT_ID: 'p' },
    {
      fetchImpl: async (url) => {
        if (new URL(String(url)).hostname !== 'api.vercel.com') {
          posted.push(url);
          return okResponse({});
        }
        return okResponse({ envs: present.map((key) => ({ key, target: ['production'] })) });
      },
    },
  );

  assert.equal(code, 0);
  assert.deepEqual(posted, []);
});

test('a Vercel listing failure fails loudly instead of reporting a clean environment', async () => {
  const code = await run(
    [],
    { VERCEL_TOKEN: 't', VERCEL_PROJECT_ID: 'p' },
    {
      fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({}) }),
    },
  );

  assert.equal(code, 1);
});

test('missing deploy credentials fail loudly rather than silently passing', async () => {
  const code = await run(
    [],
    {},
    {
      fetchImpl: async () => {
        throw new Error('the network must not be reached without credentials');
      },
    },
  );

  assert.equal(code, 1);
});

test('the drift report names every deleted variable', () => {
  const report = formatDrift('web', 'production', {
    missing: ['LOG_SALT'],
    unsatisfiedGroups: [['UPSTASH_REDIS_REST_URL', 'KV_REST_API_URL']],
    forbiddenPresent: ['ACCOUNT_STATUS_FAIL_OPEN'],
  });

  assert.ok(report.includes('- missing required LOG_SALT'));
  assert.ok(report.includes('- missing one of UPSTASH_REDIS_REST_URL / KV_REST_API_URL'));
  assert.ok(report.includes('- escape hatch ACCOUNT_STATUS_FAIL_OPEN is configured'));
});

test('an unprovisioned artifact sandbox origin is production drift, not a silent fallback', () => {
  const production = declaredContract('web', 'production');
  assert.ok(production.required.includes('NEXT_PUBLIC_SANDBOX_ORIGIN'));

  const drift = compareEnvKeys({
    required: production.required,
    present: production.required.filter((name) => name !== 'NEXT_PUBLIC_SANDBOX_ORIGIN'),
  });
  assert.deepEqual(drift.missing, ['NEXT_PUBLIC_SANDBOX_ORIGIN']);
  assert.equal(hasDrift(drift), true);
});
