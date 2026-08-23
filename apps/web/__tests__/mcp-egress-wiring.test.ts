import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB_ROOT = join(__dirname, '..');

const CALL_SITES = [
  'app/api/mcp/route.ts',
  'app/api/connectors/custom/route.ts',
  'lib/mcp-tool-executor.ts',
  'lib/user-connector-tools.ts',
];

const CATALOG_SITES = ['lib/mcp-tool-executor.ts', 'lib/user-connector-tools.ts'];

function callArgumentBlocks(source: string, callee: string): string[] {
  return source
    .split(callee)
    .slice(1)
    .map((tail) => tail.split(');')[0] ?? '');
}

function read(relative: string): string {
  return readFileSync(join(WEB_ROOT, relative), 'utf8');
}

function readMcpSource(file: string): string {
  return readFileSync(join(WEB_ROOT, '..', '..', 'packages', 'tools', 'mcp', 'src', file), 'utf8');
}

describe('every connectMcpServer call site carries the SSRF egress policy', () => {
  for (const file of CALL_SITES) {
    it(`${file} passes egressPolicy on every call`, () => {
      const source = read(file);
      const calls = source.split('connectMcpServer({').length - 1;
      expect(calls).toBeGreaterThan(0);

      const guarded = source
        .split('connectMcpServer({')
        .slice(1)
        .filter((tail) => /^\s*egressPolicy:\s*MCP_EGRESS_POLICY,/.test(tail)).length;
      expect(guarded).toBe(calls);
      expect(source).toContain("from '@/lib/mcp-egress-policy'");
    });
  }

  it('the shared policy resolves hostnames rather than only parsing them', () => {
    const source = read('lib/mcp-egress-policy.ts');
    expect(source).toContain('assertResolvedPublicHostname');
    expect(source).toContain('assertAllowedUrl');
  });

  it('every buildMcpToolCatalog call site forwards the policy to discovery', () => {
    for (const file of CATALOG_SITES) {
      const source = read(file);
      const blocks = callArgumentBlocks(source, 'buildMcpToolCatalog(');
      expect(blocks.length, `${file} builds no MCP catalog`).toBeGreaterThan(0);
      for (const block of blocks) {
        expect(block, `${file} builds a catalog without MCP_EGRESS_POLICY`).toContain(
          'MCP_EGRESS_POLICY',
        );
      }
      expect(source).toContain("from '@/lib/mcp-egress-policy'");
    }
  });

  it('buildMcpToolCatalog requires an egress policy from its callers', () => {
    const connect = readMcpSource('connect.ts');
    expect(connect).toContain('egressPolicy: McpEgressOptions,');
    expect(connect).toContain('connectMcpServer({ serverName, config, egressPolicy })');
  });

  it('no MCP connection can fall back to unpinned global fetch', () => {
    const connect = readMcpSource('connect.ts');
    expect(connect).toContain("from './pinned-fetch'");
    expect(connect).toContain(
      'resolveMcpTransport(config, resolveEgressPolicy(params.egressPolicy))',
    );
    expect(connect).not.toContain('params.egressPolicy ?? {}');

    const pinned = readMcpSource('pinned-fetch.ts');
    expect(pinned).toContain("from 'node:dns/promises'");
    expect(pinned).toContain('lookup: pinnedLookup(addresses)');
  });

  it('no web call site connects without the policy', () => {
    for (const file of CALL_SITES) {
      const source = read(file);
      const unguarded = source
        .split('connectMcpServer({')
        .slice(1)
        .filter((tail) => !/^\s*egressPolicy:\s*MCP_EGRESS_POLICY,/.test(tail));
      expect(unguarded, `${file} has an unguarded connectMcpServer call`).toHaveLength(0);
    }
  });
});
