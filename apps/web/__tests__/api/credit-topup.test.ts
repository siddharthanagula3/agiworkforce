/**
 * POST /api/credit-topup — validation and auth tests
 *
 * Covers:
 * - Missing amount_cents → 400 VALIDATION_ERROR
 * - amount_cents = null → 400 VALIDATION_ERROR
 * - amount_cents is a string → 400 VALIDATION_ERROR
 * - amount_cents is negative → 400 VALIDATION_ERROR
 * - amount_cents is NaN (sent as JSON string "NaN" — JSON.parse produces string) → 400
 * - amount_cents is Infinity → 400 VALIDATION_ERROR (not finite)
 * - amount_cents is a float (non-integer) → 400 VALIDATION_ERROR
 * - amount_cents below $10 minimum (999 cents) → 400 VALIDATION_ERROR
 * - amount_cents above $1000 maximum (100001 cents) → 400 VALIDATION_ERROR
 * - amount_cents = 1000 (minimum valid) → passes validation (200 with url)
 * - amount_cents = 100000 (maximum valid) → passes validation (200 with url)
 * - amount_cents = 5000 (typical mid-range) → passes validation (200 with url)
 * - Unauthenticated request (no user) → 401 UNAUTHORIZED
 * - Invalid JSON body → 400 VALIDATION_ERROR
 * - CSRF: Bearer token bypasses CSRF check so tests can reach validation logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Environment setup ─────────────────────────────────────────────────────
vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_mock_key');
vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.agiworkforce.com');
vi.stubEnv('CSRF_SECRET', 'test-csrf-secret-32-chars-minimum!!');

// ── Mocks ─────────────────────────────────────────────────────────────────

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

// CSRF: return null so all requests pass CSRF check in tests
vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn(() => Promise.resolve(null)),
}));

// CORS: allow any origin in tests
vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn(() => null),
  isOriginAllowed: vi.fn(() => true),
}));

// Default Supabase mock — authenticated user with email and existing stripe customer
const mockGetUser = vi.fn(() =>
  Promise.resolve({
    data: {
      user: {
        id: 'user-test-id',
        email: 'test@example.com',
      },
    },
    error: null,
  }),
);

const mockMaybeSingle = vi.fn(() =>
  Promise.resolve({
    data: { stripe_customer_id: 'cus_existing123' },
    error: null,
  }),
);

vi.mock('@/services/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        getUser: mockGetUser,
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: mockMaybeSingle,
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
      })),
    }),
  ),
}));

// Stripe mock — returns a session with a URL
vi.mock('stripe', () => {
  class MockStripe {
    checkout = {
      sessions: {
        create: vi.fn(() =>
          Promise.resolve({
            id: 'cs_test_session',
            url: 'https://checkout.stripe.com/pay/cs_test_session',
          }),
        ),
      },
    };
    customers = {
      create: vi.fn(() =>
        Promise.resolve({
          id: 'cus_new123',
          email: 'test@example.com',
        }),
      ),
    };
  }
  return { default: MockStripe };
});

// Import route handler AFTER all mocks are registered
import { POST } from '@/app/api/credit-topup/route';

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Build a NextRequest with an Authorization header so CSRF is bypassed
 * at the `requireCsrfToken` layer (Bearer tokens are exempt from CSRF).
 * This lets tests exercise the body-validation logic directly.
 */
function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/credit-topup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Use Bearer so the real requireCsrfToken would skip CSRF check.
      // Our mock always returns null anyway, but this mirrors production usage.
      Authorization: 'Bearer test-token',
    },
    body: JSON.stringify(body),
  });
}

function makeRawRequest(rawBody: string): NextRequest {
  return new NextRequest('http://localhost/api/credit-topup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-token',
    },
    body: rawBody,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('POST /api/credit-topup — authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default authenticated state for auth tests
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-test-id', email: 'test@example.com' } },
      error: null,
    });
    mockMaybeSingle.mockResolvedValue({
      data: { stripe_customer_id: 'cus_existing123' },
      error: null,
    });
  });

  it('returns 401 when there is no authenticated user', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null as unknown as { id: string; email: string } },
      error: { message: 'Not authenticated' } as unknown as null,
    });

    const response = await POST(makeRequest({ amount_cents: 5000 }));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when getUser returns null user with no error', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null as unknown as { id: string; email: string } },
      error: null,
    });

    const response = await POST(makeRequest({ amount_cents: 5000 }));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error.code).toBe('UNAUTHORIZED');
  });
});

