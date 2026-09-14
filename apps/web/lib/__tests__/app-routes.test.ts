import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_ROUTE_PREFIXES, isAppRoutePath } from '../app-routes';

const proxySource = readFileSync(resolve(__dirname, '../../proxy.ts'), 'utf8');

function protectedPatterns(): string[] {
  const block = proxySource.match(
    /const isProtectedAppRoute = identityMiddleware\.createRouteMatcher\(\[([^\]]*)\]\)/u,
  );
  if (!block) throw new Error('isProtectedAppRoute matcher not found in proxy.ts');
  return [...block[1]!.matchAll(/'([^']+)'/gu)].map((match) => match[1]!.replace(/\(\.\*\)$/u, ''));
}

describe('app route prefixes', () => {
  it('name exactly the routes proxy.ts protects, so the app runtime mounts where a session exists', () => {
    expect([...APP_ROUTE_PREFIXES].sort()).toEqual(protectedPatterns().sort());
  });

  it('matches a route and its children, never a sibling that shares the prefix text', () => {
    expect(isAppRoutePath('/chat')).toBe(true);
    expect(isAppRoutePath('/chat/abc')).toBe(true);
    expect(isAppRoutePath('/chatter')).toBe(false);
    expect(isAppRoutePath('/pricing')).toBe(false);
    expect(isAppRoutePath(null)).toBe(false);
  });
});
