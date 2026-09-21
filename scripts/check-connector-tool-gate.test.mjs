import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { callArguments, unboundLoopCalls, ungatedCalls } from './check-connector-tool-gate.mjs';

const script = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'check-connector-tool-gate.mjs',
);

const CATALOG = `
async function applyConnectorPolicy(defs, organizationId) {
  return defs;
}

export interface LoadUserConnectorToolOptions {
  isToolDenied?: (connectorId: string, toolName: string) => boolean;
}

export async function loadUserConnectorToolDefs(userId, options = {}) {
  return (await loadUserConnectorToolCatalog(userId, options)).tools;
}

export async function loadUserConnectorToolCatalog(userId, options = {}) {
  return { tools: await applyConnectorPolicy([], options.organizationId), dropped: [] };
}
`;

const GATED = `export async function POST() {
  const tools = await loadUserConnectorToolDefs(userId, {
    planTier: tier,
    isToolDenied: permissions.isConnectorToolDenied,
  });
  return Response.json({ tools });
}
`;

function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'connector-tool-gate-'));
  const all = { 'apps/web/lib/user-connector-tools.ts': CATALOG, ...files };
  for (const [relative, contents] of Object.entries(all)) {
    const full = path.join(root, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents);
  }
  try {
    execFileSync(process.execPath, [script, '--root', root], { encoding: 'utf8' });
    return { ok: true, output: '' };
  } catch (error) {
    return { ok: false, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('a caller that passes the per-tool verdict passes', () => {
  assert.equal(tree({ 'apps/web/app/api/chat/route.ts': GATED }).ok, true);
});

test('a caller that omits the per-tool verdict fails', () => {
  const result = tree({
    'apps/web/app/api/chat/route.ts': GATED.replace(
      '    isToolDenied: permissions.isConnectorToolDenied,\n',
      '',
    ),
  });
  assert.equal(result.ok, false);
  assert.match(result.output, /offers tools without isToolDenied/u);
});

test('a catalog that stopped filtering by workspace policy fails', () => {
  const result = tree({
    'apps/web/app/api/chat/route.ts': GATED,
    'apps/web/lib/user-connector-tools.ts': CATALOG.replace(
      'await applyConnectorPolicy([], options.organizationId)',
      '[]',
    ).replace(
      'async function applyConnectorPolicy(defs, organizationId) {\n  return defs;\n}\n',
      '',
    ),
  });
  assert.equal(result.ok, false);
  assert.match(result.output, /no longer filters the offered catalog by workspace policy/u);
});

test('a catalog that stopped accepting a per-tool verdict fails', () => {
  const result = tree({
    'apps/web/app/api/chat/route.ts': GATED.replace(
      '    isToolDenied: permissions.isConnectorToolDenied,\n',
      '',
    ),
    'apps/web/lib/user-connector-tools.ts': CATALOG.replaceAll('isToolDenied', 'somethingElse'),
  });
  assert.equal(result.ok, false);
  assert.match(result.output, /no longer accepts a per-tool verdict/u);
});

test('a tree with no catalog caller fails rather than reporting clean', () => {
  const result = tree({ 'apps/web/app/api/chat/route.ts': 'export const GET = () => null;\n' });
  assert.equal(result.ok, false);
  assert.match(result.output, /the walk is measuring nothing/u);
});

test('a multi-line call is read whole, not one line at a time', () => {
  const calls = callArguments(GATED, 'loadUserConnectorToolDefs');
  assert.equal(calls.length, 1);
  assert.match(calls[0].text, /isToolDenied/u);
});

test('the checker names the file and line of an ungated call', () => {
  assert.deepEqual(ungatedCalls('r.ts', 'loadUserConnectorToolCatalog(userId, { planTier })'), [
    'r.ts:1 loadUserConnectorToolCatalog() offers tools without isToolDenied',
  ]);
});

test('a turn started without the saved verdicts fails', () => {
  assert.deepEqual(
    unboundLoopCalls(
      'r.ts',
      "runToolLoop(processed, { approvalMode: 'manual', connectorPermissions });",
    ),
    [],
  );
  const problems = unboundLoopCalls('r.ts', "runToolLoop(processed, { approvalMode: 'manual' });");
  assert.equal(problems.length, 1);
  assert.match(problems[0], /runs a turn without connectorPermissions/u);
});

test('the module that declares a loop entry point is not read as a caller', () => {
  assert.deepEqual(
    unboundLoopCalls('tool-loop.ts', 'export async function* runToolLoop(processed, options) {}'),
    [],
  );
});
