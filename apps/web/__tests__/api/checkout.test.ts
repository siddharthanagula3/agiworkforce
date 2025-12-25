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
    },
  })),
}));

vi.mock('stripe', () => {
  return {
    default: vi.fn(() => ({
      checkout: {
        sessions: {
          create: vi.fn(() => ({
            id: 'test-session-id',
            url: 'https://checkout.stripe.com/test',
          })),
        },
      },
    })),
    errors: {
      StripeError: class StripeError extends Error {
        type = 'StripeError';
        code = 'test_code';
      },
    },
  };
});

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
      },
    } as any);

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

  it('should reject enterprise plan', async () => {
    const request = new NextRequest('http://localhost/api/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'enterprise', billingInterval: 'monthly' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe('VALIDATION_ERROR');
  });
});
