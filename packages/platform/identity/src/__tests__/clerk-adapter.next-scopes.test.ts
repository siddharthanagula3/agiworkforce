import { AsyncLocalStorage } from 'node:async_hooks';
import { createRequire } from 'node:module';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = `sk_test_${'x'.repeat(40)}`;
const PUBLISHABLE = `pk_test_${Buffer.from('example.clerk.accounts.dev$').toString('base64')}`;

vi.stubEnv('CLERK_SECRET_KEY', SECRET);
vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', PUBLISHABLE);
vi.stubEnv('CLERK_TELEMETRY_DISABLED', '1');

const runtime = globalThis as { AsyncLocalStorage?: typeof AsyncLocalStorage };
runtime.AsyncLocalStorage ??= AsyncLocalStorage;

const fromHost = createRequire(import.meta.url);
const { workAsyncStorage } = fromHost(
  'next/dist/server/app-render/work-async-storage.external.js',
) as { workAsyncStorage: AsyncLocalStorage<unknown> };
const { workUnitAsyncStorage } = fromHost(
  'next/dist/server/app-render/work-unit-async-storage.external.js',
) as { workUnitAsyncStorage: AsyncLocalStorage<unknown> };
const { HeadersAdapter } = fromHost('next/dist/server/web/spec-extension/adapters/headers.js') as {
  HeadersAdapter: { seal(headers: Headers): Headers };
};

const { ClerkIdentityProvider } = await import('../adapters/clerk');

const ROUTE = { route: '/api/status/notices', forceStatic: false, dynamicShouldError: false };

function inScope<T>(unit: object, work: () => Promise<T>): Promise<T> {
  return workAsyncStorage.run(ROUTE, () => workUnitAsyncStorage.run(unit, work));
}

const insideUnstableCache = <T>(work: () => Promise<T>) =>
  inScope({ type: 'unstable-cache', phase: 'render' }, work);

const insideRouteHandler = <T>(work: () => Promise<T>) =>
  inScope(
    {
      type: 'request',
      phase: 'render',
      headers: HeadersAdapter.seal(new Headers({ host: 'agiworkforce.com' })),
    },
    work,
  );

const identityApi = vi.fn(async (input: string | URL | Request) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.pathname.endsWith('/jwks')) return Response.json({ keys: [] });
  if (url.pathname.endsWith('/users/user_1'))
    return Response.json({ object: 'user', id: 'user_1' });
  return Response.json(
    { errors: [{ code: 'resource_not_found', message: 'not found' }] },
    {
      status: 404,
    },
  );
});

beforeEach(() => {
  identityApi.mockClear();
  vi.stubGlobal('fetch', identityApi);
});

afterAll(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('the Clerk adapter inside Next request scopes', () => {
  it('probes reachability inside an unstable_cache scope, where request headers cannot be read', async () => {
    const provider = new ClerkIdentityProvider({ secretKey: SECRET });

    await expect(insideUnstableCache(() => provider.checkReachable())).resolves.toBe(undefined);
    expect(identityApi).toHaveBeenCalledWith(
      expect.stringMatching(/\/v1\/jwks$/),
      expect.anything(),
    );
  });

  it('keeps serving account calls after a cached health check ran the probe on the same provider', async () => {
    const provider = new ClerkIdentityProvider({ secretKey: SECRET });
    await insideUnstableCache(() => provider.checkReachable()).catch(() => undefined);

    await expect(insideRouteHandler(() => provider.getUser('user_1'))).resolves.toMatchObject({
      id: 'user_1',
    });
  });

  it('builds the account client again when a call from a cache scope could not build it', async () => {
    const provider = new ClerkIdentityProvider({ secretKey: SECRET });
    await expect(insideUnstableCache(() => provider.getUser('user_1'))).rejects.toThrow();

    await expect(insideRouteHandler(() => provider.getUser('user_1'))).resolves.toMatchObject({
      id: 'user_1',
    });
  });
});
