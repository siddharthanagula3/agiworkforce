import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/usage/route';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(() => null),
  withRateLimitHandler: vi.fn(
    (handler: (...args: unknown[]) => Promise<unknown>) =>
      (...args: unknown[]) =>
        handler(...args),
  ),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn(() => null),
  getCorsHeaders: vi.fn(() => ({})),
  getSecurityHeaders: vi.fn(() => ({})),
  withCorsRoute: (handler: (...args: unknown[]) => unknown) => handler,
}));

vi.mock('@shared/utils/env', () => ({
  requireEnv: vi.fn((key: string) => `test-${key}`),
  getOptionalEnv: vi.fn(() => undefined),
}));

const mockGetUserScopedDb = vi.fn();
const scopedDb = { query: vi.fn(), execute: vi.fn(), transaction: vi.fn() };
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...args: unknown[]) => mockGetUserScopedDb(...args),
}));

vi.mock('@/services/neon-db', () => ({
  createNeonServerClient: vi.fn().mockResolvedValue({}),
}));

const mockGetBalance = vi.fn();
vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    getBalance: (...args: unknown[]) => mockGetBalance(...args),
  },
}));

const mockGetSubscription = vi.fn();
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    getSubscription: (...args: unknown[]) => mockGetSubscription(...args),
  },
}));

const mockGetFreeTrialPublicUsage = vi.fn();
vi.mock('@/lib/services/free-trial-service', () => ({
  getFreeTrialPublicUsage: (...args: unknown[]) => mockGetFreeTrialPublicUsage(...args),
}));

const mockGetRollingUsage = vi.fn();
vi.mock('@/lib/server/rolling-usage', () => ({
  getRollingUsage: (...args: unknown[]) => mockGetRollingUsage(...args),
}));

vi.mock('@/lib/errors', async (importOriginal) => {
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
    ...(await importOriginal()),
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

    mockGetUserScopedDb.mockResolvedValue({
      db: scopedDb,
      userId: 'user-123',
      organizationId: null,
    });

    mockGetBalance.mockResolvedValue(MOCK_BALANCE);
    mockGetSubscription.mockResolvedValue(MOCK_SUBSCRIPTION);
    mockGetRollingUsage.mockResolvedValue({ usedCents: 0, oldestAt: null });
    mockGetFreeTrialPublicUsage.mockResolvedValue({
      usagePercentage: 0,
      resetAt: null,
      hasUsageRemaining: true,
    });
  });

  it('should return 401 when no authorization and no Clerk session', async () => {
    mockGetUserScopedDb.mockRejectedValueOnce(
      Object.assign(new Error('UNAUTHORIZED'), { code: 'UNAUTHORIZED', statusCode: 401 }),
    );

    const request = makeGetRequest();
    const response = await GET(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error.code).toBe('UNAUTHORIZED');
  });

  it('should return 401 when Bearer token is invalid', async () => {
    mockGetUserScopedDb.mockRejectedValueOnce(
      Object.assign(new Error('Invalid token'), { code: 'UNAUTHORIZED', statusCode: 401 }),
    );

    const request = makeGetRequest(FAKE_BEARER);
    const response = await GET(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error.code).toBe('UNAUTHORIZED');
  });

  it('should authenticate via Clerk session and call services with userId', async () => {
    mockGetUserScopedDb.mockResolvedValueOnce({
      db: scopedDb,
      userId: 'cookie-user-456',
      organizationId: null,
    });

    const request = makeGetRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockGetBalance).toHaveBeenCalledWith(scopedDb, 'cookie-user-456');
    expect(mockGetSubscription).toHaveBeenCalledWith(scopedDb, 'cookie-user-456');
  });

  it('should return usage data for an authenticated user', async () => {
    const request = makeGetRequest(FAKE_BEARER);
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.plan_tier).toBe('pro');
    expect(data.usage_percentage).toBeCloseTo(25, 1);
    expect(data.subscription_status).toBe('active');
    expect(data).not.toHaveProperty('credits_allocated_cents');
    expect(data).not.toHaveProperty('credits_used_cents');
    expect(data).not.toHaveProperty('credits_remaining_cents');
    expect(data).not.toHaveProperty('daily_limit_cents');
    expect(data).not.toHaveProperty('daily_used_cents');
  });

  it('should return period dates from balance when available', async () => {
    const request = makeGetRequest(FAKE_BEARER);
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.period_start).toBe(new Date(MOCK_BALANCE.period_start).toISOString());
    expect(data.period_end).toBe(new Date(MOCK_BALANCE.period_end).toISOString());
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

    expect(data.period_start).toBe(MOCK_SUBSCRIPTION.current_period_start.toISOString());
    expect(data.period_end).toBe(MOCK_SUBSCRIPTION.current_period_end.toISOString());
  });

  it('should return free plan and zero usage when balance and subscription are null', async () => {
    mockGetBalance.mockResolvedValueOnce(null);
    mockGetSubscription.mockResolvedValueOnce(null);

    const request = makeGetRequest(FAKE_BEARER);
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.plan_tier).toBe('free');
    expect(data.usage_percentage).toBe(0);
    expect(data.subscription_status).toBe('none');
    expect(data).not.toHaveProperty('credits_allocated_cents');
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
