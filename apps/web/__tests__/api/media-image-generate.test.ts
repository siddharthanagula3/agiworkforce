import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mock: server-only (Next.js server-only guard — no-op in tests)
// ---------------------------------------------------------------------------
vi.mock('server-only', () => ({}));

// ---------------------------------------------------------------------------
// Mock: rate-limit — allow by default
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

// ---------------------------------------------------------------------------
// Mock: logger
// ---------------------------------------------------------------------------
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Mock: CSRF — pass by default
// ---------------------------------------------------------------------------
vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn().mockResolvedValue(null),
}));

// ---------------------------------------------------------------------------
// Mock: CORS helpers
// ---------------------------------------------------------------------------
vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn().mockReturnValue(null),
  getCorsHeaders: vi.fn().mockReturnValue({}),
  getSecurityHeaders: vi.fn().mockReturnValue({}),
}));

// ---------------------------------------------------------------------------
// Mock: Supabase client
// ---------------------------------------------------------------------------
const mockGetUser = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

// ---------------------------------------------------------------------------
// Mock: SubscriptionService
// ---------------------------------------------------------------------------
const mockGetSubscription = vi.fn();

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    getSubscription: (...args: unknown[]) => mockGetSubscription(...args),
  },
}));

// ---------------------------------------------------------------------------
// Mock: error-handler — pass-through wrapper so withErrorHandler works
// ---------------------------------------------------------------------------
vi.mock('@/lib/error-handler', () => ({
  withErrorHandler: (handler: (req: NextRequest) => Promise<Response>) => (req: NextRequest) =>
    handler(req),
}));

// ---------------------------------------------------------------------------
// Mock: CreditService — allow by default (sufficient credits)
// ---------------------------------------------------------------------------
vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    checkAvailable: vi.fn().mockResolvedValue(true),
    getBalance: vi.fn().mockResolvedValue({ credits_remaining_cents: 10000 }),
    deductCredits: vi.fn().mockResolvedValue({ success: true }),
    generateIdempotencyKey: vi.fn().mockReturnValue('test-idempotency-key'),
  },
}));

// ---------------------------------------------------------------------------
// Mock: global fetch (used for provider API calls)
// ---------------------------------------------------------------------------
const mockFetch = vi.fn();
global.fetch = mockFetch;

// ---------------------------------------------------------------------------
// Import route after all mocks are in place
// ---------------------------------------------------------------------------
import { POST, OPTIONS } from '@/app/api/media/image/generate/route';

// ---------------------------------------------------------------------------
// Shared test helpers
// ---------------------------------------------------------------------------
const BASE_URL = 'http://localhost/api/media/image/generate';

function makeRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function makeAuthedRequest(body: unknown, extraHeaders: Record<string, string> = {}): NextRequest {
  return makeRequest(body, {
    Authorization: 'Bearer valid-test-token',
    ...extraHeaders,
  });
}

// ---------------------------------------------------------------------------
// Default subscription fixture (pro tier, active)
// ---------------------------------------------------------------------------
const PRO_SUBSCRIPTION = {
  id: 'sub_test_123',
  user_id: 'user-test-id',
  status: 'active',
  plan_tier: 'pro',
  current_period_start: new Date('2026-01-01'),
  current_period_end: new Date('2026-02-01'),
  stripe_subscription_id: 'stripe_sub_test',
};

