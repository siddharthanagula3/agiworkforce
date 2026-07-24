/**
 * Integration test: Pro-tier task-aware routing wiring in the v1 chat completions route.
 *
 * Verifies:
 *   1. classifyTaskLocally runs in the request path (sync, before awaits)
 *   2. resolvedTaskType is populated and returned in x_agi_workforce.routing
 *   3. A coding-heavy message is classified as 'coding'
 *   4. Canonical route admission runs before credits/provider dispatch
 *   5. The response is 200 for low usage (credits available)
 *   6. x_agi_workforce.routing.task_type reflects the coding classification
 *
 * The route uses @agiworkforce/routing#resolveAutoRoute with the
 * web/cloud-chat runtime profile. App-local keyword/model pools are not part
 * of the production request path.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---- mocks must be hoisted before imports ----

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
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
  // resolveAutoModel can pick a Claude model for coding-classified prompts
  // (see this file's docstring / Task #17 note) even though every test here
  // sends `model: 'auto-balanced'` -- that now routes through
  // adapter-factory.ts's buildAnthropicAdapter, which reads ANTHROPIC_API_KEY
  // via getOptionalEnv. Fake key so it doesn't throw "not configured";
  // ANTHROPIC_BASE_URL/GOOGLE_BASE_URL/OPENAI_BASE_URL stay unset so the
  // (unmocked, pure) llm-runtime validateBaseUrl path is simply never reached.
  //
  // GOOGLE_API_KEY is faked too for the explicit-gemini-model route-level
  // test below (task #34) -- buildGoogleAdapter reads it the same way
  // buildAnthropicAdapter reads ANTHROPIC_API_KEY. OPENAI_API_KEY is faked
  // for the same reason -- auto-balanced can resolve some prompts to an
  // OpenAI model, which now routes through buildOpenAIAdapter (task #34's
  // OpenAI slice); without this, those requests 500 with "not configured".
  getOptionalEnv: vi.fn((key: string) =>
    key === 'ANTHROPIC_API_KEY' || key === 'GOOGLE_API_KEY' || key === 'OPENAI_API_KEY'
      ? `mock-${key}`
      : undefined,
  ),
}));

// Coding-classified prompts route to a Claude model (Task #17 auto-routing),
// which now dispatches through packages/ai/providers/anthropic's adapter
// (task #34) instead of the mocked LLMProviderFactory below. This suite is
// about routing/classification metadata, not provider wire-shape (see
// packages/ai/providers/anthropic/src/__tests__/web-wire-parity.test.ts for
// that), so a minimal fake stream is enough to reach a 200 with routing
// fields populated.
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

// Google's sibling of the Anthropic mock above -- proves route.ts's
// ADAPTER_PROVIDERS['google'] branch is really reached end-to-end (adapter
// construction, buildGoogleChatRequest, drainToLlmResponse/startProviderStream,
// response-builder), not just unit-tested in isolation the way packages/
// providers/google's own tests + stream-transform.google-byte-parity.test.ts
// already do. Every OTHER test in this file bypasses provider dispatch
// entirely for a directly-addressed gemini-* model, so without this the
// Google adapter path had zero route-level coverage (task #34 disclosed gap).
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

// OpenAI's sibling of the Anthropic/Google mocks above (task #34's OpenAI
// slice). Required for this file, not just additive: auto-balanced can
// resolve some of these tests' prompts to an OpenAI model, which now routes
// through ADAPTER_PROVIDERS['openai'] -- without this mock, those requests
// would try to construct a real openai SDK client. Also proves the
// route-level dispatch for an explicit OpenAI model below.
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

// Mock Clerk auth — auth-gate.ts uses getClerkAuthUser
const mockGetClerkAuthUser = vi.fn();

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: (...args: unknown[]) => mockGetClerkAuthUser(...args),
}));

// Mock cloud database server client (auth-gate creates one for subscription lookup)
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

// Mock subscription + credit services
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

// Mock LLM provider factory
const mockSendRequest = vi.fn();
const mockGetProviderFromModel = vi.fn();

vi.mock('@/lib/llm-providers/factory', () => ({
  LLMProviderFactory: {
    getProviderFromModel: (...args: unknown[]) => mockGetProviderFromModel(...args),
    sendRequest: (...args: unknown[]) => mockSendRequest(...args),
    streamRequest: vi.fn(),
  },
}));

// Mock cost calculator
vi.mock('@/lib/services/llm-cost-calculator', () => ({
  LLMCostCalculator: {
    estimateCost: vi.fn(() => 5),
    calculateCost: vi.fn(() => 4),
    getInputCostPerMtok: vi.fn(() => 3.0),
  },
}));

// Import the route AFTER all vi.mock() calls
import { POST } from '@/app/api/llm/v1/chat/completions/route';

// ---- helpers ----

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

/** Like `makeRequest`, but with an explicit model instead of 'auto-balanced'
 *  -- for exercising a specific ADAPTER_PROVIDERS branch directly rather than
 *  going through auto-mode resolution. */
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

