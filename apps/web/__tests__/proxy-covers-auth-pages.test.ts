import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every page that calls `getRequestIdentity()` must be covered by the proxy
 * matcher.
 *
 * `getRequestIdentity()` in a server component resolves from the session the
 * identity proxy established. On a route the proxy does not match, it cannot resolve, and the
 * `redirect()` the page meant to issue becomes an unhandled error instead, the
 * page answers 200 with an error boundary rather than sending the visitor to
 * sign in.
 *
 * That is not theoretical: `/operator`, the platform console that can read
 * every account, shipped missing from this list. It still refused access
 * because the page re-checks the operator allowlist, so nothing leaked, but a
 * signed-out visitor got a broken page instead of the sign-in gate, and the
 * proxy's session and CSP handling never ran for it.
 */

const APP = join(process.cwd(), 'app');

/**
 * Pages that legitimately call `getRequestIdentity()` while staying public. Each needs a
 * reason, because "it is public" is exactly what someone would write to silence
 * this test about a page that should not be.
 */
const PUBLIC_BY_DESIGN: Record<string, string> = {
  '/login/complete':
    'The sign-in landing itself. It is matched by isIdentitySessionRoute rather than isProtectedAppRoute, since gating it would make signing in impossible.',
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
    if (/await getRequestIdentity\(\)/.test(readFileSync(full, 'utf8'))) out.push(base || '/');
  }
  return out;
}

function matcherPatterns(name: string): string[] {
  const proxy = readFileSync(join(process.cwd(), 'proxy.ts'), 'utf8');
  const block = new RegExp(
    `${name} = (?:identityMiddleware\\.)?createRouteMatcher\\(\\[([\\s\\S]*?)\\]\\)`,
  ).exec(proxy);
  expect(block, `${name} not found in proxy.ts`).not.toBeNull();
  return [...(block?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1] as string);
}

const WILDCARD = '\u0000';

/**
 * Escapes every regex metacharacter, not a hand-picked few.
 *
 * The previous version escaped `/` and nothing else, which left `\`, and
 * every other metacharacter, to be reinterpreted. `/` never needed escaping
 * here at all: these patterns are compiled with the RegExp constructor, not
 * written as literals.
 */
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

describe('proxy covers every page that calls getRequestIdentity()', () => {
  const routes = [...new Set(pagesCallingAuth(APP))].filter((r) => !r.includes('['));
  const protectedPatterns = matcherPatterns('isProtectedAppRoute');
  const sessionPatterns = matcherPatterns('isIdentitySessionRoute');

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
        `${route} calls getRequestIdentity() but isProtectedAppRoute does not match it, so a signed-out visitor gets an error boundary instead of the sign-in gate`,
      ).toBe(true);
    });
  }

  it('keeps the session matcher at least as wide as the protected matcher', () => {
    // A route the proxy protects but does not hand an identity session to would
    // redirect every visitor, signed in or not.
    for (const route of routes) {
      if (PUBLIC_BY_DESIGN[route]) continue;
      expect(
        covers(sessionPatterns, route),
        `${route} is protected but gets no identity session`,
      ).toBe(true);
    }
  });
});
