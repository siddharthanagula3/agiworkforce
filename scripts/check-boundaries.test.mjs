import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const GUARD = path.join(REPO_ROOT, 'scripts', 'check-boundaries.mjs');

const sandboxes = [];
function makeSandbox(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'check-boundaries-'));
  sandboxes.push(dir);
  for (const [rel, contents] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, contents, 'utf8');
  }
  return dir;
}
after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

function runOnSandbox(files) {
  const sandbox = makeSandbox(files);
  const result = spawnSync(process.execPath, [GUARD], { cwd: sandbox, encoding: 'utf8' });
  return result;
}

const EMPTY_ALLOWLIST = JSON.stringify({ schemaVersion: 1, entries: [] });
const EMPTY_IDENTITY_ALLOWLIST = 'scripts/config/identity-sdk-allowlist.json';

test('the real guard passes on the repository as it stands', () => {
  const result = spawnSync(process.execPath, [GUARD], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, `expected clean repo, got:\n${result.stderr}${result.stdout}`);
});

test('fails a route that starts managed compute with no evaluator call and no allowlist entry', () => {
  const result = runOnSandbox({
    'apps/web/app/api/example/route.ts':
      'export async function POST() { await reserveManagedUsageRequest({}); }\n',
    'scripts/config/managed-compute-evaluator-allowlist.json': EMPTY_ALLOWLIST,
  });
  assert.equal(result.status, 1, 'guard should reject an ungated managed-compute route');
  assert.match(result.stderr, /reserveManagedUsageRequest/);
  assert.match(result.stderr, /evaluateManagedComputeAccess/);
});

test('passes a route that starts managed compute and calls the composed evaluator', () => {
  const result = runOnSandbox({
    'apps/web/app/api/example/route.ts': [
      "import { evaluateManagedComputeAccess } from '@/lib/services/managed-compute-access';",
      'export async function POST() {',
      '  await evaluateManagedComputeAccess(db, userId, subscription, surface, scope);',
      '  await reserveManagedUsageRequest({});',
      '}',
      '',
    ].join('\n'),
    'scripts/config/managed-compute-evaluator-allowlist.json': EMPTY_ALLOWLIST,
  });
  assert.equal(result.status, 0, `expected pass, got:\n${result.stderr}${result.stdout}`);
});

test('passes an ungated route once it carries an allowlist entry with a reason', () => {
  const result = runOnSandbox({
    'apps/web/app/api/example/route.ts':
      'export async function POST() { await reserveManagedUsageRequest({}); }\n',
    'scripts/config/managed-compute-evaluator-allowlist.json': JSON.stringify({
      schemaVersion: 1,
      entries: [
        {
          path: 'apps/web/app/api/example/route.ts',
          reason:
            'workspace policy and spend limit are checked separately, see the sibling gate file.',
        },
      ],
    }),
  });
  assert.equal(result.status, 0, `expected pass, got:\n${result.stderr}${result.stdout}`);
});

test('ignores a route that never starts managed compute', () => {
  const result = runOnSandbox({
    'apps/web/app/api/example/route.ts':
      "export async function GET() { return new Response('ok'); }\n",
    'scripts/config/managed-compute-evaluator-allowlist.json': EMPTY_ALLOWLIST,
  });
  assert.equal(result.status, 0, `expected pass, got:\n${result.stderr}${result.stdout}`);
});

test('ignores a starter marker outside apps/web/app/api', () => {
  const result = runOnSandbox({
    'apps/web/lib/services/managed-usage-request-service.ts':
      'export async function reserveManagedUsageRequest() {}\n',
    'scripts/config/managed-compute-evaluator-allowlist.json': EMPTY_ALLOWLIST,
  });
  assert.equal(result.status, 0, `expected pass, got:\n${result.stderr}${result.stdout}`);
});

test('fails on a stale allowlist entry for a route that no longer needs one', () => {
  const result = runOnSandbox({
    'apps/web/app/api/example/route.ts':
      "export async function GET() { return new Response('ok'); }\n",
    'scripts/config/managed-compute-evaluator-allowlist.json': JSON.stringify({
      schemaVersion: 1,
      entries: [{ path: 'apps/web/app/api/example/route.ts', reason: 'no longer needed' }],
    }),
  });
  assert.equal(result.status, 1, 'guard should reject a stale allowlist entry');
  assert.match(result.stderr, /no longer need/);
});

test('the real allowlist has an entry for every currently-ungated managed-compute route', () => {
  const seededPaths = [
    'apps/web/app/api/llm/v1/embeddings/route.ts',
    'apps/web/app/api/llm/v1/audio/transcriptions/route.ts',
    'apps/web/app/api/media/video/generate/route.ts',
    'apps/web/app/api/media/image/generate/route.ts',
  ];
  const allowlist = JSON.parse(
    spawnSync('cat', [
      path.join(REPO_ROOT, 'scripts/config/managed-compute-evaluator-allowlist.json'),
    ]).stdout,
  );
  const allowlistedPaths = new Set(allowlist.entries.map((entry) => entry.path));
  for (const seeded of seededPaths) {
    assert.ok(allowlistedPaths.has(seeded), `expected ${seeded} in the seeded allowlist`);
  }
});

