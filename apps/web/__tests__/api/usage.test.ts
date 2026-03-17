import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/usage/route';

// Mock server-only module
vi.mock('server-only', () => ({}));

// Mock rate limiting — pass through by default
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(() => null),
  withRateLimitHandler: vi.fn(
    (handler: (...args: unknown[]) => Promise<unknown>) =>
      (...args: unknown[]) =>
        handler(...args),
  ),
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock CORS helper
vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn(() => null),
  getCorsHeaders: vi.fn(() => ({})),
  getSecurityHeaders: vi.fn(() => ({})),
}));

// Mock env utility
vi.mock('@/utils/env', () => ({
  requireEnv: vi.fn((key: string) => {
    const envMap: Record<string, string> = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-test',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-test',
    };
    return envMap[key] ?? `test-${key}`;
  }),
  getOptionalEnv: vi.fn(() => undefined),
}));

// Mock Supabase client
const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

// Mock @supabase/ssr for cookie-based auth path
const mockSsrGetUser = vi.fn();
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: mockSsrGetUser,
    },
  })),
}));

// Mock CreditService
const mockGetBalance = vi.fn();
vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    getBalance: (...args: unknown[]) => mockGetBalance(...args),
  },
}));

// Mock SubscriptionService
const mockGetSubscription = vi.fn();
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    getSubscription: (...args: unknown[]) => mockGetSubscription(...args),
  },
}));

// Mock error utilities
vi.mock('@/lib/errors', () => {
  class AppError extends Error {
    code: string;
    statusCode: number;
    details?: unknown;
    constructor(message: string, code: string, statusCode: number, details?: unknown) {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
      this.details = details;
    }
  }
  return {
    createError: {
      unauthorized: (msg: string) => new AppError(msg, 'UNAUTHORIZED', 401),
      badRequest: (msg: string) => new AppError(msg, 'BAD_REQUEST', 400),
      forbidden: (msg: string) => new AppError(msg, 'FORBIDDEN', 403),
      internal: (msg: string) => new AppError(msg, 'INTERNAL_ERROR', 500),
      validation: (msg: string, details?: unknown) =>
        new AppError(msg, 'VALIDATION_ERROR', 400, details),
    },
    AppError,
    isAppError: (e: unknown) => e instanceof AppError,
  };
});

const FAKE_BEARER = 'Bearer valid-token-here';

function makeGetRequest(authHeader?: string) {
  const headers: Record<string, string> = {};
  if (authHeader) {
    headers['authorization'] = authHeader;
  }
  return new NextRequest('http://localhost/api/usage', {
    method: 'GET',
    headers,
  });
}

const MOCK_BALANCE = {
  account_id: 'acct-abc',
  period_start: '2026-02-01T00:00:00Z',
  period_end: '2026-02-28T23:59:59Z',
  credits_allocated_cents: 1200,
  credits_used_cents: 300,
  credits_remaining_cents: 900,
  daily_limit_cents: 360,
  daily_used_cents: 50,
  daily_remaining_cents: 310,
};

const MOCK_SUBSCRIPTION = {
  id: 'sub-xyz',
  user_id: 'user-123',
  plan_tier: 'pro',
  status: 'active',
  current_period_start: new Date('2026-02-01'),
  current_period_end: new Date('2026-02-28'),
  stripe_subscription_id: 'sub_stripe123',
};