// ---------------------------------------------------------------------------
// Default user fixture
// ---------------------------------------------------------------------------
const TEST_USER = { id: 'user-test-id', email: 'test@example.com' };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('POST /api/media/image/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Happy-path defaults
    mockGetUser.mockResolvedValue({ data: { user: TEST_USER }, error: null });
    mockGetSubscription.mockResolvedValue(PRO_SUBSCRIPTION);

    // Set required env vars
    process.env['NEXT_PUBLIC_SUPABASE_URL'] = 'https://test.supabase.co';
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] = 'test-anon-key';
    process.env['OPENAI_API_KEY'] = 'sk-test-openai-key';
    // Unset optional provider keys so getDefaultProvider() picks openai
    delete process.env['GOOGLE_API_KEY'];
    delete process.env['STABILITY_API_KEY'];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // OPTIONS / CORS preflight
  // =========================================================================
  describe('OPTIONS', () => {
    it('should return 204 for preflight when no CORS handler intercepts', async () => {
      const { handleCorsPreflightRequest } = await import('@/lib/cors');
      vi.mocked(handleCorsPreflightRequest).mockReturnValueOnce(null);

      const request = new NextRequest(BASE_URL, { method: 'OPTIONS' });
      const response = await OPTIONS(request);

      expect(response.status).toBe(204);
    });
  });

  // =========================================================================
  // Authentication
  // =========================================================================
  describe('Authentication', () => {
    it('should return 401 when authorization header is missing', async () => {
      const request = makeRequest({ prompt: 'a cat' });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.code).toBe('invalid_api_key');
      expect(data.error.message).toContain('authorization');
    });

    it('should return 401 when authorization header is malformed (no Bearer prefix)', async () => {
      const request = makeRequest({ prompt: 'a cat' }, { Authorization: 'Token abc123' });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.code).toBe('invalid_api_key');
    });

    it('should return 401 when Supabase token is invalid', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid JWT' },
      });

      const response = await POST(makeAuthedRequest({ prompt: 'a cat' }));
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.code).toBe('invalid_api_key');
      expect(data.error.message).toContain('authentication');
    });

    it('should return 401 when Supabase returns null user without error', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

      const response = await POST(makeAuthedRequest({ prompt: 'a cat' }));
      await response.json();

      expect(response.status).toBe(401);
    });
  });

  // =========================================================================
  // CSRF
  // =========================================================================
  describe('CSRF protection', () => {
    it('should return 403 when CSRF token is missing or invalid', async () => {
      const { requireCsrfToken } = await import('@/lib/csrf');
      vi.mocked(requireCsrfToken).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: 'Invalid or missing CSRF token',
            code: 'CSRF_VALIDATION_FAILED',
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const response = await POST(makeAuthedRequest({ prompt: 'a cat' }));

      expect(response.status).toBe(403);
    });
  });

  // =========================================================================
  // Rate Limiting
  // =========================================================================
  describe('Rate limiting', () => {
    it('should return 429 when rate limited', async () => {
      const { withRateLimit } = await import('@/lib/rate-limit');
      const { NextResponse } = await import('next/server');

      vi.mocked(withRateLimit).mockResolvedValueOnce(
        NextResponse.json(
          { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded' } },
          { status: 429 },
        ),
      );

      const response = await POST(makeAuthedRequest({ prompt: 'a cat' }));
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should pass rate limit key "image-generation" to withRateLimit', async () => {
      // Provide a working fetch so we don't fail inside generation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ url: 'https://example.com/image.png' }] }),
      });

      const { withRateLimit } = await import('@/lib/rate-limit');
      await POST(makeAuthedRequest({ prompt: 'a cat' }));

      expect(withRateLimit).toHaveBeenCalledWith(expect.any(NextRequest), 'image-generation');
    });
  });

  // =========================================================================
  // Subscription / plan checks
  // =========================================================================
  describe('Subscription checks', () => {
    it('should return 403 when user has no subscription', async () => {
      mockGetSubscription.mockResolvedValue(null);

      const response = await POST(makeAuthedRequest({ prompt: 'a cat' }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error.code).toBe('subscription_required');
    });

    it('should return 403 when subscription status is past_due', async () => {
      mockGetSubscription.mockResolvedValue({ ...PRO_SUBSCRIPTION, status: 'past_due' });

      const response = await POST(makeAuthedRequest({ prompt: 'a cat' }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error.code).toBe('subscription_inactive');
    });

    it('should return 403 when subscription status is canceled', async () => {
      mockGetSubscription.mockResolvedValue({ ...PRO_SUBSCRIPTION, status: 'canceled' });

      const response = await POST(makeAuthedRequest({ prompt: 'a cat' }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error.code).toBe('subscription_inactive');
    });

    it('should return 403 when plan tier is free (below pro)', async () => {
      mockGetSubscription.mockResolvedValue({ ...PRO_SUBSCRIPTION, plan_tier: 'free' });

      const response = await POST(makeAuthedRequest({ prompt: 'a cat' }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error.code).toBe('plan_upgrade_required');
      expect(data.error.required_plans).toContain('pro');
    });

    it('should return 403 when plan tier is hobby', async () => {
      mockGetSubscription.mockResolvedValue({ ...PRO_SUBSCRIPTION, plan_tier: 'hobby' });

      const response = await POST(makeAuthedRequest({ prompt: 'a cat' }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error.code).toBe('plan_upgrade_required');
    });

    it('should allow trialing subscription status', async () => {
      mockGetSubscription.mockResolvedValue({ ...PRO_SUBSCRIPTION, status: 'trialing' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ url: 'https://example.com/image.png' }] }),
      });

      const response = await POST(makeAuthedRequest({ prompt: 'a cat' }));

      expect(response.status).toBe(200);
    });

    it('should allow max tier subscription', async () => {
      mockGetSubscription.mockResolvedValue({ ...PRO_SUBSCRIPTION, plan_tier: 'max' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ url: 'https://example.com/image.png' }] }),
      });

      const response = await POST(makeAuthedRequest({ prompt: 'a cat' }));

      expect(response.status).toBe(200);
    });
  });

  // =========================================================================
  // Request validation
  // =========================================================================
  describe('Request validation', () => {
    it('should return 400 for invalid JSON body', async () => {
      const request = new NextRequest(BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-test-token',
        },
        body: 'not json {{',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.message).toContain('JSON');
    });

    it('should return 400 when prompt is missing', async () => {
      const response = await POST(makeAuthedRequest({ size: '1024x1024' }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.type).toBe('invalid_request_error');
    });

    it('should return 400 when prompt is empty string', async () => {
      const response = await POST(makeAuthedRequest({ prompt: '' }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.type).toBe('invalid_request_error');
    });

    it('should return 400 when prompt exceeds 4000 characters', async () => {
      const response = await POST(makeAuthedRequest({ prompt: 'x'.repeat(4001) }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.type).toBe('invalid_request_error');
    });

    it('should return 400 when n is greater than 4', async () => {
      const response = await POST(makeAuthedRequest({ prompt: 'a cat', n: 5 }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.type).toBe('invalid_request_error');
    });

    it('should return 400 when provider is unavailable', async () => {
      // Request google provider but GOOGLE_API_KEY is not set
      const response = await POST(makeAuthedRequest({ prompt: 'a cat', provider: 'google' }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('provider_unavailable');
    });
  });

  // =========================================================================
  // Provider fallback — no providers configured
  // =========================================================================
  describe('Provider configuration', () => {
    it('should return 500 when no provider API keys are set', async () => {
      delete process.env['OPENAI_API_KEY'];
      delete process.env['GOOGLE_API_KEY'];
      delete process.env['STABILITY_API_KEY'];

      const response = await POST(makeAuthedRequest({ prompt: 'a cat' }));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error.code).toBe('no_providers');
    });
  });

  // =========================================================================
  // Happy path — OpenAI DALL-E
  // =========================================================================
  describe('Success — OpenAI provider', () => {
    it('should return 200 with generated image url', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ url: 'https://example.com/dalle-image.png' }],
        }),
      });

      const response = await POST(
        makeAuthedRequest({ prompt: 'a cat sitting on a throne', provider: 'openai' }),
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.provider).toBe('openai');
      expect(data.images).toHaveLength(1);
      expect(data.images[0].url).toBe('https://example.com/dalle-image.png');
      expect(data.model).toBe('dall-e-3');
      expect(typeof data.cost_estimate).toBe('number');
      expect(typeof data.latency_ms).toBe('number');
    });

    it('should return 200 with hd quality model', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ url: 'https://example.com/hd-image.png' }],
        }),
      });

      const response = await POST(
        makeAuthedRequest({ prompt: 'landscape', provider: 'openai', quality: 'hd' }),
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.model).toBe('dall-e-3-hd');
    });
  });

  // =========================================================================
  // Happy path — Google Imagen
  // =========================================================================
  describe('Success — Google Imagen provider', () => {
    beforeEach(() => {
      process.env['GOOGLE_API_KEY'] = 'test-google-key';
      delete process.env['OPENAI_API_KEY'];
    });

    it('should return 200 with base64 image from Google Imagen', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          predictions: [{ bytesBase64Encoded: 'base64imagedata==' }],
        }),
      });

      const response = await POST(
        makeAuthedRequest({ prompt: 'a mountain landscape', provider: 'google' }),
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.provider).toBe('google');
      expect(data.images[0].b64_json).toBe('base64imagedata==');
    });
  });

  // =========================================================================
  // Happy path — Stability AI
  // =========================================================================
  describe('Success — Stability AI provider', () => {
    beforeEach(() => {
      process.env['STABILITY_API_KEY'] = 'test-stability-key';
      delete process.env['OPENAI_API_KEY'];
      delete process.env['GOOGLE_API_KEY'];
    });

    it('should return 200 with base64 image from Stability AI', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          image: 'stabilitybase64data==',
          finish_reason: 'SUCCESS',
        }),
      });

      const response = await POST(
        makeAuthedRequest({ prompt: 'futuristic cityscape', provider: 'stability' }),
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.provider).toBe('stability');
      expect(data.images[0].b64_json).toBe('stabilitybase64data==');
    });
  });

  // =========================================================================
  // Provider error handling
  // =========================================================================
  describe('Provider errors', () => {
    it('should return 422 when provider returns a non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: { message: 'Provider internal error' } }),
      });

      const response = await POST(makeAuthedRequest({ prompt: 'a cat', provider: 'openai' }));
      const data = await response.json();

      expect(response.status).toBe(422);
      expect(data.success).toBe(false);
      expect(data.images).toHaveLength(0);
    });

    it('should return 422 with content policy friendly message when prompt is flagged', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({
          error: { message: 'Your prompt violates content policy guidelines' },
        }),
      });

      const response = await POST(
        makeAuthedRequest({ prompt: 'violating prompt', provider: 'openai' }),
      );
      const data = await response.json();

      expect(response.status).toBe(422);
      expect(data.success).toBe(false);
      expect(data.error).toContain('content safety');
    });

    it('should return 422 with rate limit friendly message on quota error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: async () => ({
          error: { message: 'rate limit exceeded, quota reached' },
        }),
      });

      const response = await POST(makeAuthedRequest({ prompt: 'a cat', provider: 'openai' }));
      const data = await response.json();

      expect(response.status).toBe(422);
      expect(data.error).toContain('temporarily busy');
    });

    it('should return 422 with timeout friendly message on timeout error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('TimeoutError: The operation was aborted'));

      const response = await POST(makeAuthedRequest({ prompt: 'a cat', provider: 'openai' }));
      const data = await response.json();

      expect(response.status).toBe(422);
      expect(data.error).toContain('timed out');
    });
  });

  // =========================================================================
  // Default provider selection
  // =========================================================================
  describe('Default provider selection', () => {
    it('should prefer Google when GOOGLE_API_KEY is set', async () => {
      process.env['GOOGLE_API_KEY'] = 'test-google-key';
      delete process.env['OPENAI_API_KEY'];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ predictions: [{ bytesBase64Encoded: 'abc' }] }),
      });

      const response = await POST(makeAuthedRequest({ prompt: 'a cat' }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.provider).toBe('google');
    });

    it('should fall back to OpenAI when only OPENAI_API_KEY is set', async () => {
      delete process.env['GOOGLE_API_KEY'];
      process.env['OPENAI_API_KEY'] = 'sk-test';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ url: 'https://img.example.com/1.png' }] }),
      });

      const response = await POST(makeAuthedRequest({ prompt: 'a cat' }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.provider).toBe('openai');
    });
  });
});
