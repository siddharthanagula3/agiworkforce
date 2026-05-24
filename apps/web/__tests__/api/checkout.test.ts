import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

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

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(() => ({ userId: 'test-user-id' })),
}));

vi.mock('@/services/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(() => ({
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

// STRIPE_CHECKOUT_ENABLED is read at module-scope in the route, so it must be
// set before the import. Use vi.hoisted to run this before the static import
// resolution so the env var is present when the module first loads.
const envSetup = vi.hoisted(() => {
  process.env['STRIPE_CHECKOUT_ENABLED'] = 'true';
  process.env['STRIPE_SECRET_KEY'] = 'sk_test_key';
  return {};
});
void envSetup;

import { POST } from '@/app/api/checkout/route';

describe('POST /api/checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['STRIPE_SECRET_KEY'] = 'sk_test_key';
    process.env['STRIPE_CHECKOUT_ENABLED'] = 'true';
  });

  it('should return 401 if user is not authenticated', async () => {
    const { auth } = await import('@clerk/nextjs/server');
    vi.mocked(auth).mockReturnValueOnce({ userId: null } as ReturnType<typeof auth>);

    const request = new NextRequest('http://localhost/api/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'pro', billingInterval: 'monthly' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error.code).toBe('UNAUTHORIZED');
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
