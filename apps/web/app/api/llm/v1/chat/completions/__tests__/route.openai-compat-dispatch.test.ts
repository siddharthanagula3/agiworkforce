/**
 * Route-level dispatch proof for the OpenAI-compatible providers that have a
 * live, selectable Managed Web route. Providers without one are rejected by
 * canonical registry admission before adapter construction.
 * apps/web/__tests__/api/llm-v1-chat-completions-routing.test.ts already
 * applies to Anthropic/Google/OpenAI: mock each package's create*Adapter,
 * send an explicit model for that provider through the REAL route.ts POST
 * handler, and assert the response content came from THAT provider's own
 * mocked stream specifically (a distinct canned string per provider) --
 * proving route.ts's `ADAPTER_PROVIDERS[provider]` entry is really reached
 * end-to-end (adapter construction reading the right env var, `buildChatRequest`,
 * `drainToLlmResponse`, response-builder.ts), not just present in the table.
 *
 * A separate file from the main routing test rather than 9 more mocks
 * crammed into it: that file's scope is Pro-tier routing/classification
 * metadata (Task #21); this one is purely "does ADAPTER_PROVIDERS[X] wire
 * up," one assertion per provider.
 */

import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/model-tiers', () => ({
  canAccessModel: () => true,
  ECONOMY_MODELS: new Set<string>(),
  MODEL_TIER_REQUIREMENTS: {},
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
}));

// One env key per provider, all faked -- adapter-factory.ts's buildCompatAdapter
// reads `${envKeyPrefix}_API_KEY` for each.
vi.mock('@shared/utils/env', () => ({
  requireEnv: vi.fn((key: string) => `mock-${key}`),
  getOptionalEnv: vi.fn((key: string) => `mock-${key}`),
}));

function compatAdapterMock(providerId: string, content: string) {
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
        yield { type: 'text-delta', delta: content };
        yield { type: 'usage', inputTokens: 10, outputTokens: 5 };
        yield { type: 'stop', reason: 'end_turn' };
      },
    })),
  };
}

vi.mock('@agiworkforce/providers-groq', () => compatAdapterMock('Groq', 'Groq says hi.'));
vi.mock('@agiworkforce/providers-mistral', () => compatAdapterMock('Mistral', 'Mistral says hi.'));
vi.mock('@agiworkforce/providers-moonshot', () =>
  compatAdapterMock('Moonshot', 'Moonshot says hi.'),
);
vi.mock('@agiworkforce/providers-zhipu', () => compatAdapterMock('Zhipu', 'Zhipu says hi.'));
vi.mock('@agiworkforce/providers-qwen', () => compatAdapterMock('Qwen', 'Qwen says hi.'));
vi.mock('@agiworkforce/providers-openrouter', () =>
  compatAdapterMock('OpenRouter', 'OpenRouter says hi.'),
);
vi.mock('@agiworkforce/providers-deepseek', () =>
  compatAdapterMock('DeepSeek', 'DeepSeek says hi.'),
);
vi.mock('@agiworkforce/providers-xai', () => compatAdapterMock('XAI', 'XAI says hi.'));
vi.mock('@agiworkforce/providers-perplexity', () =>
  compatAdapterMock('Perplexity', 'Perplexity says hi.'),
);

// Anthropic/Google/OpenAI aren't under test here but route.ts imports their
// adapters unconditionally -- mock minimally so the module loads.
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
      yield { type: 'stop', reason: 'end_turn' };
    },
  })),
}));

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
    generateIdempotencyKey: (userId: string, operationType: string, requestId: string) =>
      `${userId}:${operationType}:${requestId}`,
  },
}));

// Quota downgrade still resolves a provider from a canonical model id through
// this service. Normal route admission derives provider identity from the
// registry-backed route decision.
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
  },
}));

import { POST } from '@/app/api/llm/v1/chat/completions/route';

