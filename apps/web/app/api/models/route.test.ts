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

  it('publishes no price for any model', async () => {
    const response = await GET(new NextRequest('https://example.com/api/models'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.models.length).toBeGreaterThan(0);
    expect(JSON.stringify(payload)).not.toMatch(/pricing|PerMillion|inputCost|outputCost/);
  });
});

describe('GET /api/models lifecycle', () => {
  it('tells a deprecated or not-yet-live model apart from a live one', async () => {
    const response = await GET(new NextRequest('https://agiworkforce.com/api/models'));
    const body = (await response.json()) as {
      models: Array<{
        id: string;
        lifecycle: { status: string; deprecated: boolean; availability: string };
      }>;
    };
    const catalog = new Map(listCanonicalModels().map((model) => [model.id, model]));

    expect(body.models.length).toBeGreaterThan(0);
    for (const entry of body.models) {
      const source = catalog.get(entry.id);
      expect(source, entry.id).toBeDefined();
      const deprecated = source?.deprecated === true || source?.status === 'deprecated';
      expect(entry.lifecycle.deprecated, entry.id).toBe(deprecated);
      expect(entry.lifecycle.availability, entry.id).toBe(source?.availability ?? 'live');
      expect(['active', 'beta', 'deprecated']).toContain(entry.lifecycle.status);
    }
    expect(body.models.some((entry) => entry.lifecycle.deprecated)).toBe(true);
    expect(body.models.some((entry) => entry.lifecycle.availability !== 'live')).toBe(true);
  });
});
