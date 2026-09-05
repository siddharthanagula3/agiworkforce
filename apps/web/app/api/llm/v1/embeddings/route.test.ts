import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { requireProviderDefaultModel, type PricedModel } from '@agiworkforce/types';

const CHAT_MODEL = requireProviderDefaultModel('anthropic');

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(async () => 'user-1'),
  reserve: vi.fn(async () => ({ reservationId: 'reservation-1' })),
  finalize: vi.fn(async () => ({})),
  getSubscription: vi.fn(async () => ({ plan_tier: 'pro' })),
  fetch: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-chat', () => ({
  requireCurrentUserId: () => mocks.requireUser(),
}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({ userId: 'user-1', db: { query: vi.fn() } })),
}));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: () => mocks.getSubscription() },
}));
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    reserveManagedUsageRequest: (...args: unknown[]) =>
      (mocks.reserve as unknown as (...a: unknown[]) => unknown)(...args),
    finalizeManagedUsageRequest: (...args: unknown[]) =>
      (mocks.finalize as unknown as (...a: unknown[]) => unknown)(...args),
  };
});

const { POST, estimateEmbeddingCostCents } = await import('./route');

const KEY = 'agi.embeddings.web.1234567890ab';
const PROVIDER_ROOT = 'https://generativelanguage.googleapis.com/';

function isProviderCall(call: unknown[]): boolean {
  return String(call[0]).startsWith(PROVIDER_ROOT);
}

function providerCalls(): unknown[][] {
  return mocks.fetch.mock.calls.filter(isProviderCall);
}

function firstProviderCallOrder(): number | undefined {
  const index = mocks.fetch.mock.calls.findIndex(isProviderCall);
  return index < 0 ? undefined : mocks.fetch.mock.invocationCallOrder[index];
}

function post(body: unknown, headers: Record<string, string> = { 'Idempotency-Key': KEY }) {
  return new NextRequest('https://agiworkforce.com/api/llm/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function googleReturns(vectors: number[][]) {
  mocks.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ embeddings: vectors.map((values) => ({ values })) }),
    text: async () => '',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env['GOOGLE_API_KEY'] = 'test-key';
  mocks.reserve.mockResolvedValue({ reservationId: 'reservation-1' } as never);
  mocks.getSubscription.mockResolvedValue({ plan_tier: 'pro' } as never);
  vi.stubGlobal('fetch', mocks.fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env['GOOGLE_API_KEY'];
});

describe('POST /api/llm/v1/embeddings, managed compute kill switch', () => {
  it('refuses before reserving or calling the provider when the kill switch is engaged', async () => {
    vi.stubEnv('AGI_MANAGED_COMPUTE_PRIVATE_BETA', '0');
    try {
      const response = await POST(post({ input: ['first'] }));
      expect(response.status).toBe(403);
      expect(mocks.reserve).not.toHaveBeenCalled();
      expect(mocks.fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('POST /api/llm/v1/embeddings, success', () => {
  it('returns one indexed embedding per input', async () => {
    googleReturns([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);

    const response = await POST(post({ input: ['first', 'second'] }));
    const body = (await response.json()) as {
      object: string;
      data: Array<{ index: number; embedding: number[] }>;
    };

    expect(response.status).toBe(200);
    expect(body.object).toBe('list');
    expect(body.data).toHaveLength(2);
    expect(body.data.map((entry) => entry.index)).toEqual([0, 1]);
    expect(body.data[1]!.embedding).toEqual([0.3, 0.4]);
  });

  it('accepts a single string and still returns the array form', async () => {
    googleReturns([[0.1]]);

    const body = (await (await POST(post({ input: 'hello' }))).json()) as { data: unknown[] };

    expect(body.data).toHaveLength(1);
  });

  it('settles the reservation as completed', async () => {
    googleReturns([[0.1]]);

    await POST(post({ input: 'hello' }));

    expect(mocks.finalize).toHaveBeenCalledTimes(1);
    expect((mocks.finalize.mock.calls[0] as unknown[])[0]).toMatchObject({ outcome: 'completed' });
  });

  it('reserves before calling the provider', async () => {
    googleReturns([[0.1]]);

    await POST(post({ input: 'hello' }));

    expect(mocks.reserve).toHaveBeenCalled();
    const providerCallOrder = firstProviderCallOrder();
    expect(providerCallOrder).toBeDefined();
    expect(mocks.reserve.mock.invocationCallOrder[0]!).toBeLessThan(providerCallOrder!);
  });
});

describe('embedding pricing contract', () => {
  it('uses strict ordered catalog tiers and returns ledger cents', () => {
    const model: PricedModel = {
      inputCost: 1_000_000,
      outputCost: 0,
      inputTokenPricingTiers: [
        { thresholdTokens: 10, inputCost: 2_000_000, outputCost: 0 },
        { thresholdTokens: 20, inputCost: 3_000_000, outputCost: 0 },
      ],
    };
    const pricedAt = new Date('2030-01-01T00:00:00Z');

    expect(estimateEmbeddingCostCents(model, 10, pricedAt)).toBe(1_000);
    expect(estimateEmbeddingCostCents(model, 11, pricedAt)).toBe(2_200);
    expect(estimateEmbeddingCostCents(model, 20, pricedAt)).toBe(4_000);
    expect(estimateEmbeddingCostCents(model, 21, pricedAt)).toBe(6_300);
  });
});

describe('POST /api/llm/v1/embeddings, billing on failure', () => {
  it('releases the reservation when the provider fails', async () => {
    mocks.fetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' });

    const response = await POST(post({ input: 'hello' }));
    expect(response.status).toBe(503);

    expect(mocks.finalize).toHaveBeenCalledTimes(1);
    expect((mocks.finalize.mock.calls[0] as unknown[])[0]).toMatchObject({
      outcome: 'failed',
      actualCostCents: 0,
    });
  });

  it('does not reserve at all for an invalid request', async () => {
    const response = await POST(post({ input: '' }));

    expect(response.status).toBe(400);
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it('rejects a request with no Idempotency-Key', async () => {
    const response = await POST(post({ input: 'hello' }, {}));

    expect(response.status).toBe(400);
    expect(providerCalls()).toEqual([]);
  });
});

describe('POST /api/llm/v1/embeddings, provider result integrity', () => {
  it('fails when the provider returns fewer vectors than inputs', async () => {
    googleReturns([[0.1]]);

    const response = await POST(post({ input: ['a', 'b'] }));

    expect(response.status).toBe(503);
    expect((mocks.finalize.mock.calls[0] as unknown[])[0]).toMatchObject({ outcome: 'failed' });
  });

  it('fails when any vector is empty', async () => {
    googleReturns([[0.1], []]);

    expect((await POST(post({ input: ['a', 'b'] }))).status).toBe(503);
  });

  it('charges nothing on a deployment with no provider key', async () => {
    delete process.env['GOOGLE_API_KEY'];

    const response = await POST(post({ input: 'hello' }));

    expect(response.status).toBe(503);
    expect(mocks.finalize).toHaveBeenCalledTimes(1);
    expect((mocks.finalize.mock.calls[0] as unknown[])[0]).toMatchObject({
      outcome: 'failed',
      actualCostCents: 0,
    });
  });
});

describe('POST /api/llm/v1/embeddings, model selection', () => {
  it('rejects a chat model and names the valid ids', async () => {
    const response = await POST(post({ input: 'hello', model: CHAT_MODEL }));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: { message?: string } };
    expect(String(body.error?.message)).toMatch(/gemini-embedding/);
  });
});
