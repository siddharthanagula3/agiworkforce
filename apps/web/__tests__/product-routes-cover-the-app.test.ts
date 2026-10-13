import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as nextConstants from 'next/dist/lib/constants';
import { normalizeRscURL } from 'next/dist/shared/lib/router/utils/app-paths';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import {
  AUTH_ROUTE_PREFIXES,
  PRODUCT_ROUTE_PREFIXES,
  SESSION_AUTH_ROUTE_PREFIXES,
  isAuthPath,
  isProductPath,
  routeMatcherPatterns,
} from '@agiworkforce/types/product-routes';
import { getIdentityProvider } from '../lib/server/identity';

/**
 * The route contract decides two different things with two different rules.
 *
 * `isProductPath` requires a segment boundary, so `/chatter` is not `/chat`.
 * The proxy's matcher reads patterns, in which `(.*)` is a bare suffix
 * wildcard: `/open(.*)` claimed the published `/openapi.json` and sent a
 * signed-out reader to sign in. A translation of those patterns written here
 * would repeat whatever its author assumed about them, so this asks the
 * matcher the proxy builds, over every route and public file the app serves.
 */

const APP = join(process.cwd(), 'app');
const PUBLIC = join(process.cwd(), 'public');
const ORIGIN = 'https://agiworkforce.com';
const DYNAMIC_SEGMENT_SAMPLE = 'sample';
const ROUTE_FILE = /^(?:page|route)\.(?:tsx?|jsx?|mdx)$/u;

const TRANSPORT_SUFFIXES = Object.entries(nextConstants)
  .filter(
    (entry): entry is [string, string] =>
      entry[0].endsWith('_SUFFIX') && typeof entry[1] === 'string',
  )
  .map(([, suffix]) => suffix);

function topLevelRouteSegments(): string[] {
  return readdirSync(APP)
    .filter((entry) => statSync(join(APP, entry)).isDirectory())
    .filter((entry) => entry !== 'api' && entry !== '__tests__')
    .filter((entry) => !entry.startsWith('(') && !entry.startsWith('[') && !entry.startsWith('_'));
}

function filesUnder(directory: string, base: string[] = []): string[][] {
  return readdirSync(directory).flatMap((entry) => {
    const full = join(directory, entry);
    return statSync(full).isDirectory() ? filesUnder(full, [...base, entry]) : [[...base, entry]];
  });
}

function servedSegment(directory: string): string | null {
  if (directory.startsWith('(') || directory.startsWith('@')) return null;
  if (!directory.startsWith('[')) return directory;
  return directory.includes('...')
    ? `${DYNAMIC_SEGMENT_SAMPLE}/${DYNAMIC_SEGMENT_SAMPLE}`
    : DYNAMIC_SEGMENT_SAMPLE;
}

function appRoutePaths(): string[] {
  const paths = filesUnder(APP)
    .filter((file) => ROUTE_FILE.test(file.at(-1) ?? ''))
    .map((file) => file.slice(0, -1))
    .filter((directories) => !directories.some((d) => d === '__tests__' || d.startsWith('_')))
    .map(
      (directories) =>
        `/${directories
          .map(servedSegment)
          .filter((segment) => segment !== null)
          .join('/')}`,
    );
  return [...new Set(paths)].sort();
}

function publicFilePaths(): string[] {
  return filesUnder(PUBLIC)
    .map((file) => `/${file.join('/')}`)
    .sort();
}

function proxyMatcherFor(prefixes: readonly string[]): (path: string) => boolean {
  const matches = getIdentityProvider().middleware.createRouteMatcher(
    routeMatcherPatterns(prefixes),
  );
  return (path) => matches(new NextRequest(normalizeRscURL(`${ORIGIN}${path}`)));
}