function makeRequest(model: string, conversationId?: string): NextRequest {
  return new NextRequest('http://localhost/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
      'Idempotency-Key': 'test-managed-chat-request',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'hi' }],
      stream: false,
      ...(conversationId ? { conversation_id: conversationId } : {}),
    }),
  });
}

function makeSubscription() {
  return {
    id: 'sub_1',
    status: 'active',
    plan_tier: 'pro',
    stripe_price_id: 'price_pro',
    current_period_start: new Date().toISOString(),
    current_period_end: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
  };
}

const COMPAT_CASES: Array<{ provider: string; model: string; content: string }> = [
  { provider: 'mistral', model: 'mistral-large-3', content: 'Mistral says hi.' },
  { provider: 'moonshot', model: 'kimi-k2.6', content: 'Moonshot says hi.' },
  { provider: 'zhipu', model: 'glm-5.2', content: 'Zhipu says hi.' },
  { provider: 'qwen', model: 'qwen-max', content: 'Qwen says hi.' },
  { provider: 'deepseek', model: 'deepseek-v4-flash', content: 'DeepSeek says hi.' },
  { provider: 'xai', model: 'grok-4.3', content: 'XAI says hi.' },
  { provider: 'perplexity', model: 'sonar', content: 'Perplexity says hi.' },
];

describe.each(COMPAT_CASES)(
  'POST /api/llm/v1/chat/completions — $provider adapter dispatch (task #34)',
  ({ provider, model, content }) => {
    it(`routes an explicit ${provider} model through its own adapter`, async () => {
      vi.clearAllMocks();
      mockGetClerkAuthUser.mockResolvedValue({ userId: 'user-1', email: 'u@example.com' });
      mockGetSubscription.mockResolvedValue(makeSubscription());
      rlsMocks.getUserScopedDb.mockResolvedValue({ db: {}, userId: 'user-1' });
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
      mockGetProviderFromModel.mockReturnValue(provider);

      const response = await POST(makeRequest(model));
      expect(response.status).toBe(200);

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        x_agi_workforce?: { provider?: string };
      };

      expect(data.x_agi_workforce?.provider).toBe(provider);
      expect(data.choices?.[0]?.message?.content).toBe(content);
    });
  },
);

describe('Managed Web provider admission', () => {
  it.each([
    ['groq', 'groq-llama-3.3-70b'],
    ['openrouter', 'meta-llama/llama-3.3-70b-instruct:free'],
  ])('rejects %s when it has no selectable Managed Web route', async (provider, model) => {
    vi.clearAllMocks();
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user-1', email: 'u@example.com' });
    mockGetSubscription.mockResolvedValue(makeSubscription());
    mockGetProviderFromModel.mockReturnValue(provider);

    const response = await POST(makeRequest(model));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'model_route_unavailable' },
    });
    expect(mockCheckAvailable).not.toHaveBeenCalled();
  });
});

describe('Managed Web conversation ownership', () => {
  it('rejects a foreign conversation before reserving credits or starting a provider', async () => {
    vi.clearAllMocks();
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'attacker-user', email: 'a@example.com' });
    mockGetSubscription.mockResolvedValue(makeSubscription());
    const query = vi.fn().mockResolvedValue([]);
    rlsMocks.getUserScopedDb.mockResolvedValue({ db: { query }, userId: 'attacker-user' });
    mockGetProviderFromModel.mockReturnValue('mistral');

    const response = await POST(
      makeRequest('mistral-large-3', '0190a000-0000-7000-8000-0000000000cc'),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'conversation_not_found' },
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/web_conversations[\s\S]*user_id\s*=\s*\$2/i),
      ['0190a000-0000-7000-8000-0000000000cc', 'attacker-user'],
    );
    expect(managedUsageMocks.reserve).not.toHaveBeenCalled();
    expect(managedUsageMocks.providerStarted).not.toHaveBeenCalled();
  });
});
