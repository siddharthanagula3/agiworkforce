import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  IDENTIFICATION_ONLY,
  MACHINE_PRINCIPALS,
  USER_PRINCIPALS,
} from './check-route-account-gate.mjs';

const script = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'check-route-account-gate.mjs',
);

const API_AUTH = `
import { getRequestIdentity } from '@/lib/server/identity';
import { assertTenantNotLockedDown } from '@/lib/feature-flags/tenant-lockdown';
export async function assertAccountActive(userId, request) {
  await assertTenantNotLockedDown(userId);
}
export async function getClerkAuthUser(request) {
  const { subject } = await getRequestIdentity();
  await assertAccountActive(subject, request);
  return { userId: subject };
}
export async function getOptionalAuthUser(request) {
  return getClerkAuthUser(request);
}
`;

const IDENTITY = `
export function getRequestIdentity() {
  return provider().currentRequestAuth();
}
`;

const RATE_LIMIT = `
export async function withRateLimit(request, bucket) {
  const { getRequestIdentity } = await import('./server/identity');
  const { subject } = await getRequestIdentity();
  return limiter(subject, bucket);
}
`;

const CRON_AUTH = `
export function assertCronSecret(request) {
  return request.headers.get('authorization') === secret();
}
`;

/** Every module the principal vocabulary names has to exist for the walk to mean anything. */
const VOCABULARY_STUBS = Object.fromEntries(
  [
    ...USER_PRINCIPALS.map(([module]) => module),
    ...MACHINE_PRINCIPALS.map(([module]) => module),
    ...IDENTIFICATION_ONLY.keys(),
  ]
    .filter((module) => module.startsWith('apps/') || module.startsWith('packages/'))
    .map((module) => [module, 'export function stub() {}\n']),
);

const BASE = {
  ...VOCABULARY_STUBS,
  'apps/web/lib/api-auth.ts': API_AUTH,
  'apps/web/lib/server/identity.ts': IDENTITY,
  'apps/web/lib/rate-limit.ts': RATE_LIMIT,
  'apps/web/lib/server/cron-auth.ts': CRON_AUTH,
  'apps/web/lib/feature-flags/tenant-lockdown.ts':
    'export async function assertTenantNotLockedDown() {}\n',
  'apps/web/app/api/gated/route.ts': `
import { getClerkAuthUser } from '@/lib/api-auth';
export async function GET(request) {
  const { userId } = await getClerkAuthUser(request);
  return json(userId);
}
`,
  'apps/web/app/api/limited/route.ts': `
import { withRateLimit } from '@/lib/rate-limit';
export async function GET(request) {
  return (await withRateLimit(request, 'default')) ?? json({ ok: true });
}
`,
  'apps/web/app/api/scheduled/route.ts': `
import { assertCronSecret } from '@/lib/server/cron-auth';
export async function POST(request) {
  assertCronSecret(request);
  return json({ ok: true });
}
`,
};

const CONTRACT = 'packages/contracts/types/src/route-authentication.json';

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'route-account-gate-'));
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents, 'utf8');
  }
  return root;
}

