import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { importsSharedContract, isClientCalled } from './lib/route-shared-contracts.mjs';

const script = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'check-route-shared-contracts.mjs',
);

const ON_CONTRACT = `
import { ListConnectorsResponseSchema } from '@agiworkforce/cloud-contracts';
export async function GET() { return Response.json(ListConnectorsResponseSchema.parse({})); }
`;

const LOCAL_SHAPE = `
interface Local { ok: boolean }
export async function GET() { return Response.json({ ok: true } satisfies Local); }
`;

function fixture(tree) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'route-contracts-'));
  for (const [relative, source] of Object.entries(tree)) {
    const full = path.join(root, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, source);
  }
  return root;
}

function baseTree() {
  return {
    'apps/web/app/api/connectors/route.ts': ON_CONTRACT,
    'apps/web/app/api/usage/route.ts': ON_CONTRACT,
    'apps/web/app/api/internal/route.ts': LOCAL_SHAPE,
    'apps/web/features/connectors/client.ts': `fetch('/api/connectors');`,
    'apps/mobile/services/usage.ts': "const USAGE = '/api/usage';",
  };
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

test('recognises a shared contract import and nothing else', () => {
  assert.equal(importsSharedContract(ON_CONTRACT), true);
  assert.equal(importsSharedContract("import { z } from 'zod';"), false);
  assert.equal(importsSharedContract("import x from '@agiworkforce/types/product-routes';"), true);
  assert.equal(importsSharedContract("import x from '@agiworkforce/typesafe';"), false);
});

test('matches a dynamic route through the static prefix a client builds it from', () => {
  assert.equal(
    isClientCalled('code/sessions/[id]', ['const BASE = `/api/code/sessions/${id}`;']),
    true,
  );
  assert.equal(isClientCalled('code/sessions/[id]', ["fetch('/api/code/sessionsx')"]), false);
});

test('passes when every client-called route imports a shared contract', () => {
  const result = run(fixture(baseTree()));
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /2 client-called routes, 2 on a shared contract, 0 baselined/);
});

test('fails for a client-called route that keeps its own body shape', () => {
  const tree = baseTree();
  tree['apps/web/app/api/usage/route.ts'] = LOCAL_SHAPE;
  const result = run(fixture(tree));
  assert.equal(result.code, 1);
  assert.match(result.output, /\/api\/usage$/m);
});

test('leaves a route no client calls alone', () => {
  const tree = baseTree();
  tree['apps/web/app/api/internal/route.ts'] = LOCAL_SHAPE;
  assert.equal(run(fixture(tree)).code, 0);
});

test('does not count a test file as a client caller', () => {
  const tree = baseTree();
  tree['apps/web/features/internal/internal.test.ts'] = "fetch('/api/internal');";
  assert.equal(run(fixture(tree)).code, 0);
});

test('accepts a baselined route and fails once it no longer needs the exception', () => {
  const tree = baseTree();
  tree['apps/web/app/api/usage/route.ts'] = LOCAL_SHAPE;
  tree['scripts/config/route-shared-contracts-baseline.json'] = JSON.stringify({
    routes: ['usage'],
  });
  assert.equal(run(fixture(tree)).code, 0);

  tree['apps/web/app/api/usage/route.ts'] = ON_CONTRACT;
  const result = run(fixture(tree));
  assert.equal(result.code, 1);
  assert.match(result.output, /no longer need an exception/);
});
