import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/checkout/route';

// Mock dependencies
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(() => null),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    getSubscription: vi.fn(() => null),
  },
}));

vi.mock('../../services/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({
        data: {
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
          },
        },
      })),
      getSession: vi.fn(() => ({
        data: {
          session: {
            user: {
              id: 'test-user-id',
              email: 'test@example.com',
            },
          },
        },
      })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => ({
            data: { stripe_customer_id: 'cus_test123' },
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({ data: null, error: null })),
      })),
    })),
  })),
}));

vi.mock('stripe', () => {
  class MockStripe {
    checkout = {
      sessions: {
        create: vi.fn(() => ({
          id: 'test-session-id',
          url: 'https://checkout.stripe.com/test',
        })),
      },
    };
    customers = {
      list: vi.fn(() => ({ data: [] })),
    };
  }
  return {
    default: MockStripe,
    errors: {
      StripeError: class StripeError extends Error {
        type = 'StripeError';
        code = 'test_code';
      },
    },
  };
});

// Mock pricing configuration
vi.mock('@/lib/pricing', () => ({
  STRIPE_PRICE_IDS: {
    hobby: { monthly: 'price_hobby_monthly', annual: 'price_hobby_yearly' },
    pro: { monthly: 'price_pro_monthly', annual: 'price_pro_yearly' },
    max: { monthly: 'price_max_monthly', annual: 'price_max_yearly' },
  },
  PRICING_CONFIG: {
    getPlanFromPriceId: vi.fn(),
  },
}));

describe('POST /api/checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_key';
  });

  it('should return 401 if user is not authenticated', async () => {
    const { createSupabaseServerClient } = await import('../../services/supabase-server');
    vi.mocked(createSupabaseServerClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn(() => ({
          data: { user: null },
        })),
        getSession: vi.fn(() => ({
          data: { session: null },
        })),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => ({ data: null })),
          })),
        })),
      })),
    } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);

    const request = new NextRequest('http://localhost/api/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'pro', billingInterval: 'monthly' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error.code).toBe('UNAUTHORIZED');
    expect(data.error.message).toBe('Please sign in to continue');
  });

  it('should validate request body', async () => {
    const request = new NextRequest('http://localhost/api/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'invalid', billingInterval: 'monthly' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe('VALIDATION_ERROR');
    expect(data.error.message).toMatch(/Invalid|plan/);
  });

  it('should create checkout session for valid request', async () => {
    const request = new NextRequest('http://localhost/api/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'pro', billingInterval: 'monthly' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.url).toBeDefined();
  });

  it('should reject invalid/enterprise plan', async () => {
    const request = new NextRequest('http://localhost/api/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'enterprise', billingInterval: 'monthly' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe('VALIDATION_ERROR');
    expect(data.error.message).toMatch(/Invalid|plan/);
  });
});