function run(root, options = {}) {
  try {
    return {
      code: 0,
      out: execFileSync(process.execPath, [script, '--root', root], {
        encoding: 'utf8',
        ...options,
      }),
    };
  } catch (error) {
    return { code: error.status, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

function contract(extra = {}) {
  return JSON.stringify({
    public: {
      'apps/web/app/api/limited/route.ts':
        'a rate limited endpoint that reads no account data at all',
    },
    machine: {
      'apps/web/app/api/scheduled/route.ts':
        'the platform scheduler authenticates with the cron secret',
    },
    sessionLifecycle: {},
    ...extra,
  });
}

test('a clean tree passes and counts each class', () => {
  const result = run(fixture({ ...BASE, [CONTRACT]: contract() }));
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /1 gated, 1 public, 1 machine, 0 session-lifecycle, 0 ungated-user/u);
});

test('a proven gate in a cycle does not authorize an unrelated raw principal', () => {
  const root = fixture({
    ...BASE,
    [CONTRACT]: contract(),
    'apps/web/lib/cycle-a.ts': `
      import { assertAccountActive } from '@/lib/api-auth';
      import { getRequestIdentity } from '@/lib/server/identity';
      import { back } from './cycle-b';
      export function front(request) {
        if (request.retry) return back(request);
        return assertAccountActive(request.userId, request);
      }
      export async function raw() { return (await getRequestIdentity()).subject; }
    `,
    'apps/web/lib/cycle-b.ts': `
      import { front } from './cycle-a';
      export function back(request) { return front(request); }
    `,
    'apps/web/app/api/cyclic/route.ts': `
      import { front } from '@/lib/cycle-a';
      export function GET(request) { return front(request); }
    `,
    'apps/web/app/api/raw/route.ts': `
      import { raw } from '@/lib/cycle-a';
      export async function GET() { return raw(); }
    `,
  });
  const result = run(root);
  assert.equal(result.code, 1);
  assert.match(result.out, /api\/raw\/route.ts authenticates a user and never reaches/u);
  assert.doesNotMatch(result.out, /FAIL .*api\/cyclic\/route.ts/u);
  assert.match(result.out, /2 gated, 1 public, 1 machine, 0 session-lifecycle, 1 ungated-user/u);
});

test('a route that authenticates a user without the gate fails', () => {
  const root = fixture({
    ...BASE,
    [CONTRACT]: contract(),
    'apps/web/app/api/ungated/route.ts': `
import { getRequestIdentity } from '@/lib/server/identity';
export async function POST(request) {
  const { subject } = await getRequestIdentity();
  if (!subject) throw unauthorized();
  return json(await readFor(subject));
}
`,
  });
  const result = run(root);
  assert.equal(result.code, 1);
  assert.match(result.out, /api\/ungated\/route\.ts authenticates a user and never reaches/u);
});

test('the gate reached only through a dynamic import still counts as gated', () => {
  const root = fixture({
    ...BASE,
    [CONTRACT]: contract(),
    'apps/web/app/api/deferred/route.ts': `
export async function POST(request) {
  const { getClerkAuthUser } = await import('@/lib/api-auth');
  return json((await getClerkAuthUser(request)).userId);
}
`,
  });
  const result = run(root);
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /2 gated,/u);
});

test('an undeclared public route fails, and declaring it is what clears it', () => {
  const files = {
    ...BASE,
    'apps/web/app/api/status/route.ts':
      'export function GET() {\n  return json({ ok: true });\n}\n',
  };
  const undeclared = run(fixture({ ...files, [CONTRACT]: contract() }));
  assert.equal(undeclared.code, 1);
  assert.match(undeclared.out, /api\/status\/route\.ts is public and is not declared/u);

  const declared = run(
    fixture({
      ...files,
      [CONTRACT]: contract({
        public: {
          'apps/web/app/api/limited/route.ts':
            'a rate limited endpoint that reads no account data at all',
          'apps/web/app/api/status/route.ts': 'a liveness probe that reads no account data',
        },
      }),
    }),
  );
  assert.equal(declared.code, 0, declared.out);
});

test('a declared route that gains user authentication fails as stale', () => {
  const root = fixture({
    ...BASE,
    'apps/web/app/api/limited/route.ts': `
import { getRequestIdentity } from '@/lib/server/identity';
export async function GET() {
  const { subject } = await getRequestIdentity();
  return json(await readFor(subject));
}
`,
    [CONTRACT]: contract(),
  });
  const result = run(root);
  assert.equal(result.code, 1);
  assert.match(result.out, /is declared public and authenticates a ungated-user principal now/u);
});

test('a declaration for a route that now reaches the gate fails as stale', () => {
  const root = fixture({
    ...BASE,
    'apps/web/app/api/limited/route.ts': `
import { getClerkAuthUser } from '@/lib/api-auth';
export async function GET(request) {
  return json((await getClerkAuthUser(request)).userId);
}
`,
    [CONTRACT]: contract(),
  });
  const result = run(root);
  assert.equal(result.code, 1);
  assert.match(result.out, /is still declared public; drop the entry/u);
});

test('a reason nobody can read is not a declaration', () => {
  const root = fixture({
    ...BASE,
    [CONTRACT]: contract({
      public: { 'apps/web/app/api/limited/route.ts': 'public' },
    }),
  });
  const result = run(root);
  assert.equal(result.code, 1);
  assert.match(result.out, /with no reason worth reading/u);
});

test('removing the gate call from a helper names the routes that lost it', () => {
  const root = fixture({
    ...BASE,
    'apps/web/lib/api-auth.ts': API_AUTH.replace(
      '  await assertAccountActive(subject, request);\n',
      '',
    ),
    [CONTRACT]: contract(),
  });
  const result = run(root);
  assert.equal(result.code, 1);
  assert.match(result.out, /api\/gated\/route\.ts authenticates a user and never reaches/u);
});

test('the vocabulary fails when a module it names is gone', () => {
  const files = { ...BASE, [CONTRACT]: contract() };
  delete files['apps/web/lib/server/cron-auth.ts'];
  files['apps/web/app/api/scheduled/route.ts'] =
    'export function POST() {\n  return json({});\n}\n';
  const result = run(fixture(files));
  assert.equal(result.code, 1);
  assert.match(result.out, /vocabulary names apps\/web\/lib\/server\/cron-auth\.ts/u);
});

test('a known gate settles before a dense cyclic branch', (t) => {
  const count = 30;
  const branches = Array.from(
    { length: count },
    (_, index) =>
      `export function branch${index}() { return branch${(index + 1) % count}() + branch${(index + 2) % count}(); }`,
  ).join('\n');
  const root = fixture({
    ...BASE,
    [CONTRACT]: contract(),
    'apps/web/lib/cyclic-branch.ts': branches,
    'apps/web/app/api/cyclic/route.ts': `
import { getClerkAuthUser } from '@/lib/api-auth';
import { branch0 } from '@/lib/cyclic-branch';
export async function POST(request) {
  const { userId } = await getClerkAuthUser(request);
  return json({ userId, value: branch0() });
}
`,
  });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = run(root, { timeout: 5_000 });
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /2 gated, 1 public, 1 machine/u);
});

