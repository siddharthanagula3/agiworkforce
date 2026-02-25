import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock dependencies before importing the route
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(() => null),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/lib/security-audit', () => ({
  logRateLimitExceeded: vi.fn(),
  logSecurityEvent: vi.fn(),
}));

vi.mock('@/lib/prompt-cache-helper', () => ({
  calculateCacheSavings: vi.fn(() => ({
    tokensSavedByCache: 0,
    savedCostCents: 0,
    cacheWriteCostCents: 0,
  })),
  logCacheAnalytics: vi.fn(),
  shouldEnablePromptCache: vi.fn(() => false),
}));

// Mock Supabase
const mockSupabaseClient = {
  auth: {
    getUser: vi.fn(),
  },
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}));

// Mock services
const mockGetSubscription = vi.fn();
const mockCheckAvailable = vi.fn();
const mockDeductCredits = vi.fn();
const mockGetBalance = vi.fn();

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    getSubscription: (...args: unknown[]) => mockGetSubscription(...args),
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

// Mock LLM providers
const mockSendRequest = vi.fn();
const mockStreamRequest = vi.fn();
const mockGetProviderFromModel = vi.fn();

vi.mock('@/lib/llm-providers/factory', () => ({
  LLMProviderFactory: {
    getProviderFromModel: (...args: unknown[]) => mockGetProviderFromModel(...args),
    sendRequest: (...args: unknown[]) => mockSendRequest(...args),
    streamRequest: (...args: unknown[]) => mockStreamRequest(...args),
  },
}));

// Mock cost calculator
vi.mock('@/lib/services/llm-cost-calculator', () => ({
  LLMCostCalculator: {
    estimateCost: vi.fn(() => 10), // 10 cents
    calculateCost: vi.fn(() => 8), // 8 cents actual
    getInputCostPerMtok: vi.fn(() => 3.0),
  },
}));

// Import after mocks
import { POST } from '@/app/api/llm/completion/route';

