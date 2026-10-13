import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  ACTION_SUFFIX,
  RSC_SEGMENTS_DIR_SUFFIX,
  RSC_SEGMENT_SUFFIX,
} from 'next/dist/lib/constants';
import { PRODUCT_ROUTE_PREFIXES } from '@agiworkforce/types/product-routes';
import { getIdentityProvider } from '../lib/server/identity';

/**
 * The other proxy tests replace the identity provider's route matcher with a
 * stand-in that already stops at a path segment. The real one does not, so
 * those tests passed while `/open(.*)` sent a signed-out reader of
 * `/openapi.json` to sign in. This file keeps the real matcher and replaces
 * only the session step.
 */

const identitySession = { paths: [] as string[] };

const ORIGIN = 'https://agiworkforce.com';
const EVENT = {} as never;

async function signedOut(pathname: string): Promise<Response> {
  const { proxy } = await import('../proxy');
  const response = await proxy(new NextRequest(`${ORIGIN}${pathname}`), EVENT);
  if (!response) throw new Error(`the proxy returned nothing for ${pathname}`);
  return response;
}

function signInRedirectFor(pathname: string): string {
  return `${ORIGIN}/login?redirectTo=${encodeURIComponent(pathname)}`;
}

describe('the proxy gates a product route at its path segment, not at its spelling', () => {
  beforeEach(() => {
    identitySession.paths = [];
    vi.spyOn(getIdentityProvider().middleware, 'withSession').mockImplementation(
      (handler) => (request) => {
        identitySession.paths.push(request.nextUrl.pathname);
        return handler(request);
      },
    );
  });

  it('preserves the provider matcher semantics behind the identity port', () => {
    const unboundedMatcher = getIdentityProvider().middleware.createRouteMatcher(['/open(.*)']);

    expect(unboundedMatcher(new NextRequest(`${ORIGIN}/openapi.json`))).toBe(true);
  });

  it('serves the published OpenAPI bundle to a signed-out reader', async () => {
    const response = await signedOut('/openapi.json');

    expect(response.headers.get('location')).toBeNull();
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(identitySession.paths).toEqual([]);
  });

  it('still sends a signed-out visitor to sign in from /open and everything under it', async () => {
    for (const pathname of ['/open', '/open/anything', '/open/anything/deeper.json']) {
      const response = await signedOut(pathname);

      expect(response.status, pathname).toBe(307);
      expect(response.headers.get('location'), pathname).toBe(signInRedirectFor(pathname));
    }
  });

  it('leaves a sibling that only starts with a product prefix alone', async () => {
    for (const prefix of PRODUCT_ROUTE_PREFIXES) {
      for (const pathname of [`${prefix}er`, `${prefix}-sibling`, `${prefix}api.json`]) {
        const response = await signedOut(pathname);

        expect(response.headers.get('location'), pathname).toBeNull();
        expect(response.status, pathname).toBe(200);
      }
    }
    expect(identitySession.paths).toEqual([]);
  });

  it('keeps every product prefix gating what sits beneath it', async () => {
    for (const prefix of PRODUCT_ROUTE_PREFIXES) {
      const pathname = `${prefix}/anything`;
      const response = await signedOut(pathname);

      expect(response.status, pathname).toBe(307);
      expect(response.headers.get('location'), pathname).toBe(signInRedirectFor(pathname));
    }
  });

  it('keeps the forms Next serves a product route under behind the same gate', async () => {
    for (const prefix of PRODUCT_ROUTE_PREFIXES) {
      for (const pathname of [
        `${prefix}${RSC_SEGMENTS_DIR_SUFFIX}/_tree${RSC_SEGMENT_SUFFIX}`,
        `${prefix}${ACTION_SUFFIX}`,
      ]) {
        const response = await signedOut(pathname);

        expect(response.status, pathname).toBe(307);
      }
    }
  });
});