test('gate evidence crosses a cycle without hiding a second ungated cycle', (t) => {
  const cyclic = `
import { getRequestIdentity } from '@/lib/server/identity';
import { assertAccountActive } from '@/lib/api-auth';
export async function first() { return second(); }
export async function second() {
  await first();
  const { subject } = await getRequestIdentity();
  await assertAccountActive(subject);
  return subject;
}
`;
  const files = {
    ...BASE,
    [CONTRACT]: contract(),
    'apps/web/lib/cyclic-auth.ts': cyclic,
    'apps/web/app/api/cycle-first/route.ts': `
import { first } from '@/lib/cyclic-auth';
export function GET() { return first(); }
`,
    'apps/web/app/api/cycle-second/route.ts': `
import { second } from '@/lib/cyclic-auth';
export function GET() { return second(); }
`,
  };
  const gatedRoot = fixture(files);
  const ungatedRoot = fixture({
    ...files,
    'apps/web/lib/cyclic-auth.ts': cyclic.replace('  await assertAccountActive(subject);\n', ''),
  });
  t.after(() => {
    fs.rmSync(gatedRoot, { recursive: true, force: true });
    fs.rmSync(ungatedRoot, { recursive: true, force: true });
  });
  const gated = run(gatedRoot);
  assert.equal(gated.code, 0, gated.out);
  assert.match(gated.out, /3 gated, 1 public, 1 machine/u);
  const ungated = run(ungatedRoot);
  assert.equal(ungated.code, 1, ungated.out);
  assert.match(ungated.out, /api\/cycle-first\/route.ts authenticates a user and never reaches/u);
  assert.match(ungated.out, /api\/cycle-second\/route.ts authenticates a user and never reaches/u);
});
