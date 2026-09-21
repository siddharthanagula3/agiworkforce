import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CONTRACT_PATH,
  REPO_ROOT,
  checkAuthSurface,
  cookieWrites,
  findAuthRoutes,
} from './check-auth-surface.mjs';

const roots = [];

function write(root, relativePath, contents) {
  const absolute = path.join(root, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

const RATE_LIMIT_SOURCE =
  'export async function withRateLimit() {}\n' + 'export async function checkRateLimit() {}\n';

const CLEAN_ROUTE =
  "import { withRateLimit } from '@/lib/rate-limit';\n" +
  "import { recordAuditEvent } from '@/lib/security-audit';\n" +
  'export async function POST() {\n  await withRateLimit();\n  await recordAuditEvent();\n}\n';

const MIGRATION =
  'create table if not exists public.api_keys (\n' +
  '  id uuid primary key,\n' +
  '  key_hash text not null\n' +
  ');\n';

function contractFor(overrides = {}) {
  return {
    why: 'the auth surface',
    routeRoots: ['apps/web/app/api/auth'],
    rateLimit: {
      declaredIn: 'apps/web/lib/rate-limit.ts',
      helpers: ['withRateLimit', 'checkRateLimit'],
      why: 'an unthrottled credential endpoint is a free guessing machine',
    },
    audit: {
      decisionRegistry: 'apps/web/lib/services/audit-coverage/registry.ts',
      emitters: ['recordAuditEvent'],
      why: 'a sign-in nobody recorded cannot be disputed',
      defects: [],
    },
    session: {
      module: 'apps/web/lib/api-auth.ts',
      forbiddenImports: ['@clerk/nextjs/server'],
      why: 'an identity resolved a second way is a second set of rules',
    },
    cookies: {
      roots: ['apps/web/app'],
      required: ['httpOnly', 'secure', 'sameSite'],
      why: 'a session cookie without all three is readable by script',
    },
    tokenColumns: {
      tables: ['api_keys'],
      match: '(?:^|_)(?:token|secret|password)$',
      safe: '_hash$|_enc$',
      defects: [],
    },
    analytics: {
      vocabulary: 'packages/contracts/types/src/product-analytics.ts',
      symbol: 'PRODUCT_ANALYTICS_PROPERTY_KEYS',
      forbidden: 'password|secret|token',
      why: 'an analytics property is copied to a third party by definition',
    },
    ...overrides,
  };
}

function fixture(contract = contractFor(), files = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'auth-surface-'));
  roots.push(root);
  execFileSync('git', ['-C', root, 'init', '--quiet']);
  write(root, CONTRACT_PATH, JSON.stringify(contract));
  write(root, 'apps/web/lib/rate-limit.ts', RATE_LIMIT_SOURCE);
  write(
    root,
    'apps/web/lib/services/audit-coverage/registry.ts',
    'export const UNAUDITED_MUTATING_ROUTES = [];\n',
  );
  write(root, 'apps/web/app/api/auth/session/route.ts', CLEAN_ROUTE);
  write(root, 'apps/web/db/neon/0001_keys.sql', MIGRATION);
  write(
    root,
    'packages/contracts/types/src/product-analytics.ts',
    "export const PRODUCT_ANALYTICS_PROPERTY_KEYS = ['planTier', 'provider'] as const;\n",
  );
  for (const [relativePath, contents] of Object.entries(files)) write(root, relativePath, contents);
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('the real guard passes on the repository as it stands', () => {
  assert.deepEqual(checkAuthSurface(REPO_ROOT).errors, []);
});

test('the auth routes are found by walking the tree', () => {
  const routes = findAuthRoutes(REPO_ROOT, ['apps/web/app/api/auth']);
  assert.ok(routes.length > 5, routes.join('\n'));
  assert.ok(routes.every((route) => route.endsWith('/route.ts')));
});

test('a clean auth surface passes', () => {
  assert.deepEqual(checkAuthSurface(fixture()).errors, []);
});

test('an auth route that throttles nothing fails', () => {
  const root = fixture(contractFor(), {
    'apps/web/app/api/auth/session/route.ts':
      "import { recordAuditEvent } from '@/lib/security-audit';\n" +
      'export async function POST() {\n  await recordAuditEvent();\n}\n',
  });
  const { errors } = checkAuthSurface(root);
  assert.ok(
    errors.some((error) => error.includes('throttles nothing')),
    errors.join('\n'),
  );
});

test('an auth route that records nothing and is not decided fails', () => {
  const root = fixture(contractFor(), {
    'apps/web/app/api/auth/session/route.ts':
      "import { withRateLimit } from '@/lib/rate-limit';\n" +
      'export async function POST() {\n  await withRateLimit();\n}\n',
  });
  const { errors } = checkAuthSurface(root);
  assert.ok(
    errors.some((error) => error.includes('records nothing')),
    errors.join('\n'),
  );
});

test('a route recorded in the decision registry needs no emitter', () => {
  const root = fixture(contractFor(), {
    'apps/web/app/api/auth/session/route.ts':
      "import { withRateLimit } from '@/lib/rate-limit';\n" +
      'export async function POST() {\n  await withRateLimit();\n}\n',
    'apps/web/lib/services/audit-coverage/registry.ts':
      "export const UNAUDITED_MUTATING_ROUTES = [{ route: 'auth/session/route.ts', reason: 'no_governed_state' }];\n",
  });
  assert.deepEqual(checkAuthSurface(root).errors, []);
});

test('a recorded audit gap the route has since closed is stale and fails', () => {
  const contract = contractFor();
  contract.audit.defects = [
    {
      route: 'apps/web/app/api/auth/session/route.ts',
      why: 'nothing records it',
      fix: 'record it',
    },
  ];
  const { errors } = checkAuthSurface(fixture(contract));
  assert.ok(
    errors.some((error) => error.includes('is stale, the route now records')),
    errors.join('\n'),
  );
});

test('an auth route resolving identity through the vendor directly fails', () => {
  const root = fixture(contractFor(), {
    'apps/web/app/api/auth/session/route.ts': `${CLEAN_ROUTE}import { auth } from '@clerk/nextjs/server';\n`,
  });
  const { errors } = checkAuthSurface(root);
  assert.ok(
    errors.some((error) => error.includes('rather than apps/web/lib/api-auth.ts')),
    errors.join('\n'),
  );
});

test('a session cookie missing a flag fails and a clearing write is left alone', () => {
  const root = fixture(contractFor(), {
    'apps/web/app/api/auth/cookie/route.ts':
      "import { cookies } from 'next/headers';\n" +
      'export async function POST() {\n' +
      '  const cookieStore = await cookies();\n' +
      "  cookieStore.set({ name: 'session', value: 'x', path: '/' });\n" +
      "  cookieStore.set({ name: 'old', value: '', maxAge: 0 });\n" +
      '}\n',
  });
  const { errors } = checkAuthSurface(root);
  const cookieErrors = errors.filter((error) => error.includes('writes a cookie without'));
  assert.equal(cookieErrors.length, 1, errors.join('\n'));
  assert.ok(cookieErrors[0].includes('httpOnly, secure, sameSite'));
});

test('cookie writes are read as whole call expressions', () => {
  const writes = cookieWrites(
    "cookieStore.set({ name: 'a', value: fn({ nested: true }), httpOnly: true });\n",
  );
  assert.equal(writes.length, 1);
  assert.ok(writes[0].includes('httpOnly'));
});

test('a bearer column stored in clear text fails', () => {
  const root = fixture(contractFor(), {
    'apps/web/db/neon/0001_keys.sql':
      'create table if not exists public.api_keys (\n  id uuid primary key,\n  token text not null\n);\n',
  });
  const { errors } = checkAuthSurface(root);
  assert.ok(
    errors.some((error) => error.includes('api_keys.token holds a bearer value in clear text')),
    errors.join('\n'),
  );
});

test('a recorded bearer column that has since been hashed is stale and fails', () => {
  const contract = contractFor();
  contract.tokenColumns.defects = [{ column: 'api_keys.token', why: 'plain text', fix: 'hash it' }];
  const { errors } = checkAuthSurface(fixture(contract));
  assert.ok(
    errors.some((error) => error.includes('no longer matches a column')),
    errors.join('\n'),
  );
});

test('a credential-shaped analytics property fails', () => {
  const root = fixture(contractFor(), {
    'packages/contracts/types/src/product-analytics.ts':
      "export const PRODUCT_ANALYTICS_PROPERTY_KEYS = ['planTier', 'apiToken'] as const;\n",
  });
  const { errors } = checkAuthSurface(root);
  assert.ok(
    errors.some((error) => error.includes('carries "apiToken"')),
    errors.join('\n'),
  );
});
