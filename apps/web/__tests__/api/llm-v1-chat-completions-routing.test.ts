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

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
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
  getOptionalEnv: vi.fn((key: string) =>
    key === 'ANTHROPIC_API_KEY' || key === 'GOOGLE_API_KEY' || key === 'OPENAI_API_KEY'
      ? `mock-${key}`
      : undefined,
  ),
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
      yield { type: 'text-delta', delta: 'Here is the implementation...' };
      yield { type: 'usage', inputTokens: 120, outputTokens: 80 };
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
      yield { type: 'text-delta', delta: 'Gemini says hello.' };
      yield { type: 'usage', inputTokens: 50, outputTokens: 10 };
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
      yield { type: 'text-delta', delta: 'GPT says hi.' };
      yield { type: 'usage', inputTokens: 30, outputTokens: 8 };
      yield { type: 'stop', reason: 'end_turn' };
    },
  })),
}));

const mockGetClerkAuthUser = vi.fn();

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: (...args: unknown[]) => mockGetClerkAuthUser(...args),
}));

vi.mock('@/services/neon-db', () => ({
  createNeonServerClient: vi.fn().mockResolvedValue({}),
}));

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

const mockSendRequest = vi.fn();
const mockGetProviderFromModel = vi.fn();

vi.mock('@/lib/llm-providers/factory', () => ({
  LLMProviderFactory: {
    getProviderFromModel: (...args: unknown[]) => mockGetProviderFromModel(...args),
    sendRequest: (...args: unknown[]) => mockSendRequest(...args),
    streamRequest: vi.fn(),
  },
}));

vi.mock('@/lib/services/llm-cost-calculator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/llm-cost-calculator')>()),
  LLMCostCalculator: {
    estimateCost: vi.fn(() => 5),
    calculateCost: vi.fn(() => 4),
    getInputCostPerMtok: vi.fn(() => 3.0),
    getCacheWriteCostPerMtok: vi.fn(() => 3.0),
  },
}));

import { POST } from '@/app/api/llm/v1/chat/completions/route';
import { requireProviderDefaultModel } from '@agiworkforce/types';

const GOOGLE_CHAT_MODEL = requireProviderDefaultModel('google');
const OPENAI_CHAT_MODEL = requireProviderDefaultModel('openai');

function makeRequest(message: string, stream = false): NextRequest {
  return new NextRequest('http://localhost/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-pro-token',
      'Content-Type': 'application/json',
      'Idempotency-Key': 'test-managed-chat-request',
      'x-agi-surface': 'web',
    },
    body: JSON.stringify({
      model: 'auto-balanced',
      messages: [{ role: 'user', content: message }],
      stream,
    }),
  });
}

function makeRequestForModel(model: string, message: string, stream = false): NextRequest {
  return new NextRequest('http://localhost/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-pro-token',
      'Content-Type': 'application/json',
      'Idempotency-Key': 'test-managed-chat-request',
      'x-agi-surface': 'web',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: message }],
      stream,
    }),
  });
}

function makeProSubscription() {
  return {
    id: 'sub_pro_123',
    status: 'active',
    plan_tier: 'pro',
    stripe_price_id: 'price_pro',
    current_period_start: new Date().toISOString(),
    current_period_end: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
  };
}

