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
