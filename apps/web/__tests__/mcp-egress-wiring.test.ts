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

function read(relative: string): string {
  return readFileSync(join(WEB_ROOT, relative), 'utf8');
}

describe('every connectMcpServer call site carries the SSRF egress policy', () => {
  for (const file of CALL_SITES) {
    it(`${file} passes egressPolicy on every call`, () => {
      const source = read(file);
      const calls = source.split('connectMcpServer({').length - 1;
      expect(calls).toBeGreaterThan(0);

      const guarded =
        source.split('connectMcpServer({\n      egressPolicy: MCP_EGRESS_POLICY,').length - 1;
      expect(guarded).toBe(calls);
      expect(source).toContain("from '@/lib/mcp-egress-policy'");
    });
  }

  it('the shared policy resolves hostnames rather than only parsing them', () => {
    const source = read('lib/mcp-egress-policy.ts');
    expect(source).toContain('assertResolvedPublicHostname');
    expect(source).toContain('assertAllowedUrl');
  });

  it('no web call site connects without the policy', () => {
    for (const file of CALL_SITES) {
      const source = read(file);
      const unguarded = source
        .split('connectMcpServer({')
        .slice(1)
        .filter((tail) => !tail.trimStart().startsWith('egressPolicy'));
      expect(unguarded, `${file} has an unguarded connectMcpServer call`).toHaveLength(0);
    }
  });
});
