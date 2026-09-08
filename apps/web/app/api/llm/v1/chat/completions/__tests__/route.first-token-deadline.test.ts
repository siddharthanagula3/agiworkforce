import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const budget = vi.hoisted(() => ({ attemptMs: 40, turnMs: 90 }));
const HANG_MS = 5_000;

vi.mock('@/lib/deadline-policy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/deadline-policy')>()),
  PROVIDER_FIRST_TOKEN_DEADLINE_MS: budget.attemptMs,
  TURN_FIRST_TOKEN_BUDGET_MS: budget.turnMs,
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
  acquireManagedTurnSlot: vi.fn(async () => ({
    admitted: true,
    limit: null,
    active: 0,
    slot: { release: async () => {} },
  })),
}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/model-tiers', () => ({ canAccessModel: vi.fn(() => true) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/prompt-cache-helper', () => ({
  calculateCacheSavings: vi.fn(() => ({
    tokensSavedByCache: 0,
    savedCostCents: 0,
    cacheWriteCostCents: 0,
  })),
  logCacheAnalytics: vi.fn(),
}));
vi.mock('@/lib/egress-policy', async (importOriginal) => ({
  ...(await importOriginal()),
  validateEgressUrl: vi.fn(),
  validateUserImageUrl: vi.fn(),
  EgressPolicyError: class EgressPolicyError extends Error {},
}));
vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn().mockReturnValue(null),
  getCorsHeaders: vi.fn().mockReturnValue({}),
  getSecurityHeaders: vi.fn().mockReturnValue({}),
  withCorsRoute: (handler: (...args: unknown[]) => unknown) => handler,
}));
vi.mock('@shared/utils/env', () => ({
  requireEnv: vi.fn((key: string) => `mock-${key}`),
  getOptionalEnv: vi.fn((key: string) => `mock-${key}`),
}));

const routingMocks = vi.hoisted(() => ({ resolveAutoRoute: vi.fn() }));
vi.mock('@agiworkforce/routing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agiworkforce/routing')>()),
  resolveAutoRoute: (...args: unknown[]) => routingMocks.resolveAutoRoute(...args),
}));

const upstream = vi.hoisted(() => ({ calls: 0, aborts: 0 }));

function inertAdapter(providerId: string) {
  return {
    [`create${providerId}Adapter`]: vi.fn(() => ({
      id: providerId.toLowerCase(),
      label: providerId,
      auth: [],
      config: {},
      async catalog() {
        return [];
      },
      async *stream() {
        yield { type: 'stop', reason: 'end_turn' };
      },
    })),
  };
}

vi.mock('@agiworkforce/providers-openrouter', () => ({
  createOpenRouterAdapter: vi.fn(() => ({
    id: 'open_router',
    label: 'OpenRouter',
    auth: [],
    config: {},
    async catalog() {
      return [];
    },
    async *stream(_request: unknown, signal: AbortSignal) {
      upstream.calls += 1;
      await new Promise<void>((resolve, reject) => {
        const stop = (): void => {
          upstream.aborts += 1;
          reject(signal.reason);
        };
        if (signal.aborted) stop();
        else signal.addEventListener('abort', stop, { once: true });
        setTimeout(resolve, HANG_MS);
      });
      yield { type: 'text-delta', delta: 'too late' };
    },
  })),
}));
vi.mock('@agiworkforce/providers-anthropic', () => inertAdapter('Anthropic'));
vi.mock('@agiworkforce/providers-openai', () => inertAdapter('OpenAI'));
vi.mock('@agiworkforce/providers-google', () => inertAdapter('Google'));
vi.mock('@agiworkforce/providers-minimax', () => inertAdapter('Minimax'));
vi.mock('@agiworkforce/providers-moonshot', () => inertAdapter('Moonshot'));
vi.mock('@agiworkforce/providers-zhipu', () => inertAdapter('Zhipu'));
vi.mock('@agiworkforce/providers-qwen', () => inertAdapter('Qwen'));
vi.mock('@agiworkforce/providers-deepseek', () => inertAdapter('DeepSeek'));
vi.mock('@agiworkforce/providers-xai', () => inertAdapter('XAI'));
vi.mock('@agiworkforce/providers-perplexity', () => inertAdapter('Perplexity'));

const mockGetClerkAuthUser = vi.fn();
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: (...args: unknown[]) => mockGetClerkAuthUser(...args),
}));
vi.mock('@/services/neon-db', () => ({ createNeonServerClient: vi.fn().mockResolvedValue({}) }));
vi.mock('@/lib/neon-db', () => ({
  getUserClient: vi.fn().mockReturnValue({}),
  getServiceClient: vi.fn(() => ({})),
}));

const managedUsageMocks = vi.hoisted(() => ({
  reserve: vi.fn(),
  providerStarted: vi.fn(() => Promise.resolve()),
  finalize: vi.fn(() =>
    Promise.resolve({
      requestStatus: 'completed',
      operationResult: 'finalized',
      settlementStatus: 'succeeded',
      actualCostCents: 0,
    }),
  ),
  delivered: vi.fn(() => Promise.resolve()),
}));
const rlsMocks = vi.hoisted(() => ({ getUserScopedDb: vi.fn() }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: rlsMocks.getUserScopedDb }));
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/managed-usage-request-service')>()),
  reserveManagedUsageRequest: managedUsageMocks.reserve,
  markManagedUsageProviderStarted: managedUsageMocks.providerStarted,
  finalizeManagedUsageRequest: managedUsageMocks.finalize,
  markManagedUsageClientDelivered: managedUsageMocks.delivered,
}));

