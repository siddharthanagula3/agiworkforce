import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const admitManagedTurnSlot = () => ({
  admitted: true,
  limit: null,
  active: 0,
  slot: { release: async () => {} },
});
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
  acquireManagedTurnSlot: vi.fn(async () => admitManagedTurnSlot()),
}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn().mockResolvedValue(null) }));

const tierMocks = vi.hoisted(() => ({
  canAccessModel: vi.fn((_model: string, _tier: string) => true),
}));
vi.mock('@/lib/model-tiers', () => ({
  canAccessModel: (model: string, tier: string) => tierMocks.canAccessModel(model, tier),
}));
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
vi.mock('@/lib/egress-policy', () => ({
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

const routingMocks = vi.hoisted(() => ({
  resolveAutoRoute: vi.fn(),
}));
vi.mock('@agiworkforce/routing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agiworkforce/routing')>()),
  resolveAutoRoute: (...args: unknown[]) => routingMocks.resolveAutoRoute(...args),
}));

const providerControl = vi.hoisted(() => ({
  anthropicChunks: [] as Array<Record<string, unknown>>,
  anthropicCalls: 0,
  openaiCalls: 0,
}));

vi.mock('@agiworkforce/providers-anthropic', () => ({
  createAnthropicAdapter: vi.fn(() => ({
    id: 'anthropic',
    label: 'Anthropic',
    auth: [],
    config: {},
    async catalog() {
      return [];
    },
    async *stream() {
      providerControl.anthropicCalls += 1;
      for (const chunk of providerControl.anthropicChunks) yield chunk;
    },
  })),
}));
vi.mock('@agiworkforce/providers-openai', () => ({
  createOpenAIAdapter: vi.fn(() => ({
    id: 'openai',
    label: 'OpenAI',
    auth: [],
    config: {},
    async catalog() {
      return [];
    },
    async *stream() {
      providerControl.openaiCalls += 1;
      yield { type: 'text-delta', delta: 'Fallback served this.' };
      yield { type: 'usage', inputTokens: 10, outputTokens: 5 };
      yield { type: 'stop', reason: 'end_turn' };
    },
  })),
}));
vi.mock('@agiworkforce/providers-google', () => ({
  createGoogleAdapter: vi.fn(() => ({
    id: 'google',
    label: 'Google',
    auth: [],
    config: {},
    async catalog() {
      return [];
    },
    async *stream() {
      yield { type: 'stop', reason: 'end_turn' };
    },
  })),
}));

function inertCompatAdapter(providerId: string) {
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
vi.mock('@agiworkforce/providers-minimax', () => inertCompatAdapter('Minimax'));
vi.mock('@agiworkforce/providers-moonshot', () => inertCompatAdapter('Moonshot'));
vi.mock('@agiworkforce/providers-zhipu', () => inertCompatAdapter('Zhipu'));
vi.mock('@agiworkforce/providers-qwen', () => inertCompatAdapter('Qwen'));
vi.mock('@agiworkforce/providers-openrouter', () => inertCompatAdapter('OpenRouter'));
vi.mock('@agiworkforce/providers-deepseek', () => inertCompatAdapter('DeepSeek'));
vi.mock('@agiworkforce/providers-xai', () => inertCompatAdapter('XAI'));
vi.mock('@agiworkforce/providers-perplexity', () => inertCompatAdapter('Perplexity'));

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
  finalize: vi.fn((_input: Record<string, unknown>) =>
    Promise.resolve({
      requestStatus: 'completed',
      operationResult: 'finalized',
      settlementStatus: 'succeeded',
      actualCostCents: 4,
    }),
  ),
  delivered: vi.fn(() => Promise.resolve()),
}));
const rlsMocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: rlsMocks.getUserScopedDb,
}));
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

const mockGetProviderFromModel = vi.fn();
vi.mock('@/lib/services/provider-adapter-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/provider-adapter-service')>();
  return {
    ...actual,
    resolveProviderFromModel: (...args: unknown[]) => mockGetProviderFromModel(...args),
  };
});
vi.mock('@/lib/services/llm-cost-calculator', () => ({
  LLMCostCalculator: {
    estimateCost: vi.fn(() => 5),
    calculateCost: vi.fn(() => 4),
    getInputCostPerMtok: vi.fn(() => 3.0),
    getCacheWriteCostPerMtok: vi.fn(() => 3.0),
  },
  normalizeProviderId: (provider: string | null | undefined) =>
    typeof provider === 'string' ? provider.toLowerCase() : null,
}));

