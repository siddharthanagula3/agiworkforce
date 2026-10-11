import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  FREE_MODEL_PROMOTION_PATH,
  FreeModelPromotionResponseSchema,
} from '@agiworkforce/cloud-contracts';

type PromotionTestModule0 = typeof import('@/lib/rate-limit');
type PromotionTestModule1 = typeof import('@/lib/server/rls-db');
type PromotionTestModule2 = typeof import('@/lib/api-auth');
type PromotionTestModule3 = typeof import('@/lib/services/entitlement-resolution');
type PromotionTestModule4 = typeof import('@/lib/server/free-model-promotion');
type PromotionTestModule5 = typeof import('@/lib/server/free-model-promotion-ledger');

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  planTier: 'free',
  promotion: null as null | { modelId: string; endsAtMs: number },
  capacity: true,
}));

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<PromotionTestModule0>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<PromotionTestModule1>()),
  getUserScopedDb: vi.fn(async () => ({ db: {}, userId: 'user-1' })),
}));
vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<PromotionTestModule2>()),
  assertAccountActive: vi.fn(async () => undefined),
}));
vi.mock('@/lib/services/entitlement-resolution', async (importOriginal) => ({
  ...(await importOriginal<PromotionTestModule3>()),
  resolveEntitledPlanTier: vi.fn(async () => mocks.planTier),
}));
vi.mock('@/lib/server/free-model-promotion', async (importOriginal) => ({
  ...(await importOriginal<PromotionTestModule4>()),
  readFreeModelPromotion: vi.fn(() => mocks.promotion),
}));
vi.mock('@/lib/server/free-model-promotion-ledger', async (importOriginal) => ({
  ...(await importOriginal<PromotionTestModule5>()),
  freeModelPromotionHasCapacity: vi.fn(async () => mocks.capacity),
}));

import { GET } from '../route';

const ENDS_AT_MS = Date.parse('2026-10-24T23:59:59Z');

async function offer() {
  const response = await GET(
    new NextRequest(`https://agiworkforce.com${FREE_MODEL_PROMOTION_PATH}`),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  return FreeModelPromotionResponseSchema.parse(await response.json()).promotion;
}

describe(`GET ${FREE_MODEL_PROMOTION_PATH}`, () => {
  beforeEach(() => {
    mocks.planTier = 'free';
    mocks.promotion = { modelId: 'promoted-model', endsAtMs: ENDS_AT_MS };
    mocks.capacity = true;
  });

  it('offers a Free account the promoted model and its end date', async () => {
    expect(await offer()).toEqual({
      modelId: 'promoted-model',
      endsAt: new Date(ENDS_AT_MS).toISOString(),
    });
  });

  it('offers nothing to a paid plan', async () => {
    mocks.planTier = 'pro';

    expect(await offer()).toBeNull();
  });

  it('stops announcing the offer once no further turn could be reserved', async () => {
    mocks.capacity = false;

    expect(await offer()).toBeNull();
  });

  it('offers nothing outside the promotion window', async () => {
    mocks.promotion = null;

    expect(await offer()).toBeNull();
  });
});
