// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { FreeQuotaCatalogue } from '@/features/models/lib/free-quota-types';
import { configuredExperientialFreeOfferings } from '@/lib/server/experiential-free';
type ScanModule0 = typeof import('next/cache');
type ScanModule1 = typeof import('@/lib/api-auth');
type ScanModule2 = typeof import('@/lib/rate-limit');
type ScanModule3 = typeof import('@/lib/server/rls-db');
type ScanModule4 = typeof import('@/lib/services/entitlement-resolution');
type ScanModule5 = typeof import('@/lib/server/experiential-free');

const mocks = vi.hoisted(() => ({
  cached: new Map<string, unknown>(),
  plan: 'free',
}));

vi.mock('next/cache', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  unstable_cache:
    (compute: () => Promise<unknown>, keyParts: string[]) => async (): Promise<unknown> => {
      const key = keyParts.join('|');
      if (!mocks.cached.has(key)) mocks.cached.set(key, await compute());
      return mocks.cached.get(key);
    },
}));
vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  assertAccountActive: async () => undefined,
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  withRateLimit: async () => null,
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  getUserScopedDb: async () => ({ userId: 'fixture-user', organizationId: null, db: {} }),
}));
vi.mock('@/lib/services/entitlement-resolution', async (importOriginal) => ({
  ...(await importOriginal<ScanModule4>()),
  resolveEntitledPlanTier: async () => mocks.plan,
}));
vi.mock('@/lib/server/experiential-free', async (importOriginal) => ({
  ...(await importOriginal<ScanModule5>()),
  experientialFreeConfiguration: () => ({
    baseUrl: 'https://api.experientiallabs.ai/v1',
    apiKey: 'fixture-key',
  }),
}));

const { GET } = await import('./route');

const promoted = configuredExperientialFreeOfferings()[0]!;
const promotedSlug = promoted.offering.providerModelId!;

function provider(options: { grantsStatus?: number } = {}) {
  return vi.fn(async (url: URL) => {
    if (url.pathname === '/api/v1/models') {
      return options.grantsStatus
        ? new Response('{}', { status: options.grantsStatus })
        : Response.json({
            data: [{ id: `vendor/${promotedSlug}:free`, canonical_slug: promotedSlug }],
          });
    }
    return Response.json({ promotions: [{ free: true, slugs: [promotedSlug] }] });
  });
}

async function catalogue(): Promise<{ status: number; body: FreeQuotaCatalogue }> {
  const response = await GET(
    new NextRequest('https://agiworkforce.com/api/models/experiential-free'),
  );
  return { status: response.status, body: await response.json() };
}

function ready(body: FreeQuotaCatalogue): string[] {
  return body.models.filter((model) => model.status === 'ready').map((model) => model.key);
}

beforeEach(() => {
  mocks.cached.clear();
  mocks.plan = 'free';
});

afterEach(() => vi.unstubAllGlobals());

it('checks the provider promotions once for every Free account in the window', async () => {
  const fetch = provider();
  vi.stubGlobal('fetch', fetch);

  const first = await catalogue();
  const second = await catalogue();

  expect(first.status).toBe(200);
  expect(ready(first.body)).toEqual([promoted.key]);
  expect(second.body.models).toEqual(first.body.models);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('never keeps a promotion check the provider failed to answer', async () => {
  vi.stubGlobal('fetch', provider({ grantsStatus: 503 }));
  expect((await catalogue()).status).toBe(503);

  const recovered = provider();
  vi.stubGlobal('fetch', recovered);
  const afterRecovery = await catalogue();
  const later = await catalogue();

  expect(afterRecovery.status).toBe(200);
  expect(ready(afterRecovery.body)).toEqual([promoted.key]);
  expect(later.body.models).toEqual(afterRecovery.body.models);
  expect(recovered).toHaveBeenCalledTimes(2);
});

it('answers a paid account without asking the provider', async () => {
  mocks.plan = 'max_15x';
  const fetch = provider();
  vi.stubGlobal('fetch', fetch);

  expect((await catalogue()).status).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
});