describe('POST /api/llm/completion', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    mockGetProviderFromModel.mockReturnValue('deepseek');
    mockGetSubscription.mockResolvedValue({
      id: 'sub_123',
      status: 'active',
      plan_tier: 'pro',
    });
    mockCheckAvailable.mockResolvedValue(true);
    mockDeductCredits.mockResolvedValue({
      success: true,
      remaining_cents: 1000,
    });
    mockGetBalance.mockResolvedValue({
      remaining_cents: 1000,
      credits_remaining_cents: 1000,
      allocated_cents: 5000,
      credits_allocated_cents: 5000,
      daily_limit_cents: 1500,
      daily_used_cents: 100,
      daily_remaining_cents: 1400,
    });
    mockSendRequest.mockResolvedValue({
      content: 'Hello, how can I help you?',
      model: 'deepseek-chat',
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      finishReason: 'stop',
    });

    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: {
        user: {
          id: 'test-user-id',
          email: 'test@example.com',
        },
      },
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Authentication Tests
  // =========================================================================
  describe('Authentication', () => {
    it('should return 401 if authorization header is missing', async () => {
      const request = new NextRequest('http://localhost/api/llm/completion', {
        method: 'POST',
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.code).toBe('UNAUTHORIZED');
      expect(data.error.message).toContain('authorization');
    });

    it('should return 401 if authorization header does not start with Bearer', async () => {
      const request = new NextRequest('http://localhost/api/llm/completion', {
        method: 'POST',
        headers: {
          Authorization: 'Basic invalid-token',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 if token is invalid', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' },
      });

      const request = new NextRequest('http://localhost/api/llm/completion', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer invalid-token',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.code).toBe('UNAUTHORIZED');
      expect(data.error.message).toContain('authentication');
    });

    it('should return 403 if user has no subscription', async () => {
      mockGetSubscription.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/llm/completion', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error.code).toBe('FORBIDDEN');
      expect(data.error.message).toContain('subscription');
    });

    it('should return 403 if subscription is not active', async () => {
      mockGetSubscription.mockResolvedValue({
        id: 'sub_123',
        status: 'past_due',
        plan_tier: 'pro',
      });

      const request = new NextRequest('http://localhost/api/llm/completion', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error.code).toBe('FORBIDDEN');
      expect(data.error.message).toContain('past_due');
    });

    it('should allow trialing subscription status', async () => {
      mockGetSubscription.mockResolvedValue({
        id: 'sub_123',
        status: 'trialing',
        plan_tier: 'pro',
      });

      const request = new NextRequest('http://localhost/api/llm/completion', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });
  });

  // =========================================================================
  // Provider Detection Tests
  // =========================================================================
  describe('Provider Detection', () => {
    it('should detect Anthropic provider from claude model', async () => {
      // claude-haiku-4.5 is in ECONOMY_MODELS
      mockGetProviderFromModel.mockReturnValue('anthropic');
      mockSendRequest.mockResolvedValue({
        content: 'Hello, how can I help you?',
        model: 'claude-haiku-4.5',
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        finishReason: 'stop',
      });

      const request = new NextRequest('http://localhost/api/llm/completion', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4.5',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      await POST(request);

      expect(mockGetProviderFromModel).toHaveBeenCalledWith('claude-haiku-4.5');
      expect(mockSendRequest).toHaveBeenCalledWith(
        'anthropic',
        expect.objectContaining({ model: 'claude-haiku-4.5' }),
      );
    });

    it('should detect OpenAI provider from gpt model', async () => {
      // gpt-5-nano is in ECONOMY_MODELS
      mockGetProviderFromModel.mockReturnValue('openai');
      mockSendRequest.mockResolvedValue({
        content: 'Response from GPT',
        model: 'gpt-5-nano',
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        finishReason: 'stop',
      });

      const request = new NextRequest('http://localhost/api/llm/completion', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          model: 'gpt-5-nano',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      await POST(request);

      expect(mockGetProviderFromModel).toHaveBeenCalledWith('gpt-5-nano');
      expect(mockSendRequest).toHaveBeenCalledWith(
        'openai',
        expect.objectContaining({ model: 'gpt-5-nano' }),
      );
    });

    it('should detect Google provider from gemini model', async () => {
      // gemini-3-flash-preview is in ECONOMY_MODELS
      mockGetProviderFromModel.mockReturnValue('google');
      mockSendRequest.mockResolvedValue({
        content: 'Response from Gemini',
        model: 'gemini-3-flash-preview',
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        finishReason: 'stop',
      });

      const request = new NextRequest('http://localhost/api/llm/completion', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          model: 'gemini-3-flash-preview',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      await POST(request);

      expect(mockGetProviderFromModel).toHaveBeenCalledWith('gemini-3-flash-preview');
      expect(mockSendRequest).toHaveBeenCalledWith(
        'google',
        expect.objectContaining({ model: 'gemini-3-flash-preview' }),
      );
    });

    it('should detect xAI provider from grok model', async () => {
      // grok-4-mini is in ECONOMY_MODELS
      mockGetProviderFromModel.mockReturnValue('xai');
      mockSendRequest.mockResolvedValue({
        content: 'Response from Grok',
        model: 'grok-4-mini',
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        finishReason: 'stop',
      });

      const request = new NextRequest('http://localhost/api/llm/completion', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          model: 'grok-4-mini',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      await POST(request);

      expect(mockGetProviderFromModel).toHaveBeenCalledWith('grok-4-mini');
      expect(mockSendRequest).toHaveBeenCalledWith(
        'xai',
        expect.objectContaining({ model: 'grok-4-mini' }),
      );
    });

    it('should detect DeepSeek provider from deepseek model', async () => {
      // deepseek-chat is in ECONOMY_MODELS
      mockGetProviderFromModel.mockReturnValue('deepseek');
      mockSendRequest.mockResolvedValue({
        content: 'Response from DeepSeek',
        model: 'deepseek-chat',
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        finishReason: 'stop',
      });

      const request = new NextRequest('http://localhost/api/llm/completion', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      await POST(request);

      expect(mockGetProviderFromModel).toHaveBeenCalledWith('deepseek-chat');
      expect(mockSendRequest).toHaveBeenCalledWith(
        'deepseek',
        expect.objectContaining({ model: 'deepseek-chat' }),
      );
    });
  });

  // =========================================================================
  // Credit Insufficient and Fallback Tests
  // =========================================================================
  describe('Fallback Model Selection', () => {
    it('should return 402 when credits are insufficient and no fallback available', async () => {
      // Use max tier since claude-opus-4.5 requires max or enterprise tier
      mockGetSubscription.mockResolvedValue({
        id: 'sub_123',
        status: 'active',
        plan_tier: 'max',
      });
      mockCheckAvailable.mockResolvedValue(false);
      mockDeductCredits.mockResolvedValue({
        success: false,
        code: 'MONTHLY_CREDIT_LIMIT_REACHED',
        available: 0,
        required: 10,
      });
      mockGetBalance.mockResolvedValue({
        remaining_cents: 0,
        credits_remaining_cents: 0,
        allocated_cents: 5000,
        credits_allocated_cents: 5000,
      });

      const request = new NextRequest('http://localhost/api/llm/completion', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          model: 'claude-opus-4.5',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(402);
      expect(data.code).toBe('MONTHLY_CREDIT_LIMIT_REACHED');
    });

    it('should return 402 when daily limit reached', async () => {
      mockCheckAvailable.mockResolvedValue(false);
      mockDeductCredits.mockResolvedValue({
        success: false,
        code: 'DAILY_CREDIT_LIMIT_REACHED',
        daily_limit: 1500,
        daily_used: 1500,
        daily_remaining: 0,
      });
      mockGetBalance.mockResolvedValue({
        remaining_cents: 3500,
        credits_remaining_cents: 3500,
        allocated_cents: 5000,
        credits_allocated_cents: 5000,
        daily_limit_cents: 1500,
        daily_used_cents: 1500,
        daily_remaining_cents: 0,
        last_daily_reset_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      });

      const request = new NextRequest('http://localhost/api/llm/completion', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(402);
      expect(data.code).toBe('DAILY_CREDIT_LIMIT_REACHED');
      expect(data.daily_limit).toBeDefined();
      expect(data.reset_in_hours).toBeDefined();
    });
  });

  // =========================================================================
  // Streaming vs Non-Streaming Tests
  // =========================================================================
  describe('Streaming vs Non-Streaming', () => {
    it('should return JSON response for non-streaming request', async () => {
      const request = new NextRequest('http://localhost/api/llm/completion', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: 'Hello' }],
          stream: false,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('application/json');
      expect(data.choices).toBeDefined();
      expect(data.choices[0].message.content).toBe('Hello, how can I help you?');
      expect(data.usage).toBeDefined();
      expect(data.credits).toBeDefined();
    });

    it('should return streaming response for stream=true', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"content": "Hello"}\n\n'));
          controller.close();
        },
      });
      mockStreamRequest.mockResolvedValue(mockStream);

      const request = new NextRequest('http://localhost/api/llm/completion', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: 'Hello' }],
          stream: true,
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
      expect(response.headers.get('Cache-Control')).toBe('no-cache');
      expect(response.headers.get('Connection')).toBe('keep-alive');
    });

    it('should refund credits if streaming request fails', async () => {
      mockStreamRequest.mockRejectedValue(new Error('Stream connection failed'));

      const request = new NextRequest('http://localhost/api/llm/completion', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: 'Hello' }],
          stream: true,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error.message).toContain('Streaming request failed');

      // Check that refund was issued (negative amount)
      expect(mockDeductCredits).toHaveBeenCalledWith(
        'test-user-id',
        expect.any(Number), // First call is reservation (positive)
        expect.any(String),
        expect.any(Object),
        expect.any(String), // idempotency key
      );
      // Second call should be refund (negative)
      const refundCall = mockDeductCredits.mock.calls.find((call) => call[1] < 0);
      expect(refundCall).toBeDefined();
    });
  });

  // =========================================================================
  // Rate Limiting Tests
  // =========================================================================
  describe('Rate Limiting', () => {
    it('should call rate limiter with default key', async () => {
      const { withRateLimit } = await import('@/lib/rate-limit');

      const request = new NextRequest('http://localhost/api/llm/completion', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      await POST(request);

      expect(withRateLimit).toHaveBeenCalledWith(expect.any(NextRequest), 'llm-completion');
    });

    it('should return 429 when rate limited', async () => {
      const { withRateLimit } = await import('@/lib/rate-limit');
      const { NextResponse } = await import('next/server');

      vi.mocked(withRateLimit).mockResolvedValueOnce(
        NextResponse.json(
          {
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'Rate limit exceeded',
            },
          },
          { status: 429 },
        ),
      );

      const request = new NextRequest('http://localhost/api/llm/completion', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });
  });

  // =========================================================================
  // Validation Tests
  // =========================================================================
  describe('Request Validation', () => {
    it('should return 400 for invalid JSON', async () => {
      const request = new NextRequest('http://localhost/api/llm/completion', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-token',
          'Content-Type': 'application/json',
        },
        body: 'invalid json{',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
      expect(data.error.message).toContain('JSON');
    });

    it('should return 400 for missing model', async () => {
      const request = new NextRequest('http://localhost/api/llm/completion', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for empty messages array', async () => {
      const request = new NextRequest('http://localhost/api/llm/completion', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for message content exceeding max length', async () => {
      const request = new NextRequest('http://localhost/api/llm/completion', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: 'x'.repeat(100001) }],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
      expect(data.error.message).toContain('maximum length');
    });

    it('should return 400 for total content exceeding 1MB', async () => {
      // Create multiple messages that together exceed 1MB
      const messages = Array.from({ length: 15 }, () => ({
        role: 'user' as const,
        content: 'x'.repeat(80000), // 80k chars each, 15 messages = 1.2MB
      }));

      const request = new NextRequest('http://localhost/api/llm/completion', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
      expect(data.error.message).toContain('Total message content exceeds');
    });
  });

  // =========================================================================
  // Credit Reservation and Reconciliation Tests
  // =========================================================================
  describe('Credit Reservation and Reconciliation', () => {
    it('should reserve credits before making request', async () => {
      const request = new NextRequest('http://localhost/api/llm/completion', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      await POST(request);

      // First deductCredits call should be reservation (with 5 args including idempotency key)
      expect(mockDeductCredits).toHaveBeenCalledWith(
        'test-user-id',
        expect.any(Number),
        expect.stringContaining('reservation'),
        expect.objectContaining({ type: 'reservation' }),
        expect.stringContaining(':reservation:'), // idempotency key
      );
    });

    it('should refund credits if non-streaming request fails', async () => {
      mockSendRequest.mockRejectedValue(new Error('Provider error'));

      const request = new NextRequest('http://localhost/api/llm/completion', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(500);

      // Check for refund call (negative amount)
      const refundCall = mockDeductCredits.mock.calls.find((call) => call[1] < 0);
      expect(refundCall).toBeDefined();
      expect(refundCall![2]).toContain('Refund');
    });

    it('should include credit info in successful response', async () => {
      const request = new NextRequest('http://localhost/api/llm/completion', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.credits).toBeDefined();
      expect(data.credits.cost_cents).toBeDefined();
      expect(data.credits.remaining_cents).toBeDefined();
      expect(data.credits.daily_limit).toBeDefined();
      expect(data.credits.daily_used).toBeDefined();
      expect(data.credits.daily_remaining).toBeDefined();
    });
  });

  // =========================================================================
  // Response Format Tests
  // =========================================================================
  describe('Response Format', () => {
    it('should return OpenAI-compatible response format', async () => {
      const request = new NextRequest('http://localhost/api/llm/completion', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.choices).toBeInstanceOf(Array);
      expect(data.choices[0].message).toBeDefined();
      expect(data.choices[0].message.role).toBe('assistant');
      expect(data.choices[0].message.content).toBeDefined();
      expect(data.choices[0].finish_reason).toBeDefined();
      expect(data.model).toBeDefined();
      expect(data.usage).toBeDefined();
      expect(data.usage.prompt_tokens).toBeDefined();
      expect(data.usage.completion_tokens).toBeDefined();
      expect(data.usage.total_tokens).toBeDefined();
    });

    it('should include cache info in response', async () => {
      const request = new NextRequest('http://localhost/api/llm/completion', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.cache).toBeDefined();
      expect(data.cache.cached_input_tokens).toBeDefined();
      expect(data.cache.cache_creation_input_tokens).toBeDefined();
      expect(data.cache.tokens_saved).toBeDefined();
      expect(data.cache.cost_saved_cents).toBeDefined();
    });
  });
});