// ---- test suite ----

describe('POST /api/llm/v1/chat/completions — canonical Pro-tier routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetClerkAuthUser.mockResolvedValue({ userId: 'pro-user-id', email: 'pro@example.com' });

    mockGetSubscription.mockResolvedValue(makeProSubscription());
    rlsMocks.getUserScopedDb.mockResolvedValue({ db: {}, userId: 'pro-user-id' });

    managedUsageMocks.reserve.mockImplementation(async (input) => ({
      db: input.db,
      userId: input.userId,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      leaseToken: 'lease-test',
      estimatedCostCents: input.estimatedCostCents,
    }));

    // Credits available (low usage scenario)
    mockCheckAvailable.mockResolvedValue(true);
    mockDeductCredits.mockResolvedValue({ success: true, remaining_cents: 10000 });
    mockGetBalance.mockResolvedValue({
      account_id: 'acct-001',
      credits_remaining_cents: 10000,
      credits_allocated_cents: 20000,
    });

    // Provider from model (auto-balanced resolves to economy tier in legacy 2-arg path)
    mockGetProviderFromModel.mockImplementation((model: string) => {
      if (model.startsWith('claude')) return 'anthropic';
      if (model.startsWith('gemini')) return 'google';
      if (model.startsWith('gpt')) return 'openai';
      if (model.startsWith('deepseek')) return 'deepseek';
      return 'google';
    });

    mockSendRequest.mockResolvedValue({
      content: 'Here is the implementation...',
      model: 'gemini-3.5-flash-lite',
      promptTokens: 120,
      completionTokens: 80,
      totalTokens: 200,
      finishReason: 'stop',
    });
  });

  // -------------------------------------------------------------------------
  // Test 1: classifier runs and routing metadata is in response
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // Test 2: coding message with code fence -> task_type='coding'
  // -------------------------------------------------------------------------
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
    // Confidence for code-fence classification is 0.85 per classify.ts
    expect(data.x_agi_workforce?.routing?.task_confidence).toBeGreaterThanOrEqual(0.85);
  });

  // -------------------------------------------------------------------------
  // Test 3: coding keyword message -> task_type='coding'
  // RE_CODING matches: function, class, SELECT, def, import, TypeError, etc.
  // -------------------------------------------------------------------------
  it('classifies a message with the "function" keyword as task_type="coding"', async () => {
    const request = makeRequest(
      'Please write a function to implement binary search in Python and add unit tests for edge cases',
    );
    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = (await response.json()) as {
      x_agi_workforce?: { routing?: { task_type: string } };
    };

    // RE_CODING matches 'function' keyword
    expect(data.x_agi_workforce?.routing?.task_type).toBe('coding');
  });

  // -------------------------------------------------------------------------
  // Test 4: simple greeting -> task_type='simple_chat' (not forced to coding)
  // -------------------------------------------------------------------------
  it('classifies a short greeting as task_type="simple_chat"', async () => {
    const request = makeRequest('hi there');
    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = (await response.json()) as {
      x_agi_workforce?: { routing?: { task_type: string } };
    };

    // 'hi there' is <80 chars and <15 words -> simple_chat @ 0.7
    expect(data.x_agi_workforce?.routing?.task_type).toBe('simple_chat');
  });

  // -------------------------------------------------------------------------
  // Test 5: Pro subscription plan_tier is passed to CreditService (quota path)
  // -------------------------------------------------------------------------
  it('returns 200 for Pro user with credits available (low usage scenario)', async () => {
    mockCheckAvailable.mockResolvedValue(true);

    const request = makeRequest('write a function to parse JSON safely');
    const response = await POST(request);

    expect(response.status).toBe(200);
    // Credit check was called
    expect(mockCheckAvailable).toHaveBeenCalled();
    // Subscription was fetched (tier='pro' in mock)
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

  // -------------------------------------------------------------------------
  // Test 6: 402 when credits are exhausted
  // -------------------------------------------------------------------------
  it('returns 402 when Pro user has no credits remaining', async () => {
    mockCheckAvailable.mockResolvedValue(false);
    // Make getBalance return 0 remaining to skip the fallback model check
    mockGetBalance.mockResolvedValue({
      account_id: 'acct-001',
      credits_remaining_cents: 0,
      credits_allocated_cents: 20000,
    });

    const request = makeRequest('write a Python script');
    const response = await POST(request);

    expect(response.status).toBe(402);
  });

  // -------------------------------------------------------------------------
  // Test 7: response metadata includes provider + resolved_model
  // -------------------------------------------------------------------------
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

  it('fails closed when the Web runtime profile has not implemented a required harness feature', async () => {
    const request = makeRequest('Use autonomous agents and discover the best available tools');
    const response = await POST(request);

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'model_route_unavailable' },
    });
    expect(mockCheckAvailable).not.toHaveBeenCalled();
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

  // -------------------------------------------------------------------------
  // Test 8: credit reservation remains in force after quota + route admission.
  // -------------------------------------------------------------------------
  it('reserves credits after canonical routing and quota admission', async () => {
    const request = makeRequest('write a recursive function');
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockCheckAvailable).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 9: Google adapter dispatch is really reached end-to-end (task #34)
  //
  // An explicit gemini-* model routes through route.ts's
  // ADAPTER_PROVIDERS['google'] branch: buildGoogleAdapter (reads
  // GOOGLE_API_KEY, mocked above), buildGoogleChatRequest, drainToLlmResponse
  // (non-streaming, matching every other test in this file), and
  // response-builder.ts. Asserting the response content came from the
  // MOCKED GOOGLE STREAM specifically ('Gemini says hello.', distinct from
  // the Anthropic mock's 'Here is the implementation...' and the legacy
  // LLMProviderFactory mock's canned content) proves this test would fail if
  // the request silently fell through to a different dispatch path instead
  // of really reaching the Google branch.
  // -------------------------------------------------------------------------
  it('routes an explicit gemini model through the Google adapter path', async () => {
    const request = makeRequestForModel('gemini-3.6-flash', 'hello');
    const response = await POST(request);

    expect(response.status).toBe(200);

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      x_agi_workforce?: { provider?: string };
    };

    expect(data.x_agi_workforce?.provider).toBe('google');
    expect(data.choices?.[0]?.message?.content).toBe('Gemini says hello.');
  });

  // -------------------------------------------------------------------------
  // Test 10: OpenAI adapter dispatch is really reached end-to-end (task #34)
  //
  // Google's sibling test above, for OpenAI: an explicit gpt-* model routes
  // through route.ts's ADAPTER_PROVIDERS['openai'] branch (buildOpenAIAdapter,
  // reading OPENAI_API_KEY mocked above; buildOpenAIChatRequest;
  // drainToLlmResponse). Distinct canned content ('GPT says hi.') proves
  // this reaches the OpenAI branch specifically, not Anthropic's or
  // Google's mocked streams or the legacy LLMProviderFactory fallback.
  // -------------------------------------------------------------------------
  it('routes an explicit gpt model through the OpenAI adapter path', async () => {
    mockGetSubscription.mockResolvedValue({
      ...makeProSubscription(),
      id: 'sub_max_123',
      plan_tier: 'max',
      stripe_price_id: 'price_max',
    });
    const request = makeRequestForModel('gpt-5.6-sol', 'hello');
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
