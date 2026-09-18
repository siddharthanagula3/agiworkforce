import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Each route decides for itself which of the three guards to call, so a route
 * shipped without one looked like a route that did not need it. This is the gate.
 */
const API_ROOT = path.resolve(import.meta.dirname, '../../app/api/llm/v1');

/**
 * A route naming this gate counts as all three; the assertion below holds the
 * gate to that, which is what keeps the shorthand honest.
 */
const AUTH_GATE = path.resolve(API_ROOT, 'chat/completions/lib/auth-gate.ts');

const MUTATING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;

function routeFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...routeFiles(full));
    else if (entry.name === 'route.ts') found.push(full);
  }
  return found.sort();
}

function calls(source: string, symbol: string): boolean {
  return new RegExp(`\\b${symbol}\\s*\\(`).test(source);
}

function exportsMutatingMethod(source: string): boolean {
  return MUTATING_METHODS.some((method) =>
    new RegExp(`export\\s+(?:async\\s+function|const)\\s+${method}\\b`).test(source),
  );
}

const routes = routeFiles(API_ROOT).map((file) => ({
  name: path.relative(API_ROOT, file),
  source: fs.readFileSync(file, 'utf8'),
}));

describe('every public API route is behind rate limiting, CSRF and authentication', () => {
  it('finds the routes to check at all, so an empty sweep cannot pass', () => {
    expect(routes.length).toBeGreaterThan(0);
  });

  it('runAuthGate really is all three guards, which is what lets a route name only it', () => {
    const gate = fs.readFileSync(AUTH_GATE, 'utf8');
    expect(calls(gate, 'withRateLimit')).toBe(true);
    expect(calls(gate, 'requireCsrfToken')).toBe(true);
    expect(calls(gate, 'getUserScopedDb') || calls(gate, 'getClerkAuthUser')).toBe(true);
  });

  it.each(routes.map((route) => [route.name, route.source] as const))(
    '%s authenticates its caller',
    (_name, source) => {
      const authenticated =
        calls(source, 'runAuthGate') ||
        calls(source, 'getUserScopedDb') ||
        calls(source, 'getClerkAuthUser');
      expect(authenticated).toBe(true);
    },
  );

  it.each(routes.map((route) => [route.name, route.source] as const))(
    '%s rate limits its caller',
    (_name, source) => {
      expect(calls(source, 'runAuthGate') || calls(source, 'withRateLimit')).toBe(true);
    },
  );

  it.each(
    routes
      .filter((route) => exportsMutatingMethod(route.source))
      .map((route) => [route.name, route.source] as const),
  )('%s checks a CSRF token before it writes', (_name, source) => {
    expect(calls(source, 'runAuthGate') || calls(source, 'requireCsrfToken')).toBe(true);
  });
});