const mockGetSubscription = vi.fn();
const mockCheckAvailable = vi.fn();
const mockDeductCredits = vi.fn();
const mockGetBalance = vi.fn();
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    getSubscription: (...args: unknown[]) => mockGetSubscription(...args),
    allocateCreditsForPeriod: vi.fn().mockResolvedValue('mock-account-id'),
  },
}));
vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    checkAvailable: (...args: unknown[]) => mockCheckAvailable(...args),
    deductCredits: (...args: unknown[]) => mockDeductCredits(...args),
    getBalance: (...args: unknown[]) => mockGetBalance(...args),
    settleCreditsDurably: vi.fn().mockResolvedValue(undefined),
    generateIdempotencyKey: (userId: string, operationType: string, requestId: string) =>
      `${userId}:${operationType}:${requestId}`,
  },
}));

vi.mock('@/lib/services/skill-catalog-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/skill-catalog-service')>()),
  loadSelectableSkillCatalog: vi.fn(async () => []),
}));
vi.mock('@/lib/services/skill-install-service', () => ({
  getSkillInstallOverrides: vi.fn(async () => new Map<string, boolean>()),
}));
vi.mock('@/lib/services/plugin-installation-service', () => ({
  listEnabledPluginIds: vi.fn(async () => []),
}));

vi.mock('@/lib/services/provider-adapter-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/provider-adapter-service')>();
  return { ...actual, resolveProviderFromModel: vi.fn(() => 'openrouter') };
});
vi.mock('@/lib/services/llm-cost-calculator', () => ({
  LLMCostCalculator: {
    calculateListCost: vi.fn(() => null),
    estimateListCost: vi.fn(() => null),
    estimateCost: vi.fn(() => 0),
    calculateCost: vi.fn(() => 0),
    getInputCostPerMtok: vi.fn(() => 0),
    getCacheWriteCostPerMtok: vi.fn(() => 0),
  },
  normalizeProviderId: (provider: string | null | undefined) =>
    typeof provider === 'string' ? provider.toLowerCase() : null,
  CACHE_WRITE_FALLBACK_MULTIPLIERS: { write5m: 1.25, write1h: 2 },
  isCacheTokensDisjointFromInput: vi.fn(() => false),
  resolveCacheRates: vi.fn(() => ({ read: 0, write5m: 0, write1h: 0 })),
}));

import { POST } from '@/app/api/llm/v1/chat/completions/route';

const FREE_ROUTE = 'openrouter-free';

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
      'Idempotency-Key': 'test-first-token-deadline',
      'x-agi-surface': 'web',
    },
    body: JSON.stringify({
      model: FREE_ROUTE,
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  upstream.calls = 0;
  upstream.aborts = 0;

  mockGetClerkAuthUser.mockResolvedValue({ userId: 'user-1', email: 'u@example.com' });
  mockGetSubscription.mockResolvedValue({
    id: 'sub_1',
    status: 'active',
    plan_tier: 'max_15x',
    stripe_price_id: 'price_max_15x',
    current_period_start: new Date().toISOString(),
    current_period_end: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
  });
  rlsMocks.getUserScopedDb.mockResolvedValue({
    db: { query: vi.fn(async () => []) },
    userId: 'user-1',
  });
  mockCheckAvailable.mockResolvedValue(true);
  mockDeductCredits.mockResolvedValue({ success: true, remaining_cents: 10000 });
  mockGetBalance.mockResolvedValue({
    account_id: 'acct-1',
    credits_remaining_cents: 10000,
    credits_allocated_cents: 20000,
  });
  managedUsageMocks.reserve.mockImplementation(async (input: Record<string, unknown>) => ({
    db: input['db'],
    userId: input['userId'],
    idempotencyKey: input['idempotencyKey'],
    requestHash: input['requestHash'],
    leaseToken: 'lease-test',
    estimatedCostCents: input['estimatedCostCents'],
  }));
  routingMocks.resolveAutoRoute.mockImplementation((input: { selection: string }) => ({
    status: 'selected' as const,
    modelKey: input.selection,
    provider: 'openrouter',
    providerModelId: input.selection,
    routeId: `route-${input.selection}`,
    harnessId: 'open-router/chat-completions-managed',
    taskType: 'simple_chat',
    reason: 'test',
    fallbacks: [],
  }));
});

/**
 * The founder's 2026-09-07 production turn: OpenRouter Free Auto accepted the
 * request and never sent a first token, so the chat function held the whole
 * 300 s platform budget and answered 504 with no body the client could read.
 */
describe('a free-route turn whose upstream never speaks', () => {
  it('answers within the first-token budget instead of holding the function open', async () => {
    const startedAt = Date.now();
    await POST(makeRequest());
    const elapsedMs = Date.now() - startedAt;

    expect(elapsedMs).toBeLessThan(HANG_MS);
    expect(upstream.calls).toBe(1);
  });

  it('names the timeout honestly instead of returning a bare gateway error', async () => {
    const response = await POST(makeRequest());

    expect(response.status).toBe(504);
    const body = (await response.json()) as {
      error?: { code?: string; type?: string; message?: string };
    };
    expect(body.error?.code).toBe('provider_timeout');
    expect(body.error?.type).toBe('timeout_error');
    expect(body.error?.message).toMatch(/took too long/i);
  });

  it('aborts the upstream request it gave up on rather than leaking the socket', async () => {
    await POST(makeRequest());

    expect(upstream.aborts).toBe(1);
  });

  it('releases the turn reservation exactly once', async () => {
    await POST(makeRequest());

    expect(managedUsageMocks.reserve).toHaveBeenCalledTimes(1);
    expect(managedUsageMocks.finalize).toHaveBeenCalledTimes(1);
    expect(managedUsageMocks.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failed' }),
    );
  });
});
