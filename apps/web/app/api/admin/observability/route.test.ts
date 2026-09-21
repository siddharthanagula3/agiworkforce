import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  requirePlatformAdmin: vi.fn(),
  getObservabilityBreakdown: vi.fn(),
  explainManagedUsageRequest: vi.fn(),
  resolveObservabilityWindow: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/auth-guards', () => ({ requirePlatformAdmin: mocks.requirePlatformAdmin }));
vi.mock('@/lib/services/route-cache-observability-service', () => ({
  getObservabilityBreakdown: mocks.getObservabilityBreakdown,
  explainManagedUsageRequest: mocks.explainManagedUsageRequest,
  resolveObservabilityWindow: mocks.resolveObservabilityWindow,
}));

import { NextRequest } from 'next/server';

import { GET } from './route';
import { GET as EXPLAIN } from './explain/route';

const WINDOW = {
  from: new Date('2026-09-01T00:00:00.000Z'),
  to: new Date('2026-09-02T00:00:00.000Z'),
};

const ROW = {
  key: 'anthropic/claude',
  requests: 40,
  cacheReadTokens: 900,
  cacheWriteTokens: 100,
  inputTokens: 2_000,
  cacheHitRate: 0.45,
  actualCostCents: 120,
  retailCostCents: 300,
  retailCoverage: 1,
  valueMultiplier: 2.5,
  fallbackCount: 2,
  latencyP50Ms: 400,
  latencyP95Ms: 1_800,
};

const EXPLAIN_ROW = {
  userId: 'usr_1',
  idempotencyKey: 'idem_1',
  requestedProvider: 'anthropic',
  requestedModel: 'claude',
  deliveredProvider: 'openai',
  deliveredModel: 'gpt',
  routeId: 'openai/gpt',
  fallbackOccurred: true,
  fallbackReason: 'provider_unavailable',
  fallbackSequence: [{ routeId: 'anthropic/claude' }],
  cacheReadTokens: 10,
  cacheWriteTokens: 5,
  inputTokens: 100,
  actualCostCents: 7,
  retailCostCents: 20,
  valueMultiplier: 2.85,
  latencyMs: 950,
  status: 'completed',
  createdAt: '2026-09-01T12:00:00.000Z',
};

function request(path: string) {
  return new NextRequest(`https://agiworkforce.com/api/admin/observability${path}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.requirePlatformAdmin.mockResolvedValue({ userId: 'admin-1' });
  mocks.resolveObservabilityWindow.mockReturnValue(WINDOW);
  mocks.getObservabilityBreakdown.mockResolvedValue([ROW]);
  mocks.explainManagedUsageRequest.mockResolvedValue(EXPLAIN_ROW);
});

describe('GET /api/admin/observability', () => {
  it('reads nothing when the caller is not a platform admin', async () => {
    mocks.requirePlatformAdmin.mockRejectedValue(new Error('not an admin'));
    const response = await GET(request(''));
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(mocks.getObservabilityBreakdown).not.toHaveBeenCalled();
  });

  it('stops at the rate limiter before it reads anything', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));
    const response = await GET(request(''));
    expect(response.status).toBe(429);
    expect(mocks.requirePlatformAdmin).not.toHaveBeenCalled();
  });

  it('breaks usage down by every dimension the console offers', async () => {
    for (const dimension of ['route', 'model', 'user', 'tenant'] as const) {
      await GET(request(`?dimension=${dimension}`));
      expect(mocks.getObservabilityBreakdown).toHaveBeenCalledWith(
        dimension,
        WINDOW.from,
        WINDOW.to,
      );
    }
  });

  it('falls back to the route breakdown rather than trusting an unknown dimension', async () => {
    await GET(request('?dimension=; drop table'));
    expect(mocks.getObservabilityBreakdown).toHaveBeenCalledWith('route', WINDOW.from, WINDOW.to);
  });

  it('returns latency, cache and cost on every row, with the window it covers', async () => {
    const body = (await (await GET(request(''))).json()) as {
      dimension: string;
      from: string;
      to: string;
      rows: (typeof ROW)[];
    };

    expect(body.dimension).toBe('route');
    expect(body.from).toBe(WINDOW.from.toISOString());
    expect(body.to).toBe(WINDOW.to.toISOString());
    const [row] = body.rows;
    for (const field of [
      'requests',
      'cacheHitRate',
      'actualCostCents',
      'latencyP50Ms',
      'latencyP95Ms',
      'fallbackCount',
    ] as const) {
      expect(row, field).toHaveProperty(field);
    }
  });

  it('carries the request id a reporter quotes on the answer', async () => {
    const response = await GET(request(''));
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f]{32}$/u);
  });
});

describe('GET /api/admin/observability/explain', () => {
  it('needs both halves of the request key before it looks anything up', async () => {
    for (const query of ['', '?userId=usr_1', '?idempotencyKey=idem_1']) {
      const response = await EXPLAIN(request(`/explain${query}`));
      expect(response.status).toBe(400);
    }
    expect(mocks.explainManagedUsageRequest).not.toHaveBeenCalled();
  });

  it('says plainly that nothing matched rather than inventing a row', async () => {
    mocks.explainManagedUsageRequest.mockResolvedValue(null);
    const response = await EXPLAIN(request('/explain?userId=usr_1&idempotencyKey=idem_1'));
    expect(response.status).toBe(404);
  });

  it('attributes one request to the model and provider that actually served it', async () => {
    const body = (await (
      await EXPLAIN(request('/explain?userId=usr_1&idempotencyKey=idem_1'))
    ).json()) as { explain: typeof EXPLAIN_ROW };

    expect(body.explain.requestedModel).toBe('claude');
    expect(body.explain.deliveredModel).toBe('gpt');
    expect(body.explain.deliveredProvider).toBe('openai');
    expect(body.explain.routeId).toBe('openai/gpt');
    expect(body.explain.fallbackOccurred).toBe(true);
    expect(body.explain.fallbackReason).toBe('provider_unavailable');
    expect(body.explain.latencyMs).toBe(950);
    expect(body.explain.actualCostCents).toBe(7);
  });

  it('refuses a caller who is not a platform admin', async () => {
    mocks.requirePlatformAdmin.mockRejectedValue(new Error('not an admin'));
    const response = await EXPLAIN(request('/explain?userId=usr_1&idempotencyKey=idem_1'));
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(mocks.explainManagedUsageRequest).not.toHaveBeenCalled();
  });
});
