import { expect, test, type APIResponse } from '@playwright/test';
import { RSC_SEGMENTS_DIR_SUFFIX, RSC_SEGMENT_SUFFIX } from 'next/dist/lib/constants';

const API_DOCS_PATH = '/api-docs';
const OPENAPI_PATH = '/openapi.json';
const GATED_PRODUCT_PATHS = ['/open', '/open/anything'] as const;
const GATED_TRANSPORT_PATH = `/open${RSC_SEGMENTS_DIR_SUFFIX}/_tree${RSC_SEGMENT_SUFFIX}`;
const UNROUTED_SIBLING_PATH = '/opener';
const SIGN_IN_PATH = '/login';

function redirectTarget(response: APIResponse, baseURL: string | undefined): URL {
  const location = response.headers()['location'];
  if (!location)
    throw new Error(`${response.url()} answered ${response.status()} with no location`);
  return new URL(location, baseURL);
}

test.describe('the published OpenAPI bundle is public and the product beside it is not', () => {
  test('a signed-out request receives the schema, not a sign-in redirect', async ({ request }) => {
    const response = await request.get(OPENAPI_PATH, { maxRedirects: 0 });

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    const schema = (await response.json()) as { openapi?: string; paths?: object };
    expect(schema.openapi).toMatch(/^3\./u);
    expect(Object.keys(schema.paths ?? {}).length).toBeGreaterThan(0);
  });

  test('the API docs link to the bundle from their first response', async ({ request }) => {
    const response = await request.get(API_DOCS_PATH, { maxRedirects: 0 });

    expect(response.status()).toBe(200);
    expect(await response.text()).toContain(`href="${OPENAPI_PATH}"`);
  });

  for (const path of GATED_PRODUCT_PATHS) {
    test(`${path} still sends a signed-out visitor to sign in`, async ({ request, baseURL }) => {
      const response = await request.get(path, { maxRedirects: 0 });

      expect(response.status()).toBe(307);
      const target = redirectTarget(response, baseURL);
      expect(target.pathname).toBe(SIGN_IN_PATH);
      expect(target.searchParams.get('redirectTo')).toBe(path);
    });
  }

  test('the segment form of a product route stays behind the same gate', async ({
    request,
    baseURL,
  }) => {
    const response = await request.get(GATED_TRANSPORT_PATH, { maxRedirects: 0 });

    expect(response.status()).toBe(307);
    expect(redirectTarget(response, baseURL).pathname).toBe(SIGN_IN_PATH);
  });

  test('a path that only starts with a product prefix is not sent to sign in', async ({
    request,
  }) => {
    const response = await request.get(UNROUTED_SIBLING_PATH, { maxRedirects: 0 });

    expect(response.status()).toBe(404);
  });
});
