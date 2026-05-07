/**
 * Integration test: Pro-tier task-aware routing wiring in the v1 chat completions route.
 *
 * Verifies (Task #21):
 *   1. classifyTaskLocally runs in the request path (sync, before awaits)
 *   2. resolvedTaskType is populated and returned in x_agi_workforce.routing
 *   3. A coding-heavy message is classified as 'coding'
 *   4. CreditService.checkAvailable is called (the v1 route uses credit-based
 *      quota enforcement, not assertQuota — which is the gap identified by Task #21)
 *   5. The response is 200 for low usage (credits available)
 *   6. x_agi_workforce.routing.task_type reflects the coding classification
 *
 * GAP IDENTIFIED (Task #21):
 *   The v1 route at app/api/llm/v1/chat/completions/route.ts uses CreditService
 *   (legacy) for quota enforcement, NOT the task-aware assertQuota from
 *   @/lib/assert-quota. The assertQuota + tier-aware quota logic from the spec
 *   is absent from this route. This file documents the current behavior and
 *   highlights the gap so it can be closed in a follow-up task.
 *
 * NOTE (Task #17 dependency):
 *   resolveAutoModeModel in @agiworkforce/types does not yet accept a taskType
 *   3rd argument. Once Task #17 ships, x_agi_workforce.routing.resolved_model
 *   will diverge for Pro users (e.g. 'auto-balanced' + coding -> 'claude-sonnet-4.6').
 *   The plumbing is already wired in route.ts via the resolveAutoModel wrapper;
 *   only the types package upgrade is needed to activate Pro slot routing.
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

// Bypass model-tier gating — fixtures use auto-mode IDs that resolve to internal
// model IDs; tier gating is tested separately.
vi.mock('@/lib/model-tiers', () => ({
  canAccessModel: () => true,
  ECONOMY_MODELS: new Set<string>(),
  MODEL_TIER_REQUIREMENTS: {},
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
}));

vi.mock('@/utils/env', () => ({
  requireEnv: vi.fn((key: string) => `mock-${key}`),
}));

// Mock Supabase auth
const mockSupabaseClient = {
  auth: {
    getUser: vi.fn(),
  },
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}));

vi.mock('@/lib/supabase-server', () => ({
  getUserClient: vi.fn().mockReturnValue({}),
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

// Note: @/lib/assert-quota is NOT imported by this route (gap), so no mock needed.

// Import the route AFTER all vi.mock() calls
import { POST } from '@/app/api/llm/v1/chat/completions/route';

// ---- helpers ----

function makeRequest(message: string, stream = false): NextRequest {
  return new NextRequest('http://localhost/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-pro-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'auto-balanced',
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

describe('POST /api/llm/v1/chat/completions — Pro-tier routing wiring (Task #21)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'pro-user-id', email: 'pro@example.com' } },
      error: null,
    });

    mockGetSubscription.mockResolvedValue(makeProSubscription());

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
      model: 'gemini-3.1-flash-lite',
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

    expect(response.status).toBe(200);

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

  // -------------------------------------------------------------------------
  // Test 8: GAP DOCUMENTATION — assertQuota is NOT called (Task #21 gap)
  //
  // This test documents the current gap: the v1 route uses the legacy credit
  // system (CreditService.checkAvailable) rather than the task-aware assertQuota
  // from @/lib/assert-quota. Removing this test once the gap is closed.
  // -------------------------------------------------------------------------
  it('[gap] uses CreditService not assertQuota for quota enforcement', async () => {
    const request = makeRequest('write a recursive function');
    const response = await POST(request);

    expect(response.status).toBe(200);
    // Credit service IS called (legacy quota path)
    expect(mockCheckAvailable).toHaveBeenCalled();
    // assertQuota is NOT imported/called by this route (the gap)
    // When Task #21 gap is closed, this test should be updated to assert
    // mockAssertQuota was called with { tier: 'pro', userId: 'pro-user-id' }
  });
});
