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

const MAX_ROUTES_OUTSIDE_GATEWAY = 70;
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
    const outside = routes.filter((route) => !route.source.includes('withErrorHandler('));
    expect(
      outside.length,
      `Routes outside the gateway wrapper:\n${outside.map((route) => route.path).join('\n')}`,
    ).toBeLessThanOrEqual(MAX_ROUTES_OUTSIDE_GATEWAY);
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
