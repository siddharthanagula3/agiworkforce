import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'check-blob-route-authz.mjs',
);

function fixture(routes) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blob-authz-'));
  for (const [relative, source] of Object.entries(routes)) {
    const full = path.join(root, 'apps/web/app/api', relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, source);
  }
  return root;
}

function run(root) {
  try {
    return {
      code: 0,
      output: execFileSync('node', [script, '--root', root], { encoding: 'utf8' }),
    };
  } catch (error) {
    return { code: error.status ?? 1, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

const AUTHORIZED = `
import { getUserScopedDb } from '@/lib/server/rls-db';
import { readStoredMedia } from '@/lib/server/media-storage';
export async function GET(request) {
  const { userId } = await getUserScopedDb(request);
  return readStoredMedia(userId);
}
`;

test('passes a blob route that authorizes its read', () => {
  const result = run(fixture({ 'files/[id]/route.ts': AUTHORIZED }));
  assert.equal(result.code, 0);
  assert.match(result.output, /1 object-storage routes/);
});

test('fails a blob route that reads bytes with no authorization call', () => {
  const root = fixture({
    'files/[id]/route.ts': AUTHORIZED,
    'leaky/route.ts': `
import { streamStoredMedia } from '@/lib/server/media-storage';
export async function GET(request) {
  return streamStoredMedia(new URL(request.url).searchParams.get('key'));
}
`,
  });

  const result = run(root);
  assert.equal(result.code, 1);
  assert.match(result.output, /leaky\/route\.ts/);
  assert.match(result.output, /streamStoredMedia/);
});

test('requires cron authorization rather than a session on a cron sweep', () => {
  const sweep = `
import { deleteStoredMediaObjects } from '@/lib/server/media-storage';
export async function GET(request) {
  return deleteStoredMediaObjects([]);
}
`;
  const failing = run(fixture({ 'files/[id]/route.ts': AUTHORIZED, 'cron/purge/route.ts': sweep }));
  assert.equal(failing.code, 1);
  assert.match(failing.output, /verifyCronRequest/);

  const passing = run(
    fixture({
      'files/[id]/route.ts': AUTHORIZED,
      'cron/purge/route.ts': `
import { verifyCronRequest } from '@/lib/server/cron-auth';
${sweep.replace('return deleteStoredMediaObjects', 'if (!verifyCronRequest(request)) return null;\n  return deleteStoredMediaObjects')}
`,
    }),
  );
  assert.equal(passing.code, 0);
});

test('ignores a route that only imports configuration helpers', () => {
  const result = run(
    fixture({
      'files/[id]/route.ts': AUTHORIZED,
      'media/route.ts': `
import { authenticatedMediaUrl, isMediaStorageConfigured } from '@/lib/server/media-storage';
export function GET() {
  return isMediaStorageConfigured() ? authenticatedMediaUrl('id') : null;
}
`,
    }),
  );

  assert.equal(result.code, 0);
  assert.match(result.output, /1 object-storage routes/);
});

test('follows a helper beside the route to the bucket', () => {
  const root = fixture({
    'files/[id]/route.ts': AUTHORIZED,
    'uploads/helper.ts': `
import { storeMedia } from '@/lib/server/media-storage';
export function store(bytes) {
  return storeMedia(bytes);
}
`,
    'uploads/route.ts': `
import { store } from './helper';
export async function POST(request) {
  return store(await request.arrayBuffer());
}
`,
  });

  const result = run(root);
  assert.equal(result.code, 1);
  assert.match(result.output, /uploads\/route\.ts/);
  assert.match(result.output, /store/);
});

test('does not treat a type-only helper import as a byte-moving route', () => {
  const result = run(
    fixture({
      'files/[id]/route.ts': AUTHORIZED,
      'types/helper.ts': `
import { readStoredMedia } from '@/lib/server/media-storage';
export type StoredMediaReader = typeof readStoredMedia;
`,
      'types/route.ts': `
import type { StoredMediaReader } from './helper';
export function GET() {
  return null;
}
`,
    }),
  );

  assert.equal(result.code, 0);
  assert.match(result.output, /1 object-storage routes/);
});

test('accepts the managed-chat auth gate before attachment hydration', () => {
  const result = run(
    fixture({
      'files/[id]/route.ts': AUTHORIZED,
      'chat/route.ts': `
import { readStoredMedia } from '@/lib/server/media-storage';
import { runAuthGate } from './auth-gate';
export async function POST(request) {
  const auth = await runAuthGate(request);
  if (!auth.ok) return auth.response;
  return readStoredMedia(auth.userId);
}
`,
    }),
  );

  assert.equal(result.code, 0);
  assert.match(result.output, /2 object-storage routes/);
});

test('fails when no object-storage route is found at all', () => {
  const result = run(fixture({ 'health/route.ts': 'export function GET() { return null; }\n' }));
  assert.equal(result.code, 1);
  assert.match(result.output, /module list is stale/);
});
