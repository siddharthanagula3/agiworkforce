import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB_ROOT = join(__dirname, '..');
const MCP_SRC = join(WEB_ROOT, '..', '..', 'packages', 'tools', 'mcp', 'src');

const SKIP_DIRS = /^(?:\.|node_modules$|__tests__$|__mocks__$|tests?$|e2e$)/;

const CONNECT_CALL = 'connectMcpServer({';
const CATALOG_CALL = 'buildMcpToolCatalog(';
const POLICY_IMPORT = "from '@/lib/mcp-egress-policy'";
const POLICY = 'MCP_EGRESS_POLICY';

const REQUIRED_CONNECT_SITES = [
  'app/api/mcp/route.ts',
  'lib/connectors/mcp-custom-connections.ts',
  'lib/mcp-tool-executor.ts',
  'lib/user-connector-tools.ts',
];

const REQUIRED_CATALOG_SITES = ['lib/mcp-tool-executor.ts', 'lib/user-connector-tools.ts'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return SKIP_DIRS.test(entry.name) ? [] : sourceFiles(full);
    if (!/\.tsx?$/.test(entry.name) || /\.(test|spec)\.tsx?$/.test(entry.name)) return [];
    return [full];
  });
}

function callSites(callee: string): { file: string; source: string }[] {
  return sourceFiles(WEB_ROOT)
    .map((file) => ({ file: relative(WEB_ROOT, file), source: readFileSync(file, 'utf8') }))
    .filter(({ source }) => source.includes(callee));
}

function callArgumentBlocks(source: string, callee: string): string[] {
  const blocks: string[] = [];
  for (let at = source.indexOf(callee); at !== -1; at = source.indexOf(callee, at + 1)) {
    const open = at + callee.length - 1;
    let depth = 0;
    let cursor = open;
    for (; cursor < source.length; cursor += 1) {
      if ('({['.includes(source[cursor]!)) depth += 1;
      else if (')}]'.includes(source[cursor]!) && (depth -= 1) === 0) break;
    }
    blocks.push(source.slice(open + 1, cursor));
    at = cursor;
  }
  return blocks;
}

function topLevelParts(block: string): string[] {
  let depth = 0;
  let flat = '';
  for (const char of block) {
    if ('({['.includes(char)) depth += 1;
    else if (')}]'.includes(char)) depth -= 1;
    else if (depth === 0) flat += char;
  }
  return flat.split(',').map((part) => part.replace(/\s+/g, ' ').trim());
}

function readMcpSource(file: string): string {
  return readFileSync(join(MCP_SRC, file), 'utf8');
}

describe('every connectMcpServer call site carries the SSRF egress policy', () => {
  const connectSites = callSites(CONNECT_CALL);
  const catalogSites = callSites(CATALOG_CALL);

  it('the web app still connects MCP servers and builds catalogs', () => {
    expect(connectSites.length).toBeGreaterThan(0);
    expect(catalogSites.length).toBeGreaterThan(0);
  });

  it.each(REQUIRED_CONNECT_SITES)('%s still routes through connectMcpServer', (file) => {
    expect(
      connectSites.map((site) => site.file),
      `${file} no longer calls ${CONNECT_CALL}, either it stopped connecting MCP servers, or it ` +
        `now reaches one by a path this guard does not police. Remove it from ` +
        `REQUIRED_CONNECT_SITES only when the former is true.`,
    ).toContain(file);
  });

  it.each(REQUIRED_CATALOG_SITES)(
    '%s still builds its catalog through the guarded path',
    (file) => {
      expect(
        catalogSites.map((site) => site.file),
        `${file} no longer calls ${CATALOG_CALL}, so discovery may reach an MCP server without the ` +
          `egress policy.`,
      ).toContain(file);
    },
  );

  it.each(connectSites.map(({ file }) => file))('%s passes egressPolicy on every call', (file) => {
    const { source } = connectSites.find((site) => site.file === file)!;
    const blocks = callArgumentBlocks(source, CONNECT_CALL);
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(topLevelParts(block), `${file} connects without ${POLICY}`).toContain(
        `egressPolicy: ${POLICY}`,
      );
    }
    expect(source).toContain(POLICY_IMPORT);
  });

  it.each(catalogSites.map(({ file }) => file))('%s forwards the policy to discovery', (file) => {
    const { source } = catalogSites.find((site) => site.file === file)!;
    const blocks = callArgumentBlocks(source, CATALOG_CALL);
    expect(blocks.length, `${file} builds no MCP catalog`).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(topLevelParts(block)[1], `${file} builds a catalog without ${POLICY}`).toBe(POLICY);
    }
    expect(source).toContain(POLICY_IMPORT);
  });

  it('the shared policy resolves hostnames rather than only parsing them', () => {
    const source = readFileSync(join(WEB_ROOT, 'lib/mcp-egress-policy.ts'), 'utf8');
    expect(source).toContain('assertResolvedPublicHostname');
    expect(source).toContain('assertAllowedUrl');
  });

  it('buildMcpToolCatalog requires an egress policy from its callers', () => {
    const connect = readMcpSource('connect.ts');
    const [signature] = callArgumentBlocks(connect, 'function buildMcpToolCatalog(');
    expect(signature, 'buildMcpToolCatalog is no longer declared in connect.ts').toBeDefined();
    expect(topLevelParts(signature!)).toContain('egressPolicy: McpEgressOptions');
    expect(signature).not.toContain('egressPolicy?:');
  });

  it('every connectMcpServer call inside the mcp package forwards the policy', () => {
    const sources = sourceFiles(MCP_SRC).map((file) => ({
      file: relative(MCP_SRC, file),
      source: readFileSync(file, 'utf8'),
    }));
    const blocks = sources.flatMap(({ file, source }) =>
      callArgumentBlocks(source, CONNECT_CALL).map((block) => ({ file, block })),
    );
    expect(blocks.length).toBeGreaterThan(0);
    for (const { file, block } of blocks) {
      expect(
        topLevelParts(block).some((part) => /^egressPolicy(: egressPolicy)?$/.test(part)),
        `${file} connects without forwarding its egressPolicy parameter`,
      ).toBe(true);
    }
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
});
