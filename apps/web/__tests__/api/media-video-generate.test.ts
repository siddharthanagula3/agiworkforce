import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mock: server-only
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
// Mock: CORS helpers
// ---------------------------------------------------------------------------
vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn().mockReturnValue(null),
  getCorsHeaders: vi.fn().mockReturnValue({}),
  getSecurityHeaders: vi.fn().mockReturnValue({}),
}));

// ---------------------------------------------------------------------------
// Mock: errors — use real implementations so createError.* works correctly
// ---------------------------------------------------------------------------
vi.mock('@/lib/errors', async () => {
  const actual = await vi.importActual<typeof import('@agiworkforce/utils')>('@agiworkforce/utils');
  return {
    createError: actual.createError,
    AppError: actual.AppError,
    isAppError: actual.isAppError,
  };
});

// ---------------------------------------------------------------------------
// Mock: error-handler — real withErrorHandler so thrown AppErrors produce
//        proper JSON responses (matching the live route behaviour)
// ---------------------------------------------------------------------------
vi.mock('@/lib/error-handler', async () => {
  const actual = await vi.importActual<typeof import('@/lib/error-handler')>('@/lib/error-handler');
  return { withErrorHandler: actual.withErrorHandler, handleError: actual.handleError };
});

// ---------------------------------------------------------------------------
// Mock: Supabase client
// ---------------------------------------------------------------------------
const mockGetUser = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
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
// Mock: global fetch (used for provider API calls)
// ---------------------------------------------------------------------------
const mockFetch = vi.fn();
global.fetch = mockFetch;

// ---------------------------------------------------------------------------
// Import route after all mocks are in place
// ---------------------------------------------------------------------------
import { POST, OPTIONS } from '@/app/api/media/video/generate/route';

// ---------------------------------------------------------------------------
// Shared test helpers
// ---------------------------------------------------------------------------
const BASE_URL = 'http://localhost/api/media/video/generate';