import { POST } from '@/app/api/llm/v1/chat/completions/route';

const PRIMARY = 'fo-primary-model';
const FALLBACK = 'fo-fallback-model';
const SECOND_ANTHROPIC = 'fo-primary-sibling-model';

function makeRequest(model: string, stream: boolean): NextRequest {
  return new NextRequest('http://localhost/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
      'Idempotency-Key': 'test-managed-failover',
      'x-agi-surface': 'web',
    },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], stream }),
  });
}

function selectedRoute(modelKey: string, fallbacks: string[]) {
  return {
    status: 'selected' as const,
    modelKey,
    provider: 'anthropic',
    providerModelId: modelKey,
    routeId: `route-${modelKey}`,
    harnessId: 'web/chat',
    taskType: 'simple_chat',
    reason: 'test',
    fallbacks: fallbacks.map((fallbackKey) => ({
      modelKey: fallbackKey,
      provider: 'openai',
      providerModelId: fallbackKey,
      routeId: `route-${fallbackKey}`,
      harnessId: 'web/chat',
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  providerControl.anthropicChunks = [];
  providerControl.anthropicCalls = 0;
  providerControl.openaiCalls = 0;

  tierMocks.canAccessModel.mockReturnValue(true);
  mockGetClerkAuthUser.mockResolvedValue({ userId: 'user-1', email: 'u@example.com' });
  mockGetSubscription.mockResolvedValue({
    id: 'sub_1',
    status: 'active',
    plan_tier: 'pro',
    stripe_price_id: 'price_pro',
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
  managedUsageMocks.reserve.mockImplementation(async (input) => ({
    db: input.db,
    userId: input.userId,
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
    leaseToken: 'lease-test',
    estimatedCostCents: input.estimatedCostCents,
  }));
  mockGetProviderFromModel.mockImplementation((model: string) =>
    model === FALLBACK ? 'openai' : 'anthropic',
  );
  routingMocks.resolveAutoRoute.mockImplementation((input: { selection: string }) =>
    input.selection === 'auto'
      ? selectedRoute(PRIMARY, [FALLBACK])
      : selectedRoute(input.selection, []),
  );
});

function anthropicFailsWith(code: string, message: string): void {
  providerControl.anthropicChunks = [
    { type: 'error', code, message, retryable: true },
    { type: 'stop', reason: 'error' },
  ];
}

describe('managed failover, non-streaming', () => {
  it('success-after-fallback: a 503 primary rotates to the fallback, which serves; attribution and settlement follow the ACTUAL server; one reservation, one settlement', async () => {
    anthropicFailsWith('503', 'upstream unavailable');

    const response = await POST(makeRequest('auto', false));
    expect(response.status).toBe(200);

    const data = (await response.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
      x_agi_workforce?: { provider?: string };
    };
    expect(providerControl.anthropicCalls).toBe(1);
    expect(providerControl.openaiCalls).toBe(1);
    expect(data.choices?.[0]?.message?.content).toBe('Fallback served this.');
    expect(data.model).toBe(FALLBACK);
    expect(data.x_agi_workforce?.provider).toBe('openai');

    expect(managedUsageMocks.reserve).toHaveBeenCalledTimes(1);
    expect(managedUsageMocks.finalize).toHaveBeenCalledTimes(1);
    expect(managedUsageMocks.finalize.mock.calls[0]![0]).toMatchObject({ outcome: 'completed' });
  });

  it('rotates after a credential rejection: a 401 condemns the anthropic account, not the turn; one reservation, one completed settlement', async () => {
    anthropicFailsWith('401', 'authentication error');

    const response = await POST(makeRequest('auto', false));
    expect(response.status).toBe(200);
    expect(providerControl.anthropicCalls).toBe(1);
    expect(providerControl.openaiCalls).toBe(1);
    expect(managedUsageMocks.reserve).toHaveBeenCalledTimes(1);
    expect(managedUsageMocks.finalize).toHaveBeenCalledTimes(1);
    expect(managedUsageMocks.finalize.mock.calls[0]![0]).toMatchObject({ outcome: 'completed' });
  });

  it('skips the remaining plan routes on the provider whose credential was rejected', async () => {
    anthropicFailsWith('401', 'authentication error');
    routingMocks.resolveAutoRoute.mockImplementation((input: { selection: string }) =>
      input.selection === 'auto'
        ? selectedRoute(PRIMARY, [SECOND_ANTHROPIC, FALLBACK])
        : selectedRoute(input.selection, []),
    );

    const response = await POST(makeRequest('auto', false));
    expect(response.status).toBe(200);
    expect(providerControl.anthropicCalls).toBe(1);
    expect(providerControl.openaiCalls).toBe(1);
  });

  it('surfaces the credential failure when every remaining route is on the rejected provider', async () => {
    anthropicFailsWith('401', 'authentication error');
    routingMocks.resolveAutoRoute.mockImplementation((input: { selection: string }) =>
      input.selection === 'auto'
        ? selectedRoute(PRIMARY, [SECOND_ANTHROPIC])
        : selectedRoute(input.selection, []),
    );

    const response = await POST(makeRequest('auto', false));
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(providerControl.anthropicCalls).toBe(1);
    expect(providerControl.openaiCalls).toBe(0);
    expect(managedUsageMocks.reserve).toHaveBeenCalledTimes(1);
    expect(managedUsageMocks.finalize).toHaveBeenCalledTimes(1);
    expect(managedUsageMocks.finalize.mock.calls[0]![0]).toMatchObject({ outcome: 'failed' });
  });

  it('rotates Auto on a direct-provider 429 before any response bytes are sent', async () => {
    anthropicFailsWith('429', 'rate limit exceeded');

    const response = await POST(makeRequest('auto', false));
    expect(response.status).toBe(200);
    expect(providerControl.openaiCalls).toBe(1);
  });

  it('explicit-never-rotates: an explicit selection with a 503 fails without rotation (the plan is structurally empty)', async () => {
    anthropicFailsWith('503', 'upstream unavailable');

    const response = await POST(makeRequest(PRIMARY, false));
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(providerControl.openaiCalls).toBe(0);
  });

  it('tier-recheck-per-attempt: a candidate the ladder no longer admits is skipped, and with no admissible candidate the original failure surfaces', async () => {
    anthropicFailsWith('503', 'upstream unavailable');
    tierMocks.canAccessModel.mockImplementation((model: string) => model !== FALLBACK);

    const response = await POST(makeRequest('auto', false));
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(providerControl.openaiCalls).toBe(0);
    expect(tierMocks.canAccessModel).toHaveBeenCalledWith(FALLBACK, 'pro');
  });
});

describe('managed failover, streaming', () => {
  it('success-after-fallback: the fallback serves the SSE stream, stamped with the actual serving model; no failed-attempt text leaks', async () => {
    anthropicFailsWith('503', 'upstream unavailable');

    const response = await POST(makeRequest('auto', true));
    expect(response.status).toBe(200);
    const body = await response.text();

    expect(providerControl.openaiCalls).toBe(1);
    expect(body).toContain('Fallback served this.');
    expect(body).toContain(FALLBACK);
    expect(body).not.toContain('upstream unavailable');
    expect(body).not.toContain(PRIMARY);

    expect(managedUsageMocks.reserve).toHaveBeenCalledTimes(1);
    expect(managedUsageMocks.finalize).toHaveBeenCalledTimes(1);
    expect(managedUsageMocks.finalize.mock.calls[0]![0]).toMatchObject({ outcome: 'completed' });
  });

  it('never-mid-stream: once the primary delivered its first byte, a later failure keeps current behavior, no rotation, no second provider call', async () => {
    providerControl.anthropicChunks = [
      { type: 'text-delta', delta: 'primary partial text' },
      { type: 'error', code: '503', message: 'upstream died mid-stream', retryable: true },
      { type: 'stop', reason: 'error' },
    ];

    const response = await POST(makeRequest('auto', true));
    expect(response.status).toBe(200);
    const body = await response.text();

    expect(body).toContain('primary partial text');
    expect(providerControl.openaiCalls).toBe(0);
  });
});
