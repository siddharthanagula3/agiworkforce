import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP = join(process.cwd(), 'app');

/**
 * Pages that legitimately call `auth()` while staying public. Each needs a
 * reason, because "it is public" is exactly what someone would write to silence
 * this test about a page that should not be.
 */
const PUBLIC_BY_DESIGN: Record<string, string> = {
  '/': 'The landing page reads the session only to vary its call to action; a signed-out visitor is its primary audience.',
  '/login/complete':
    'The sign-in landing itself. It is matched by isClerkSessionRoute rather than isProtectedAppRoute, since gating it would make signing in impossible.',
};

function pagesCallingAuth(dir: string, base = '', out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'api' || entry === '__tests__') continue;
    const full = join(dir, entry);

    if (statSync(full).isDirectory()) {
      const segment = entry.startsWith('(') && entry.endsWith(')') ? '' : `/${entry}`;
      pagesCallingAuth(full, base + segment, out);
      continue;
    }

    if (entry !== 'page.tsx' && entry !== 'layout.tsx') continue;
    if (/await auth\(\)/.test(readFileSync(full, 'utf8'))) out.push(base || '/');
  }
  return out;
}

function matcherPatterns(name: string): string[] {
  const proxy = readFileSync(join(process.cwd(), 'proxy.ts'), 'utf8');
  const block = new RegExp(`${name} = createRouteMatcher\\(\\[([\\s\\S]*?)\\]\\)`).exec(proxy);
  expect(block, `${name} not found in proxy.ts`).not.toBeNull();
  return [...(block?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1] as string);
}

const WILDCARD = '\u0000';

function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replaceAll('(.*)', WILDCARD)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replaceAll(WILDCARD, '(?:/.*)?');
  return new RegExp(`^${escaped}$`);
}

function covers(patterns: string[], route: string): boolean {
  return patterns.some((pattern) => {
    try {
      return patternToRegExp(pattern).test(route);
    } catch {
      return false;
    }
  });
}

describe('proxy covers every page that calls auth()', () => {
  const routes = [...new Set(pagesCallingAuth(APP))].filter((r) => !r.includes('['));
  const protectedPatterns = matcherPatterns('isProtectedAppRoute');
  const sessionPatterns = matcherPatterns('isClerkSessionRoute');

  it('finds the pages to check', () => {
    expect(routes.length).toBeGreaterThan(3);
  });

  for (const route of [...routes].sort()) {
    it(`${route} is matched by the proxy, or is public with a stated reason`, () => {
      if (PUBLIC_BY_DESIGN[route]) {
        expect(PUBLIC_BY_DESIGN[route].length).toBeGreaterThan(40);
        return;
      }
      expect(
        covers(protectedPatterns, route),
        `${route} calls auth() but isProtectedAppRoute does not match it, so a signed-out visitor gets an error boundary instead of the sign-in gate`,
      ).toBe(true);
    });
  }

  it('keeps the session matcher at least as wide as the protected matcher', () => {
    // A route the proxy protects but does not hand a Clerk session to would
    // redirect every visitor, signed in or not.
    for (const route of routes) {
      if (PUBLIC_BY_DESIGN[route]) continue;
      expect(
        covers(sessionPatterns, route),
        `${route} is protected but gets no Clerk session`,
      ).toBe(true);
    }
  });
});
