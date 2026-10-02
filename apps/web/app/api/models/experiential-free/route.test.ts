// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { FreeQuotaCatalogue } from '@/features/models/lib/free-quota-types';
import { configuredExperientialFreeOfferings } from '@/lib/server/experiential-free';
import { RENDER_CACHE_SECONDS } from '@/lib/server/render-cache';
type ScanModule0 = typeof import('next/cache');
type ScanModule1 = typeof import('@/lib/api-auth');
type ScanModule2 = typeof import('@/lib/rate-limit');
type ScanModule3 = typeof import('@/lib/server/rls-db');
type ScanModule4 = typeof import('@/lib/services/entitlement-resolution');
type ScanModule5 = typeof import('@/lib/server/experiential-free');

const mocks = vi.hoisted(() => ({
  plan: 'free',
}));

const cache = await vi.hoisted(async () => {
  const { createStaleWhileRevalidateCache } =
    await import('@/test/next-cache-stale-while-revalidate');
  return createStaleWhileRevalidateCache();
});

vi.mock('next/cache', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  unstable_cache: cache.unstable_cache,
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

const LIVE_WINDOW_MS = RENDER_CACHE_SECONDS.liveSignal * 1_000;

function provider(options: { grantsStatus?: number; promotionEnded?: boolean } = {}) {
  return vi.fn(async (url: URL) => {
    if (url.pathname === '/api/v1/models') {
      return options.grantsStatus
        ? new Response('{}', { status: options.grantsStatus })
        : Response.json({
            data: [{ id: `vendor/${promotedSlug}:free`, canonical_slug: promotedSlug }],
          });
    }
    return Response.json({
      promotions: options.promotionEnded ? [] : [{ free: true, slugs: [promotedSlug] }],
    });
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

function passLiveWindow() {
  vi.setSystemTime(Date.now() + LIVE_WINDOW_MS + 1);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  cache.clear();
  mocks.plan = 'free';
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

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

it('asks the provider again once the live window has passed, so an ended promotion is not served', async () => {
  vi.stubGlobal('fetch', provider());
  expect(ready((await catalogue()).body)).toEqual([promoted.key]);

  passLiveWindow();
  vi.stubGlobal('fetch', provider({ promotionEnded: true }));
  const ended = await catalogue();

  expect(ended.status).toBe(200);
  expect(ready(ended.body)).toEqual([]);
});

it('refuses instead of serving the last promotions while the provider check keeps failing', async () => {
  vi.stubGlobal('fetch', provider());
  expect(ready((await catalogue()).body)).toEqual([promoted.key]);

  passLiveWindow();
  vi.stubGlobal('fetch', provider({ grantsStatus: 503 }));
  const duringFailure = await catalogue();
  await cache.settle();
  const stillFailing = await catalogue();

  expect(duringFailure.status).toBe(503);
  expect(stillFailing.status).toBe(503);
});
