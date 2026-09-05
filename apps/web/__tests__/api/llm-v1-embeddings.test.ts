import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getModels, requireProviderDefaultModel } from '@agiworkforce/types';
import { createError } from '@/lib/errors';

const EMBEDDING_MODEL = getModels({ modelTypes: ['embedding'] })[0]!;
const CHAT_MODEL_ID = requireProviderDefaultModel('anthropic');
const IDEMPOTENCY_KEY = 'test.embeddings-contract.request-key';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(async () => 'user-1'),
  reserve: vi.fn(async () => ({ reservationId: 'reservation-1' })),
  finalize: vi.fn(async () => ({})),
  getSubscription: vi.fn(async () => ({ plan_tier: 'pro', status: 'active' })),
  fetch: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-chat', () => ({
  requireCurrentUserId: (...args: unknown[]) =>
    (mocks.requireUser as unknown as (...a: unknown[]) => unknown)(...args),
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

const { POST } = await import('@/app/api/llm/v1/embeddings/route');

function post(
  body: unknown,
  headers: Record<string, string> = { 'Idempotency-Key': IDEMPOTENCY_KEY },
) {
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
  mocks.requireUser.mockResolvedValue('user-1' as never);
  mocks.reserve.mockResolvedValue({ reservationId: 'reservation-1' } as never);
  mocks.getSubscription.mockResolvedValue({ plan_tier: 'pro', status: 'active' } as never);
  vi.stubGlobal('fetch', mocks.fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env['GOOGLE_API_KEY'];
});

describe('POST /api/llm/v1/embeddings, authentication', () => {
  it('rejects an unauthenticated request before reserving or calling the provider', async () => {
    mocks.requireUser.mockRejectedValueOnce(createError.unauthorized());

    const response = await POST(post({ input: 'hello' }));
    const body = (await response.json()) as { error?: { code?: string } };

    expect(response.status).toBe(401);
    expect(body.error?.code).toBe('UNAUTHORIZED');
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

describe('POST /api/llm/v1/embeddings, success envelope', () => {
  it('returns the OpenAI-shaped embeddings envelope with usage', async () => {
    const vectors = [
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ];
    googleReturns(vectors);

    const response = await POST(post({ input: ['first', 'second'] }));
    const body = (await response.json()) as {
      object: string;
      data: Array<{ object: string; index: number; embedding: number[] }>;
      model: string;
      usage: { prompt_tokens: number; total_tokens: number };
    };

    expect(response.status).toBe(200);
    expect(body.object).toBe('list');
    expect(body.model).toBe(EMBEDDING_MODEL.id);
    expect(body.data).toEqual([
      { object: 'embedding', index: 0, embedding: vectors[0] },
      { object: 'embedding', index: 1, embedding: vectors[1] },
    ]);
    expect(body.usage.prompt_tokens).toBeGreaterThan(0);
    expect(body.usage.total_tokens).toBe(body.usage.prompt_tokens);
  });
});

describe('POST /api/llm/v1/embeddings, provider failure', () => {
  it('maps a rejected provider call to the route error envelope', async () => {
    mocks.fetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' });

    const response = await POST(post({ input: 'hello' }));
    const body = (await response.json()) as { error?: { code?: string }; requestId?: string };

    expect(response.status).toBe(503);
    expect(body.error?.code).toBe('SERVICE_UNAVAILABLE');
    expect(body.requestId).toBeTypeOf('string');
    expect(mocks.finalize).toHaveBeenCalledTimes(1);
    expect((mocks.finalize.mock.calls[0] as unknown[])[0]).toMatchObject({
      outcome: 'failed',
      actualCostCents: 0,
    });
  });
});

describe('POST /api/llm/v1/embeddings, capability gate', () => {
  it('refuses a model without the embeddings capability', async () => {
    const response = await POST(post({ input: 'hello', model: CHAT_MODEL_ID }));
    const body = (await response.json()) as { error?: { code?: string; message?: string } };

    expect(response.status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
    expect(body.error?.message).toMatch(/Unknown embedding model/);
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