function makeAuthedRequest(body: unknown, extraHeaders: Record<string, string> = {}): NextRequest {
  return new NextRequest(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer valid-test-token',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
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

const TEST_USER = { id: 'user-test-id', email: 'test@example.com' };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('POST /api/media/video/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Happy-path defaults
    mockGetUser.mockResolvedValue({ data: { user: TEST_USER }, error: null });
    mockGetSubscription.mockResolvedValue(PRO_SUBSCRIPTION);

    // Set env vars
    process.env['NEXT_PUBLIC_SUPABASE_URL'] = 'https://test.supabase.co';
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] = 'test-anon-key';
    process.env['RUNWAY_API_KEY'] = 'test-runway-key';
    delete process.env['GOOGLE_API_KEY'];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env['RUNWAY_API_KEY'];
    delete process.env['GOOGLE_API_KEY'];
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
      const request = new NextRequest(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'a sunset' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when authorization does not start with Bearer', async () => {
      const request = new NextRequest(BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Token abc123',
        },
        body: JSON.stringify({ prompt: 'a sunset' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when Supabase token is invalid', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid JWT' },
      });

      const response = await POST(makeAuthedRequest({ prompt: 'a sunset' }));
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when Supabase returns null user without error', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

      const response = await POST(makeAuthedRequest({ prompt: 'a sunset' }));
      await response.json();

      expect(response.status).toBe(401);
    });
  });

  // =========================================================================
  // Rate limiting
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

      const response = await POST(makeAuthedRequest({ prompt: 'a sunset' }));
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should pass rate limit key "video-generation" to withRateLimit', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'task-abc123' }),
      });

      const { withRateLimit } = await import('@/lib/rate-limit');
      await POST(makeAuthedRequest({ prompt: 'a sunset' }));

      expect(withRateLimit).toHaveBeenCalledWith(expect.any(NextRequest), 'video-generation');
    });
  });

  // =========================================================================
  // Subscription / plan checks
  // =========================================================================
  describe('Subscription checks', () => {
    it('should return 403 when user has no subscription', async () => {
      mockGetSubscription.mockResolvedValue(null);

      const response = await POST(makeAuthedRequest({ prompt: 'a sunset' }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error.code).toBe('FORBIDDEN');
      expect(data.error.message).toContain('subscription');
    });

    it('should return 403 when subscription status is past_due', async () => {
      mockGetSubscription.mockResolvedValue({ ...PRO_SUBSCRIPTION, status: 'past_due' });

      const response = await POST(makeAuthedRequest({ prompt: 'a sunset' }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error.code).toBe('FORBIDDEN');
      expect(data.error.message).toContain('past_due');
    });

    it('should return 403 when plan tier is free', async () => {
      mockGetSubscription.mockResolvedValue({ ...PRO_SUBSCRIPTION, plan_tier: 'free' });

      const response = await POST(makeAuthedRequest({ prompt: 'a sunset' }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error.code).toBe('FORBIDDEN');
      expect(data.error.message).toContain('Video generation');
    });

    it('should return 403 when plan tier is hobby', async () => {
      mockGetSubscription.mockResolvedValue({ ...PRO_SUBSCRIPTION, plan_tier: 'hobby' });

      const response = await POST(makeAuthedRequest({ prompt: 'a sunset' }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error.code).toBe('FORBIDDEN');
    });

    it('should allow trialing subscription status', async () => {
      mockGetSubscription.mockResolvedValue({ ...PRO_SUBSCRIPTION, status: 'trialing' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'task-xyz' }),
      });

      const response = await POST(makeAuthedRequest({ prompt: 'a sunset' }));

      expect(response.status).toBe(200);
    });

    it('should allow max tier subscription', async () => {
      mockGetSubscription.mockResolvedValue({ ...PRO_SUBSCRIPTION, plan_tier: 'max' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'task-xyz' }),
      });

      const response = await POST(makeAuthedRequest({ prompt: 'a sunset' }));

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
        body: 'not valid json {{',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when prompt is missing', async () => {
      const response = await POST(makeAuthedRequest({ duration_secs: 5 }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when prompt is empty string', async () => {
      const response = await POST(makeAuthedRequest({ prompt: '' }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when prompt exceeds 2000 characters', async () => {
      const response = await POST(makeAuthedRequest({ prompt: 'x'.repeat(2001) }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when duration_secs is less than 2', async () => {
      const response = await POST(makeAuthedRequest({ prompt: 'a sunset', duration_secs: 1 }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when duration_secs is greater than 10', async () => {
      const response = await POST(makeAuthedRequest({ prompt: 'a sunset', duration_secs: 11 }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when resolution is invalid', async () => {
      const response = await POST(makeAuthedRequest({ prompt: 'a sunset', resolution: '480p' }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // =========================================================================
  // Provider selection — no provider configured
  // =========================================================================
  describe('Provider configuration', () => {
    it('should return 503 when neither RUNWAY_API_KEY nor GOOGLE_API_KEY is set', async () => {
      delete process.env['RUNWAY_API_KEY'];
      delete process.env['GOOGLE_API_KEY'];

      const response = await POST(makeAuthedRequest({ prompt: 'a sunset' }));
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error.message).toContain('provider');
    });
  });

  // =========================================================================
  // Happy path — Runway provider
  // =========================================================================
  describe('Success — Runway provider', () => {
    it('should return 200 with task_id when Runway task is created', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'runway-task-abc123', status: 'PENDING' }),
      });

      const response = await POST(
        makeAuthedRequest({ prompt: 'a cinematic sunset', provider: 'runway' }),
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.task_id).toBe('runway_runway-task-abc123');
      expect(data.status).toBe('queued');
      expect(data.provider).toBe('runway');
      expect(typeof data.estimated_duration_secs).toBe('number');
    });

    it('should include estimated_duration_secs based on video duration', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'runway-task-xyz', status: 'PENDING' }),
      });

      const response = await POST(
        makeAuthedRequest({ prompt: 'a sunset', provider: 'runway', duration_secs: 8 }),
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      // estimated = 60 + 8 * 10 = 140 seconds
      expect(data.estimated_duration_secs).toBe(140);
    });

    it('should default to Runway provider when RUNWAY_API_KEY is set and no provider is specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'runway-default-task', status: 'PENDING' }),
      });

      const response = await POST(makeAuthedRequest({ prompt: 'a sunset' }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.provider).toBe('runway');
    });
  });

  // =========================================================================
  // Happy path — Google Veo provider
  // =========================================================================
  describe('Success — Google Veo provider', () => {
    beforeEach(() => {
      delete process.env['RUNWAY_API_KEY'];
      process.env['GOOGLE_API_KEY'] = 'test-google-key';
    });

    it('should return 200 with task_id when Google Veo operation is created', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'operations/12345678', done: false }),
      });

      const response = await POST(
        makeAuthedRequest({ prompt: 'a snowy mountain', provider: 'google' }),
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.task_id).toBe('google_12345678');
      expect(data.status).toBe('queued');
      expect(data.provider).toBe('google');
    });
  });

  // =========================================================================
  // Provider error handling
  // =========================================================================
  describe('Provider errors', () => {
    it('should return 401/503 when Runway returns 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Unauthorized',
      });

      const response = await POST(makeAuthedRequest({ prompt: 'a sunset', provider: 'runway' }));
      const data = await response.json();

      // createError.serviceUnavailable => 503
      expect(response.status).toBe(503);
      expect(data.error.message).toContain('authentication');
    });

    it('should return 429 when Runway returns 429', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: async () => 'Too Many Requests',
      });

      const response = await POST(makeAuthedRequest({ prompt: 'a sunset', provider: 'runway' }));
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.error.message).toContain('rate limit');
    });

    it('should return 500 when Runway returns a generic server error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Internal Server Error',
      });

      const response = await POST(makeAuthedRequest({ prompt: 'a sunset', provider: 'runway' }));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error.code).toBe('INTERNAL_SERVER_ERROR');
    });

    it('should return 500 when Runway returns no task ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'PENDING' }), // missing id
      });

      const response = await POST(makeAuthedRequest({ prompt: 'a sunset', provider: 'runway' }));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error.code).toBe('INTERNAL_SERVER_ERROR');
    });

    it('should return 503 when Google Veo returns 401', async () => {
      process.env['GOOGLE_API_KEY'] = 'test-google-key';
      delete process.env['RUNWAY_API_KEY'];

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Unauthorized',
      });

      const response = await POST(makeAuthedRequest({ prompt: 'a sunset', provider: 'google' }));
      await response.json();

      expect(response.status).toBe(503);
    });

    it('should return 400 when Google Veo flags prompt as unsafe', async () => {
      process.env['GOOGLE_API_KEY'] = 'test-google-key';
      delete process.env['RUNWAY_API_KEY'];

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () =>
          JSON.stringify({ error: { message: 'Content safety filters triggered' } }),
      });

      const response = await POST(makeAuthedRequest({ prompt: 'a sunset', provider: 'google' }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 500 when fetch throws a network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const response = await POST(makeAuthedRequest({ prompt: 'a sunset', provider: 'runway' }));
      await response.json();

      expect(response.status).toBe(500);
    });
  });
});
