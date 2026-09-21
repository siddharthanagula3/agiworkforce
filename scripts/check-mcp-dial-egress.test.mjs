import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { callArguments, dialViolations } from './check-mcp-dial-egress.mjs';

const script = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'check-mcp-dial-egress.mjs',
);

const GOOD = `import { connectMcpServer } from '@agiworkforce/mcp';
import { MCP_EGRESS_POLICY } from '@/lib/mcp-egress-policy';

export async function dial(url: string) {
  return connectMcpServer({
    egressPolicy: MCP_EGRESS_POLICY,
    serverName: 'one',
    config: { url, transport: 'streamable-http' },
  });
}
`;

const MISSING_POLICY = GOOD.replace('    egressPolicy: MCP_EGRESS_POLICY,\n', '');
const PRIVATE_NETWORK = GOOD.replace(
  'egressPolicy: MCP_EGRESS_POLICY,',
  'egressPolicy: { ...MCP_EGRESS_POLICY, allowPrivateNetwork: true },',
);

function runOn(source) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-dial-egress-'));
  const dir = path.join(root, 'apps/web/lib');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'dialer.ts'), source);
  try {
    execFileSync(process.execPath, [script, '--root', root], { encoding: 'utf8' });
    return { ok: true, output: '' };
  } catch (error) {
    return { ok: false, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('a dial that names the managed egress policy passes', () => {
  assert.equal(runOn(GOOD).ok, true);
});

test('a dial with no egress policy fails', () => {
  const result = runOn(MISSING_POLICY);
  assert.equal(result.ok, false);
  assert.match(result.output, /does not go out through MCP_EGRESS_POLICY/u);
});

test('a hosted dial that opts into the private network fails', () => {
  const result = runOn(PRIVATE_NETWORK);
  assert.equal(result.ok, false);
  assert.match(result.output, /asks for the private network/u);
});

test('a tree with no dial site at all fails rather than reporting clean', () => {
  const result = runOn('export const nothing = 1;\n');
  assert.equal(result.ok, false);
  assert.match(result.output, /the walk is measuring nothing/u);
});

test('call arguments are read by balancing parentheses, not by line', () => {
  const calls = callArguments(
    'await buildMcpToolCatalog(makeConfigs(a, b), POLICY, opts);',
    'buildMcpToolCatalog',
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].text, 'makeConfigs(a, b), POLICY, opts');
});

test('a test file shape is still reported when handed directly to the checker', () => {
  assert.deepEqual(dialViolations('x.ts', 'connectMcpServer({ serverName: "a" })'), [
    'x.ts:1 connectMcpServer() does not go out through MCP_EGRESS_POLICY',
  ]);
});
