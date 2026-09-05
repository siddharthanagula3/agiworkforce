import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { listCanonicalModels } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(() => Promise.resolve(null)),
}));
vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn(() => null),
  getCorsHeaders: vi.fn(() => ({})),
  getSecurityHeaders: vi.fn(() => ({})),
}));
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('@/lib/services/provider-availability-service', () => ({
  getProviderAvailabilityMap: vi.fn(() => Promise.resolve({})),
}));

import { GET } from './route';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/models token-context semantics', () => {
  it('uses null instead of inventing a token window for a character-bounded video API', async () => {
    const response = await GET(new NextRequest('https://example.com/api/models'));
    const payload = await response.json();
    const catalogVideoModel = listCanonicalModels().find(
      (model) => model.modelType === 'video' && model.contextWindow === undefined,
    );
    if (!catalogVideoModel) throw new Error('Expected a character-bounded catalog video model');
    const projectedVideoModel = payload.models.find(
      (model: { id: string }) => model.id === catalogVideoModel.id,
    );

    expect(response.status).toBe(200);
    expect(projectedVideoModel).toMatchObject({
      id: catalogVideoModel.id,
      category: 'video',
      contextWindow: null,
    });
    expect(
      payload.models.every(
        (model: { contextWindow: number | null }) =>
          model.contextWindow === null ||
          (Number.isFinite(model.contextWindow) && model.contextWindow > 0),
      ),
    ).toBe(true);
  });

  it('labels scalar rates as base and projects every catalog input-length tier', async () => {
    const catalogModel = listCanonicalModels().find(
      (model) => (model.inputTokenPricingTiers?.length ?? 0) >= 1,
    );
    if (!catalogModel?.inputTokenPricingTiers) {
      throw new Error('Expected a multi-band catalog pricing fixture');
    }

    const response = await GET(new NextRequest('https://example.com/api/models'));
    const payload = await response.json();
    const projected = payload.models.find((model: { id: string }) => model.id === catalogModel.id);

    expect(response.status).toBe(200);
    expect(projected.pricing).toMatchObject({
      basis: 'base',
      inputPerMillion: catalogModel.inputCost,
      outputPerMillion: catalogModel.outputCost,
    });
    expect(projected.pricing.inputTokenPricingTiers).toEqual(
      catalogModel.inputTokenPricingTiers.map((tier) => ({
        thresholdTokens: tier.thresholdTokens,
        inputPerMillion: tier.inputCost,
        outputPerMillion: tier.outputCost,
        ...(tier.cached_input === undefined ? {} : { cachedInputPerMillion: tier.cached_input }),
        ...(tier.cached_write === undefined ? {} : { cachedWritePerMillion: tier.cached_write }),
        ...(tier.cached_write_1h === undefined
          ? {}
          : { cachedWrite1hPerMillion: tier.cached_write_1h }),
      })),
    );
    expect(
      payload.models.every(
        (model: { pricing: { basis: string; inputTokenPricingTiers: unknown[] } }) =>
          model.pricing.basis === 'base' && Array.isArray(model.pricing.inputTokenPricingTiers),
      ),
    ).toBe(true);
  });
});