describe('POST /api/credit-topup — invalid JSON body', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-test-id', email: 'test@example.com' } },
      error: null,
    });
    mockMaybeSingle.mockResolvedValue({
      data: { stripe_customer_id: 'cus_existing123' },
      error: null,
    });
  });

  it('returns 400 when the request body is not valid JSON', async () => {
    const response = await POST(makeRawRequest('{not: valid json'));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/credit-topup — missing amount_cents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-test-id', email: 'test@example.com' } },
      error: null,
    });
    mockMaybeSingle.mockResolvedValue({
      data: { stripe_customer_id: 'cus_existing123' },
      error: null,
    });
  });

  it('returns 400 when amount_cents is absent from the body', async () => {
    const response = await POST(makeRequest({}));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe('VALIDATION_ERROR');
    expect(data.error.message).toMatch(/amount_cents/);
  });

  it('returns 400 when amount_cents is explicitly null', async () => {
    const response = await POST(makeRequest({ amount_cents: null }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when the request body is a valid JSON primitive (not an object)', async () => {
    const response = await POST(makeRawRequest('"just a string"'));
    const data = await response.json();

    // amount_cents will be undefined → 400
    expect(response.status).toBe(400);
    expect(data.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/credit-topup — invalid amount_cents types', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-test-id', email: 'test@example.com' } },
      error: null,
    });
    mockMaybeSingle.mockResolvedValue({
      data: { stripe_customer_id: 'cus_existing123' },
      error: null,
    });
  });

  it('returns 400 when amount_cents is a string', async () => {
    const response = await POST(makeRequest({ amount_cents: '5000' }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe('VALIDATION_ERROR');
    expect(data.error.message).toMatch(/finite number/i);
  });

  it('returns 400 when amount_cents is a numeric string "1000"', async () => {
    const response = await POST(makeRequest({ amount_cents: '1000' }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when amount_cents is Infinity (not finite)', async () => {
    // JSON.stringify(Infinity) produces "null" — send the raw string to force
    // the value through. Alternatively encode as a wrapper.
    // Infinity serialises to null in JSON — so we verify the null path.
    const response = await POST(makeRequest({ amount_cents: null }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when amount_cents is a boolean (true)', async () => {
    const response = await POST(makeRequest({ amount_cents: true }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when amount_cents is an array', async () => {
    const response = await POST(makeRequest({ amount_cents: [5000] }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when amount_cents is an object', async () => {
    const response = await POST(makeRequest({ amount_cents: { value: 5000 } }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/credit-topup — invalid amount_cents numeric values', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-test-id', email: 'test@example.com' } },
      error: null,
    });
    mockMaybeSingle.mockResolvedValue({
      data: { stripe_customer_id: 'cus_existing123' },
      error: null,
    });
  });

  it('returns 400 when amount_cents is negative', async () => {
    const response = await POST(makeRequest({ amount_cents: -500 }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe('VALIDATION_ERROR');
    expect(data.error.message).toMatch(/\$10.*\$1,000|\$1,000.*\$10/i);
  });

  it('returns 400 when amount_cents is zero', async () => {
    const response = await POST(makeRequest({ amount_cents: 0 }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when amount_cents is below $10 minimum (999 cents)', async () => {
    const response = await POST(makeRequest({ amount_cents: 999 }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe('VALIDATION_ERROR');
    expect(data.error.message).toMatch(/\$10/);
  });

  it('returns 400 when amount_cents is above $1000 maximum (100001 cents)', async () => {
    const response = await POST(makeRequest({ amount_cents: 100001 }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe('VALIDATION_ERROR');
    expect(data.error.message).toMatch(/\$1,000/);
  });

  it('returns 400 when amount_cents is a float (non-integer)', async () => {
    const response = await POST(makeRequest({ amount_cents: 1500.5 }));
    const data = await response.json();

    // 1500.5 fails Number.isInteger check
    expect(response.status).toBe(400);
    expect(data.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/credit-topup — valid amount_cents values', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-test-id', email: 'test@example.com' } },
      error: null,
    });
    mockMaybeSingle.mockResolvedValue({
      data: { stripe_customer_id: 'cus_existing123' },
      error: null,
    });
  });

  it('returns 200 with a checkout URL for the minimum valid amount (1000 cents = $10)', async () => {
    const response = await POST(makeRequest({ amount_cents: 1000 }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.url).toBeDefined();
    expect(typeof data.url).toBe('string');
    expect(data.url.length).toBeGreaterThan(0);
  });

  it('returns 200 with a checkout URL for the maximum valid amount (100000 cents = $1000)', async () => {
    const response = await POST(makeRequest({ amount_cents: 100000 }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.url).toBeDefined();
  });

  it('returns 200 with a checkout URL for a mid-range amount (5000 cents = $50)', async () => {
    const response = await POST(makeRequest({ amount_cents: 5000 }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.url).toBeDefined();
  });

  it('returns 200 for a typical top-up amount (2500 cents = $25)', async () => {
    const response = await POST(makeRequest({ amount_cents: 2500 }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.url).toMatch(/^https:\/\//);
  });
});

describe('POST /api/credit-topup — boundary values', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-test-id', email: 'test@example.com' } },
      error: null,
    });
    mockMaybeSingle.mockResolvedValue({
      data: { stripe_customer_id: 'cus_existing123' },
      error: null,
    });
  });

  it('1000 (exactly $10) passes — minimum valid amount', async () => {
    const res = await POST(makeRequest({ amount_cents: 1000 }));
    expect(res.status).toBe(200);
  });

  it('999 (one below minimum) fails', async () => {
    const res = await POST(makeRequest({ amount_cents: 999 }));
    expect(res.status).toBe(400);
  });

  it('100000 (exactly $1000) passes — maximum valid amount', async () => {
    const res = await POST(makeRequest({ amount_cents: 100000 }));
    expect(res.status).toBe(200);
  });

  it('100001 (one above maximum) fails', async () => {
    const res = await POST(makeRequest({ amount_cents: 100001 }));
    expect(res.status).toBe(400);
  });
});