describe('POST /api/llm/v1/chat/completions, canonical Pro-tier routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetClerkAuthUser.mockResolvedValue({ userId: 'pro-user-id', email: 'pro@example.com' });

    mockGetSubscription.mockResolvedValue(makeProSubscription());
    rlsMocks.getUserScopedDb.mockResolvedValue({
      db: { query: vi.fn(async () => []) },
      userId: 'pro-user-id',
    });

    managedUsageMocks.reserve.mockImplementation(async (input) => ({
      db: input.db,
      userId: input.userId,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      leaseToken: 'lease-test',
      estimatedCostCents: input.estimatedCostCents,
    }));

    mockCheckAvailable.mockResolvedValue(true);
    mockDeductCredits.mockResolvedValue({ success: true, remaining_cents: 10000 });
    mockGetBalance.mockResolvedValue({
      account_id: 'acct-001',
      credits_remaining_cents: 10000,
      credits_allocated_cents: 20000,
    });

    mockGetProviderFromModel.mockImplementation((model: string) => {
      if (model.startsWith('claude')) return 'anthropic';
      if (model.startsWith('gemini')) return 'google';
      if (model.startsWith('gpt')) return 'openai';
      if (model.startsWith('deepseek')) return 'deepseek';
      return 'google';
    });

    mockSendRequest.mockResolvedValue({
      content: 'Here is the implementation...',
      model: GOOGLE_CHAT_MODEL,
      promptTokens: 120,
      completionTokens: 80,
      totalTokens: 200,
      finishReason: 'stop',
    });
  });

  it('includes x_agi_workforce.routing in every response', async () => {
    const request = makeRequest('Hello, how are you?');
    const response = await POST(request);

    expect(rlsMocks.getUserScopedDb).toHaveBeenCalledOnce();
    expect(managedUsageMocks.reserve).toHaveBeenCalledOnce();
    expect(response.status, await response.clone().text()).toBe(200);

    const data = (await response.json()) as {
      x_agi_workforce?: {
        routing?: { task_type: string; task_confidence: number; resolved_model: string };
      };
    };

    expect(data.x_agi_workforce).toBeDefined();
    expect(data.x_agi_workforce?.routing).toBeDefined();
    expect(data.x_agi_workforce?.routing?.task_type).toBeTypeOf('string');
    expect(data.x_agi_workforce?.routing?.task_confidence).toBeGreaterThan(0);
    expect(data.x_agi_workforce?.routing?.resolved_model).toBeTypeOf('string');
  });

  it('classifies code-fence message as task_type="coding"', async () => {
    const request = makeRequest(
      '```typescript\nfunction add(a: number, b: number) { return a + b; }\n```\n' +
        'Please refactor this to handle null inputs',
    );
    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = (await response.json()) as {
      x_agi_workforce?: { routing?: { task_type: string; task_confidence: number } };
    };

    expect(data.x_agi_workforce?.routing?.task_type).toBe('coding');
    expect(data.x_agi_workforce?.routing?.task_confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('classifies a message with the "function" keyword as task_type="coding"', async () => {
    const request = makeRequest(
      'Please write a function to implement binary search in Python and add unit tests for edge cases',
    );
    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = (await response.json()) as {
      x_agi_workforce?: { routing?: { task_type: string } };
    };

    expect(data.x_agi_workforce?.routing?.task_type).toBe('coding');
  });

  it('classifies a short greeting as task_type="simple_chat"', async () => {
    const request = makeRequest('hi there');
    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = (await response.json()) as {
      x_agi_workforce?: { routing?: { task_type: string } };
    };

    expect(data.x_agi_workforce?.routing?.task_type).toBe('simple_chat');
  });

  it('returns 200 for Pro user with credits available (low usage scenario)', async () => {
    mockCheckAvailable.mockResolvedValue(true);

    const request = makeRequest('write a function to parse JSON safely');
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockCheckAvailable).toHaveBeenCalled();
    expect(mockGetSubscription).toHaveBeenCalledOnce();
  });

  it('allows Basic Auto to use the shared Free/Basic economy route', async () => {
    mockGetSubscription.mockResolvedValue({
      ...makeProSubscription(),
      id: 'sub_basic_123',
      plan_tier: 'basic',
      stripe_price_id: 'price_basic',
    });

    const response = await POST(
      makeRequest('Write a function to parse JSON safely and include unit tests.'),
    );

    expect(response.status, await response.clone().text()).toBe(200);
  });

  it('returns 402 when Pro user has no credits remaining', async () => {
    mockCheckAvailable.mockResolvedValue(false);
    mockGetBalance.mockResolvedValue({
      account_id: 'acct-001',
      credits_remaining_cents: 0,
      credits_allocated_cents: 20000,
    });

    const request = makeRequest('write a Python script');
    const response = await POST(request);

    expect(response.status).toBe(402);
  });

  it('includes provider and resolved_model in routing metadata', async () => {
    const request = makeRequest('implement a quicksort algorithm in JavaScript');
    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = (await response.json()) as {
      x_agi_workforce?: {
        provider?: string;
        routing?: { resolved_model: string };
      };
    };

    expect(data.x_agi_workforce?.provider).toBeTypeOf('string');
    expect(data.x_agi_workforce?.routing?.resolved_model).toBeTypeOf('string');
  });

  it('fails closed for a model selection absent from the canonical registry', async () => {
    const request = makeRequestForModel('totally-not-a-real-model-xyz', 'hello');
    const response = await POST(request);

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'model_route_unavailable' },
    });
    expect(mockCheckAvailable).not.toHaveBeenCalled();
  });

  it('admits AGI Work after the Web runtime implements platform tool discovery', async () => {
    const request = makeRequest('Use autonomous agents and discover the best available tools');
    const response = await POST(request);

    expect(response.status, await response.clone().text()).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      x_agi_workforce: {
        routing: {
          task_type: 'agentic',
        },
      },
    });
    expect(mockCheckAvailable).toHaveBeenCalledOnce();
  });

  it('classifies image message parts as multimodal before resolving Auto', async () => {
    const request = new NextRequest('http://localhost/api/llm/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-pro-token',
        'Content-Type': 'application/json',
        'Idempotency-Key': 'test-managed-chat-request',
        'x-agi-surface': 'web',
      },
      body: JSON.stringify({
        model: 'auto-balanced',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is shown here?' },
              { type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } },
            ],
          },
        ],
        stream: false,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      x_agi_workforce?: { routing?: { task_type?: string } };
    };
    expect(data.x_agi_workforce?.routing?.task_type).toBe('multimodal');
  });

  it('does not send a media-harness route through a text-chat provider adapter', async () => {
    const request = makeRequest('Generate an image of a blue robot reading a book');
    const response = await POST(request);

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'model_route_requires_media_dispatch' },
    });
    expect(mockCheckAvailable).not.toHaveBeenCalled();
  });

  it('reserves credits after canonical routing and quota admission', async () => {
    const request = makeRequest('write a recursive function');
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockCheckAvailable).toHaveBeenCalled();
  });

  it('routes an explicit gemini model through the Google adapter path', async () => {
    const request = makeRequestForModel(GOOGLE_CHAT_MODEL, 'hello');
    const response = await POST(request);

    expect(response.status).toBe(200);

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      x_agi_workforce?: { provider?: string };
    };

    expect(data.x_agi_workforce?.provider).toBe('google');
    expect(data.choices?.[0]?.message?.content).toBe('Gemini says hello.');
  });

  it('routes an explicit gpt model through the OpenAI adapter path', async () => {
    mockGetSubscription.mockResolvedValue({
      ...makeProSubscription(),
      id: 'sub_max_123',
      plan_tier: 'max',
      stripe_price_id: 'price_max',
    });
    const request = makeRequestForModel(OPENAI_CHAT_MODEL, 'hello');
    const response = await POST(request);

    expect(response.status).toBe(200);

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      x_agi_workforce?: { provider?: string };
    };

    expect(data.x_agi_workforce?.provider).toBe('openai');
    expect(data.choices?.[0]?.message?.content).toBe('GPT says hi.');
  });
});