describe('the route contract and the proxy patterns classify the same app', () => {
  const segments = topLevelRouteSegments();
  const routes = appRoutePaths();
  const publicFiles = publicFilePaths();
  const isProtectedByProxy = proxyMatcherFor(PRODUCT_ROUTE_PREFIXES);

  it('finds the routes to check', () => {
    expect(segments.length).toBeGreaterThan(20);
    expect(routes.length).toBeGreaterThan(segments.length);
    expect(routes.some((route) => route.startsWith('/open/'))).toBe(true);
    expect(publicFiles).toContain('/openapi.json');
  });

  it('has no route or public file that the proxy gates and the predicate refuses', () => {
    const disagreements = [...routes, ...publicFiles].filter(
      (path) => isProtectedByProxy(path) !== isProductPath(path),
    );

    expect(
      disagreements,
      `the proxy and the route contract disagree about these paths, so the proxy gates something that is not the product, or the desktop shell keeps something the proxy leaves open: ${disagreements.join(', ')}`,
    ).toEqual([]);
  });

  it('leaves the published OpenAPI bundle open while /open stays gated', () => {
    expect(isProtectedByProxy('/openapi.json')).toBe(false);
    expect(isProtectedByProxy('/open')).toBe(true);
    expect(isProtectedByProxy('/open/anything')).toBe(true);
    expect(isProtectedByProxy('/opener')).toBe(false);
  });

  it('keeps every suffix the framework serves a route under behind a dot', () => {
    expect(TRANSPORT_SUFFIXES).toContain(nextConstants.RSC_SEGMENTS_DIR_SUFFIX);
    expect(TRANSPORT_SUFFIXES).toContain(nextConstants.ACTION_SUFFIX);
    for (const suffix of TRANSPORT_SUFFIXES) {
      expect(suffix.startsWith('.'), suffix).toBe(true);
    }
  });

  for (const [kind, prefixes] of [
    ['product', PRODUCT_ROUTE_PREFIXES],
    ['session auth', SESSION_AUTH_ROUTE_PREFIXES],
  ] as const) {
    const matches = proxyMatcherFor(prefixes);

    it(`matches every ${kind} prefix at its root and everything beneath it`, () => {
      for (const prefix of prefixes) {
        for (const path of [
          prefix,
          `${prefix}/`,
          `${prefix}/child`,
          `${prefix}/child/deeper.json`,
        ]) {
          expect(matches(path), path).toBe(true);
        }
      }
    });

    it(`matches no sibling that only starts with a ${kind} prefix`, () => {
      for (const prefix of prefixes) {
        for (const path of [
          `${prefix}er`,
          `${prefix}-sibling`,
          `${prefix}_sibling/child`,
          `${prefix}api.json`,
        ]) {
          expect(matches(path), path).toBe(false);
        }
      }
    });

    it(`matches every form the framework serves a ${kind} route under`, () => {
      for (const prefix of prefixes) {
        for (const path of [
          ...TRANSPORT_SUFFIXES.map((suffix) => `${prefix}${suffix}`),
          `${prefix}${nextConstants.RSC_SEGMENTS_DIR_SUFFIX}/_tree${nextConstants.RSC_SEGMENT_SUFFIX}`,
        ]) {
          expect(matches(path), path).toBe(true);
        }
      }
    });
  }

  it('classifies every route as product, auth, or marketing, never two at once', () => {
    for (const segment of segments) {
      const path = `/${segment}`;
      expect(isProductPath(path) && isAuthPath(path), path).toBe(false);
    }
  });

  it('gives every auth prefix a real page or a redirect to one', () => {
    const onDisk = new Set(segments.map((segment) => `/${segment}`));
    const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8');
    const redirected = new Set(
      [...config.matchAll(/source: '([^']+)', destination: '([^']+)'/gu)]
        .filter(([, , destination]) => isAuthPath(destination ?? ''))
        .map(([, source]) => source ?? ''),
    );
    const missing = AUTH_ROUTE_PREFIXES.filter(
      (prefix) => prefix !== '/__clerk' && !onDisk.has(prefix) && !redirected.has(prefix),
    );

    expect(missing, `auth prefixes with no route behind them: ${missing.join(', ')}`).toEqual([]);
  });
});
