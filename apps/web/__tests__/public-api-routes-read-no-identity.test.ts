import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs/server', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  clerkMiddleware: () => () => undefined,
  createRouteMatcher: () => () => false,
}));

import { PUBLIC_API_ROUTE_PATTERNS } from '../proxy';

const API_ROOT = path.join(__dirname, '..', 'app', 'api');

// Reading identity on a route the proxy serves without it throws for every
// request; only a read wrapped so a failure means "signed out" is safe there.
const IDENTITY_READS = /\b(getClerkAuthUser|getUserScopedDb|requireCurrentUserId)\s*\(/;

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return entry === 'route.ts' ? [full] : [];
  });
}

function apiPath(file: string): string {
  const relative = path.relative(API_ROOT, path.dirname(file)).split(path.sep).join('/');
  return relative ? `/api/${relative}` : '/api';
}

function matchesPattern(pathname: string, pattern: string): boolean {
  if (pattern.endsWith('/(.*)')) return pathname.startsWith(pattern.slice(0, -'(.*)'.length));
  return pathname === pattern;
}

describe('routes the proxy serves without identity', () => {
  const publicRoutes = routeFiles(API_ROOT).filter((file) =>
    PUBLIC_API_ROUTE_PATTERNS.some((pattern) => matchesPattern(apiPath(file), pattern)),
  );

  it('are found, so this check cannot pass on an empty list', () => {
    expect(publicRoutes.length).toBeGreaterThanOrEqual(4);
  });

  it('never read the caller identity directly', () => {
    const offenders = publicRoutes.filter((file) =>
      IDENTITY_READS.test(readFileSync(file, 'utf8')),
    );
    expect(offenders.map((file) => path.relative(API_ROOT, file))).toEqual([]);
  });
});
