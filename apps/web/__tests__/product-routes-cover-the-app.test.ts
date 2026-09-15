import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AUTH_ROUTE_PREFIXES,
  PRODUCT_ROUTE_PREFIXES,
  isAuthPath,
  isProductPath,
  routeMatcherPatterns,
} from '@agiworkforce/types/product-routes';

/**
 * The route contract decides two different things with two different rules.
 *
 * `isProductPath` requires a segment boundary, so `/chatter` is not `/chat`.
 * The patterns handed to the proxy's matcher use `(.*)`, a bare suffix
 * wildcard, so `/chatter` is `/chat(.*)`. The two agree only while no route in
 * the app sits between them, which is a property of the routes rather than of
 * either rule. This is what notices when someone adds one.
 */

const APP = join(process.cwd(), 'app');

function topLevelRouteSegments(): string[] {
  return readdirSync(APP)
    .filter((entry) => statSync(join(APP, entry)).isDirectory())
    .filter((entry) => entry !== 'api' && entry !== '__tests__')
    .filter((entry) => !entry.startsWith('(') && !entry.startsWith('[') && !entry.startsWith('_'));
}

function patternToRegExp(pattern: string): RegExp {
  return new RegExp(`^${pattern.replace('(.*)', '').replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}.*$`);
}

describe('the route contract and the proxy patterns classify the same app', () => {
  const segments = topLevelRouteSegments();

  it('finds the routes to check', () => {
    expect(segments.length).toBeGreaterThan(20);
  });

  it('has no route that the wildcard claims and the predicate refuses', () => {
    const productPatterns = routeMatcherPatterns(PRODUCT_ROUTE_PREFIXES);
    const disagreements = segments.filter((segment) => {
      const path = `/${segment}`;
      const wildcardClaims = productPatterns.some((pattern) => patternToRegExp(pattern).test(path));
      return wildcardClaims !== isProductPath(path);
    });

    expect(
      disagreements,
      `these routes start with a product prefix without being part of it, so the proxy would gate them while the desktop shell opened them in a browser: ${disagreements.join(', ')}`,
    ).toEqual([]);
  });

  it('classifies every route as product, auth, or marketing, never two at once', () => {
    for (const segment of segments) {
      const path = `/${segment}`;
      expect(isProductPath(path) && isAuthPath(path), path).toBe(false);
    }
  });

  it('gives every auth prefix that owns a directory a real page', () => {
    const onDisk = new Set(segments.map((segment) => `/${segment}`));
    const missing = AUTH_ROUTE_PREFIXES.filter(
      (prefix) => prefix !== '/__clerk' && !onDisk.has(prefix),
    );

    expect(missing, `auth prefixes with no route behind them: ${missing.join(', ')}`).toEqual([]);
  });
});