test('fails an apps/web file that imports the identity provider SDK directly', () => {
  const result = runOnSandbox({
    'apps/web/lib/example.ts': "import { auth } from '@clerk/nextjs/server';\nexport { auth };\n",
    'scripts/config/managed-compute-evaluator-allowlist.json': EMPTY_ALLOWLIST,
    [EMPTY_IDENTITY_ALLOWLIST]: EMPTY_ALLOWLIST,
  });
  assert.equal(result.status, 1, 'guard should reject a direct identity SDK import');
  assert.match(result.stderr, /@clerk\/nextjs\/server/);
  assert.match(result.stderr, /@agiworkforce\/identity/);
});

test('passes an apps/web file that reaches identity through the port', () => {
  const result = runOnSandbox({
    'apps/web/lib/example.ts':
      "import { resolveIdentityProvider } from '@agiworkforce/identity';\nexport { resolveIdentityProvider };\n",
    'scripts/config/managed-compute-evaluator-allowlist.json': EMPTY_ALLOWLIST,
    [EMPTY_IDENTITY_ALLOWLIST]: EMPTY_ALLOWLIST,
  });
  assert.equal(result.status, 0, `expected pass, got:\n${result.stderr}${result.stdout}`);
});

test('passes a direct identity SDK import once it carries an allowlist entry with a reason', () => {
  const result = runOnSandbox({
    'apps/web/app/login/page.tsx': "import { SignIn } from '@clerk/nextjs';\nexport { SignIn };\n",
    'scripts/config/managed-compute-evaluator-allowlist.json': EMPTY_ALLOWLIST,
    [EMPTY_IDENTITY_ALLOWLIST]: JSON.stringify({
      schemaVersion: 1,
      entries: [
        {
          path: 'apps/web/app/login/page.tsx',
          reason: "renders the provider's hosted sign-in component, which the port does not cover.",
        },
      ],
    }),
  });
  assert.equal(result.status, 0, `expected pass, got:\n${result.stderr}${result.stdout}`);
});

test('fails an identity allowlist entry that carries no reason', () => {
  const result = runOnSandbox({
    'apps/web/app/login/page.tsx': "import { SignIn } from '@clerk/nextjs';\nexport { SignIn };\n",
    'scripts/config/managed-compute-evaluator-allowlist.json': EMPTY_ALLOWLIST,
    [EMPTY_IDENTITY_ALLOWLIST]: JSON.stringify({
      schemaVersion: 1,
      entries: [{ path: 'apps/web/app/login/page.tsx', reason: 'ui' }],
    }),
  });
  assert.equal(result.status, 1, 'guard should demand a reason');
  assert.match(result.stderr, /needs a "reason"/);
});

test('fails a stale identity allowlist entry for a file that no longer imports the SDK', () => {
  const result = runOnSandbox({
    'apps/web/app/login/page.tsx':
      "import { useSession } from '@/lib/identity/client';\nexport { useSession };\n",
    'scripts/config/managed-compute-evaluator-allowlist.json': EMPTY_ALLOWLIST,
    [EMPTY_IDENTITY_ALLOWLIST]: JSON.stringify({
      schemaVersion: 1,
      entries: [
        {
          path: 'apps/web/app/login/page.tsx',
          reason: "renders the provider's hosted sign-in component, which the port does not cover.",
        },
      ],
    }),
  });
  assert.equal(result.status, 1, 'guard should reject a stale identity allowlist entry');
  assert.match(result.stderr, /no longer import an identity provider SDK/);
});

test('ignores an identity SDK import outside apps/web, where the adapter lives', () => {
  const result = runOnSandbox({
    'packages/platform/identity/src/adapters/clerk.ts':
      "import * as clerkServer from '@clerk/nextjs/server';\nexport { clerkServer };\n",
    'scripts/config/managed-compute-evaluator-allowlist.json': EMPTY_ALLOWLIST,
    [EMPTY_IDENTITY_ALLOWLIST]: EMPTY_ALLOWLIST,
  });
  assert.equal(result.status, 0, `expected pass, got:\n${result.stderr}${result.stdout}`);
});

test('the real identity allowlist names only the provider ui mount, the auth adapter, the client roots and enterprise sso', () => {
  const allowlist = JSON.parse(
    spawnSync('cat', [path.join(REPO_ROOT, 'scripts/config/identity-sdk-allowlist.json')]).stdout,
  );
  const allowlistedPaths = new Set(allowlist.entries.map((entry) => entry.path));
  for (const seeded of [
    'apps/web/app/layout.tsx',
    'apps/web/features/auth/identityAuthAdapter.tsx',
    'apps/web/lib/identity/client.ts',
    'apps/web/lib/identity/token.ts',
    'apps/web/lib/server/sso/clerk-enterprise-connections.ts',
  ]) {
    assert.ok(allowlistedPaths.has(seeded), `expected ${seeded} in the seeded allowlist`);
  }
  assert.equal(allowlistedPaths.size, 5, 'the identity allowlist should not grow silently');
});
