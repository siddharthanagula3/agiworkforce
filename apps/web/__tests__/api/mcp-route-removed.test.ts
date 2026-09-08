import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = join(__dirname, '..', '..');
const REMOVED_ROUTE = join(WEB_ROOT, 'app', 'api', 'mcp', 'route.ts');

const SKIP_DIRS = /^(?:\.|node_modules$|\.next$|dist$|e2e$)/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return SKIP_DIRS.test(entry.name) ? [] : sourceFiles(full);
    if (!/\.tsx?$/.test(entry.name)) return [];
    return [full];
  });
}

/**
 * `POST /api/mcp` connected to an arbitrary user-supplied MCP server and
 * returned its tool catalog, with no plan gate. Its sibling
 * `POST /api/connectors/custom` does the same discovery behind
 * `assertCustomConnectorCapacity` and `assertConnectorToolCapacity`, persists
 * the result and writes an audit row. Nothing in the product ever called
 * `/api/mcp`, so the weaker of the two paths was reachable only by hand.
 *
 * It was removed rather than gated, because a second route for one capability
 * is a second place for the gate to drift. This guard fails if it comes back
 * without a caller.
 */
describe('the ungated /api/mcp connect-and-discover route stays removed', () => {
  it('has no route file', () => {
    expect(existsSync(REMOVED_ROUTE)).toBe(false);
  });

  it('has no caller anywhere under apps/web', () => {
    const callers = sourceFiles(WEB_ROOT)
      .filter((file) => file !== REMOVED_ROUTE && file !== __filename)
      .map((file) => ({ file: relative(WEB_ROOT, file), source: readFileSync(file, 'utf8') }))
      .filter(({ source }) => /['"`]\/api\/mcp['"`]|@\/app\/api\/mcp\//.test(source))
      .map(({ file }) => file);

    expect(callers, 'restore the route only alongside the caller that needs it').toEqual([]);
  });

  it('leaves the gated sibling as the single owner of custom MCP discovery', () => {
    const sibling = join(WEB_ROOT, 'app', 'api', 'connectors', 'custom', 'route.ts');
    expect(statSync(sibling).isFile()).toBe(true);
    const source = readFileSync(sibling, 'utf8');
    expect(source).toContain('assertCustomConnectorCapacity');
    expect(source).toContain('assertConnectorToolCapacity');
  });
});