describe('GET /api/usage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: authenticated user via Bearer token
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null,
    });

    // Default: no cookie-based session
    mockSsrGetUser.mockResolvedValue({
      data: { user: null },
      error: new Error('No session'),
    });

    // Default: successful service responses
    mockGetBalance.mockResolvedValue(MOCK_BALANCE);
    mockGetSubscription.mockResolvedValue(MOCK_SUBSCRIPTION);
  });

  it('should return 401 when no authorization header is provided and no cookie session', async () => {
    const request = makeGetRequest(); // no auth header
    const response = await GET(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error.code).toBe('UNAUTHORIZED');
  });

  it('should return 401 when Bearer token is invalid', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: new Error('Invalid token'),
    });

    const request = makeGetRequest(FAKE_BEARER);
    const response = await GET(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error.code).toBe('UNAUTHORIZED');
  });

  it('should authenticate via cookie session when no Bearer token is provided', async () => {
    mockSsrGetUser.mockResolvedValueOnce({
      data: { user: { id: 'cookie-user-456', email: 'cookie@example.com' } },
      error: null,
    });

    const request = makeGetRequest(); // no Bearer token — falls through to SSR cookie auth
    const response = await GET(request);

    expect(response.status).toBe(200);
    // CreditService and SubscriptionService should have been called with the cookie user's ID
    expect(mockGetBalance).toHaveBeenCalledWith('cookie-user-456');
    expect(mockGetSubscription).toHaveBeenCalledWith('cookie-user-456');
  });

  it('should return usage data for an authenticated user', async () => {
    const request = makeGetRequest(FAKE_BEARER);
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.plan_tier).toBe('pro');
    expect(data.credits_allocated_cents).toBe(1200);
    expect(data.credits_used_cents).toBe(300);
    expect(data.credits_remaining_cents).toBe(900);
    expect(data.usage_percentage).toBeCloseTo(25, 1); // 300/1200 * 100 = 25%
    expect(data.subscription_status).toBe('active');
    expect(data.daily_limit_cents).toBe(360);
    expect(data.daily_used_cents).toBe(50);
    expect(data.daily_remaining_cents).toBe(310);
  });

  it('should return period dates from balance when available', async () => {
    const request = makeGetRequest(FAKE_BEARER);
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.period_start).toBe(MOCK_BALANCE.period_start);
    expect(data.period_end).toBe(MOCK_BALANCE.period_end);
  });

  it('should fall back to subscription period when balance has no period dates', async () => {
    mockGetBalance.mockResolvedValueOnce({
      ...MOCK_BALANCE,
      period_start: null,
      period_end: null,
    });

    const request = makeGetRequest(FAKE_BEARER);
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    // Should fall back to subscription period dates (serialized to ISO string in JSON)
    expect(data.period_start).toBe(MOCK_SUBSCRIPTION.current_period_start.toISOString());
    expect(data.period_end).toBe(MOCK_SUBSCRIPTION.current_period_end.toISOString());
  });

  it('should return free plan and zero credits when balance and subscription are null', async () => {
    mockGetBalance.mockResolvedValueOnce(null);
    mockGetSubscription.mockResolvedValueOnce(null);

    const request = makeGetRequest(FAKE_BEARER);
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.plan_tier).toBe('free');
    expect(data.credits_allocated_cents).toBe(0);
    expect(data.credits_used_cents).toBe(0);
    expect(data.credits_remaining_cents).toBe(0);
    expect(data.usage_percentage).toBe(0);
    expect(data.subscription_status).toBe('none');
  });

  it('should calculate 0% usage when credits_allocated_cents is 0', async () => {
    mockGetBalance.mockResolvedValueOnce({
      ...MOCK_BALANCE,
      credits_allocated_cents: 0,
      credits_used_cents: 0,
      credits_remaining_cents: 0,
    });

    const request = makeGetRequest(FAKE_BEARER);
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.usage_percentage).toBe(0);
  });

  it('should return 500 when CreditService throws an unexpected error', async () => {
    mockGetBalance.mockRejectedValueOnce(new Error('DB connection failed'));

    const request = makeGetRequest(FAKE_BEARER);
    const response = await GET(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error.code).toBe('INTERNAL_ERROR');
  });

  it('should return 500 when SubscriptionService throws an unexpected error', async () => {
    mockGetSubscription.mockRejectedValueOnce(new Error('DB timeout'));

    const request = makeGetRequest(FAKE_BEARER);
    const response = await GET(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error.code).toBe('INTERNAL_ERROR');
  });

  it('should fetch balance and subscription in parallel', async () => {
    const callOrder: string[] = [];

    mockGetBalance.mockImplementationOnce(async () => {
      callOrder.push('balance');
      return MOCK_BALANCE;
    });
    mockGetSubscription.mockImplementationOnce(async () => {
      callOrder.push('subscription');
      return MOCK_SUBSCRIPTION;
    });

    const request = makeGetRequest(FAKE_BEARER);
    await GET(request);

    // Both should have been called (order may vary since they're parallel)
    expect(callOrder).toContain('balance');
    expect(callOrder).toContain('subscription');
    expect(mockGetBalance).toHaveBeenCalledOnce();
    expect(mockGetSubscription).toHaveBeenCalledOnce();
  });

  it('should use subscription plan tier when balance is null', async () => {
    mockGetBalance.mockResolvedValueOnce(null);
    mockGetSubscription.mockResolvedValueOnce({ ...MOCK_SUBSCRIPTION, plan_tier: 'max' });

    const request = makeGetRequest(FAKE_BEARER);
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.plan_tier).toBe('max');
  });
});
