import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = join(__dirname, '..', '..');
const REMOVED_ROUTE = join(WEB_ROOT, 'app', 'api', 'control-plane', 'status', 'route.ts');

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
 * `GET /api/control-plane/status` returned three things, and a route with a
 * caller already returned each of them:
 *
 * - the caller's own desktop and mobile heartbeats, which `/api/settings/devices`
 *   serves to the devices surface;
 * - their cloud agent counts and recent events, which
 *   `/api/llm/v1/chat/completions/runs` serves to the tasks surface;
 * - provider health, which the operator dashboard's routing panel reads from
 *   `/api/admin/routing-health`, the breaker state the router actually acts on.
 *
 * The provider third was also the weakest: it derived "up" from a HEAD request
 * to each vendor's marketing site, which measures neither the API nor our route
 * to it, and it let any signed-in caller make the server fan out three external
 * requests. A panel would have carried that onto the operator dashboard beside
 * the real telemetry, and its other two thirds are per-caller data that would
 * read as fleet-wide there.
 */
describe('the duplicate control-plane status route stays removed', () => {
  it('has no route file', () => {
    expect(existsSync(REMOVED_ROUTE)).toBe(false);
  });

  it('has no caller anywhere under apps/web', () => {
    const callers = sourceFiles(WEB_ROOT)
      .filter((file) => file !== REMOVED_ROUTE && file !== __filename)
      .map((file) => ({ file: relative(WEB_ROOT, file), source: readFileSync(file, 'utf8') }))
      .filter(({ source }) => source.includes('control-plane/status'))
      .map(({ file }) => file);

    expect(callers, 'restore it only alongside the caller that needs it').toEqual([]);
  });

  it('leaves each of its three answers with a route that has a caller', () => {
    for (const route of [
      'app/api/settings/devices/route.ts',
      'app/api/llm/v1/chat/completions/runs/route.ts',
      'app/api/admin/routing-health/route.ts',
    ]) {
      expect(existsSync(join(WEB_ROOT, route)), `${route} is gone`).toBe(true);
    }
  });

  it('keeps provider health on the panel that reads real breaker state', () => {
    const panel = readFileSync(
      join(WEB_ROOT, 'features', 'admin', 'components', 'RoutingHealthPanel.tsx'),
      'utf8',
    );
    expect(panel).toContain('/api/admin/routing-health');
  });
});
