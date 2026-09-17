import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

function appRoot(): string {
  const direct = process.cwd();
  if (existsSync(join(direct, 'app/api'))) return direct;
  const nested = join(direct, 'apps/web');
  if (existsSync(join(nested, 'app/api'))) return nested;
  throw new Error(`Could not locate apps/web from ${direct}`);
}

const APP_ROOT = appRoot();
const HANDLER_EXPORT =
  /export\s+(?:const|async\s+function|function)\s+(GET|POST|PUT|PATCH|DELETE)\b/u;
const GATEWAY_POLICY_ARGUMENT = /withErrorHandler\(\s*\w+\s*,\s*(?:GATEWAY_POLICY|\{)/u;

// Cron routes are counted separately and are not part of the ratchet below.
// The wrapper exists to shape an error a caller reads: it maps a thrown error
// onto a status and a safe body, applies deadlines and idempotency, and keeps
// a raw message from reaching a user. A cron path has no such caller. The
// scheduler is its only client, `verifyCronRequest` refuses everyone else, and
// its body is a run summary read from a log. Counting the 27 of them against
// the ratchet let a sweep land without touching a route a user can reach, and
// spent budget meant for the ones they can.
const CRON_ROUTE_PREFIX = 'app/api/cron/';
const MAX_ROUTES_OUTSIDE_GATEWAY = 46;
const MIN_ROUTES_WITH_DECLARED_POLICY = 6;

function routeFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) routeFiles(full, out);
    else if (entry === 'route.ts') out.push(full);
  }
  return out;
}

const routes = routeFiles(join(APP_ROOT, 'app/api'))
  .map((file) => ({ path: relative(APP_ROOT, file), source: readFileSync(file, 'utf8') }))
  .filter((route) => HANDLER_EXPORT.test(route.source));

describe('API gateway coverage', () => {
  it('does not let the number of handlers outside withErrorHandler grow', () => {
    const outside = routes.filter(
      (route) =>
        !route.source.includes('withErrorHandler(') && !route.path.startsWith(CRON_ROUTE_PREFIX),
    );
    expect(
      outside.length,
      `Routes outside the gateway wrapper:\n${outside.map((route) => route.path).join('\n')}`,
    ).toBeLessThanOrEqual(MAX_ROUTES_OUTSIDE_GATEWAY);
  });

  it('keeps every cron route on the scheduler credential that earns its exclusion', () => {
    const unguarded = routes
      .filter((route) => route.path.startsWith(CRON_ROUTE_PREFIX))
      .filter((route) => !route.source.includes('verifyCronRequest'));
    expect(
      unguarded.map((route) => route.path),
      'a cron route reachable without the scheduler credential belongs inside the gateway wrapper',
    ).toEqual([]);
  });

  it('keeps the routes that declared deadlines, circuits or idempotency on a declared policy', () => {
    const declared = routes.filter((route) => GATEWAY_POLICY_ARGUMENT.test(route.source));
    expect(declared.length).toBeGreaterThanOrEqual(MIN_ROUTES_WITH_DECLARED_POLICY);
    for (const path of [
      'app/api/checkout/route.ts',
      'app/api/billing/top-up/route.ts',
      'app/api/chat/conversations/[id]/route.ts',
      'app/api/settings/organization/spend-limit/route.ts',
      'app/api/settings/organization/usage-analytics/route.ts',
      'app/api/settings/organization/billing-contract/route.ts',
    ]) {
      expect(declared.map((route) => route.path)).toContain(path);
    }
  });
});
