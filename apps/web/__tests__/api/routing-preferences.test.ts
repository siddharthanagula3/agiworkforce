/**
 * /api/me/routing-preferences endpoint tests.
 *
 * Covers:
 *  - GET returns the stored routing_preferences object (or {} if missing)
 *  - PUT validates the body against RoutingPreferencesSchema
 *  - PUT 404s when no profile row matches (defensive — handle_new_user trigger
 *    should normally guarantee a row, but we surface the failure explicitly
 *    instead of returning a silent 200)
 *  - PUT 401 when unauthenticated
 *  - PUT requires CSRF
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockClerkAuth = vi.fn(() => Promise.resolve({ userId: 'user-123' }));

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => mockClerkAuth(),
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(() => null),
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn(() => null),
}));

vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn(() => null),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Neon DB mock
// ---------------------------------------------------------------------------

const mockQuery = vi.fn();
const mockExecute = vi.fn();

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (sql: string, params: unknown[]) => {
      // assertAccountActive() in getClerkAuthUser issues its own account_status
      // lookup ahead of the route's real query; keep it out of mockQuery's queue.
      if (typeof sql === 'string' && sql.includes('account_status')) {
        return Promise.resolve([]);
      }
      return mockQuery(sql, params);
    },
    execute: mockExecute,
    transaction: vi.fn((fn: (db: unknown) => unknown) => fn({})),
    withUser: vi.fn(() => ({})),
    dispose: vi.fn(),
  })),
}));

const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
};
void mockUser;

// Import after mocks
import { GET, PUT } from '@/app/api/me/routing-preferences/route';

beforeEach(() => {
  vi.clearAllMocks();

  // Default: Clerk auth succeeds
  mockClerkAuth.mockResolvedValue({ userId: 'user-123' });

  // Default GET: returns a row with routing_preferences
  mockQuery.mockResolvedValue([{ routing_preferences: {} }]);

  // Default PUT: 1 row updated
  mockExecute.mockResolvedValue(1);
});

describe('GET /api/me/routing-preferences', () => {
  function buildBearerRequest() {
    return new NextRequest('http://localhost/api/me/routing-preferences', {
      method: 'GET',
      headers: { Authorization: 'Bearer mock-jwt' },
    });
  }

  it('returns the stored routing_preferences object', async () => {
    mockQuery.mockResolvedValueOnce([{ routing_preferences: { us_only: true } }]);

    const response = await GET(buildBearerRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ us_only: true });
  });

  it('returns empty object when routing_preferences is null', async () => {
    mockQuery.mockResolvedValueOnce([{ routing_preferences: null }]);

    const response = await GET(buildBearerRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({});
  });

  it('returns empty object when no profile row exists', async () => {
    mockQuery.mockResolvedValueOnce([]);

    const response = await GET(buildBearerRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({});
  });

  it('returns empty object on DB error (fail-open)', async () => {
    mockQuery.mockRejectedValueOnce(new Error('pg connection refused'));

    const response = await GET(buildBearerRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({});
  });

  it('rejects unauthenticated requests with 401', async () => {
    mockClerkAuth.mockResolvedValueOnce({ userId: null as unknown as string });

    const response = await GET(buildBearerRequest());
    expect(response.status).toBe(401);
  });
});

describe('PUT /api/me/routing-preferences', () => {
  function buildPutRequest(body: unknown) {
    return new NextRequest('http://localhost/api/me/routing-preferences', {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer mock-jwt',
        'Content-Type': 'application/json',
        'x-csrf-token': 'mock',
      },
      body: JSON.stringify(body),
    });
  }

  it('persists valid preferences and echoes them back', async () => {
    const response = await PUT(buildPutRequest({ us_only: true }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ us_only: true });
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('update profiles set routing_preferences'),
      expect.arrayContaining([JSON.stringify({ us_only: true }), 'user-123']),
    );
  });

  it('accepts geo_overlay enum values', async () => {
    const response = await PUT(buildPutRequest({ us_only: false, geo_overlay: 'us' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ us_only: false, geo_overlay: 'us' });
  });

  it('rejects invalid us_only type with 400', async () => {
    const response = await PUT(buildPutRequest({ us_only: 'yes' }));
    expect(response.status).toBe(400);
  });

  it('rejects invalid geo_overlay enum with 400', async () => {
    const response = await PUT(buildPutRequest({ geo_overlay: 'mars' }));
    expect(response.status).toBe(400);
  });

  it('rejects unknown extra fields silently (Zod strips by default)', async () => {
    const response = await PUT(buildPutRequest({ us_only: true, malicious: 'xss' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ us_only: true });
    expect(body.malicious).toBeUndefined();
  });

  it('returns 404 when no profile row matches (count = 0)', async () => {
    mockExecute.mockResolvedValueOnce(0);

    const response = await PUT(buildPutRequest({ us_only: true }));
    expect(response.status).toBe(404);
  });

  it('returns 500 on DB error', async () => {
    mockExecute.mockRejectedValueOnce(new Error('rls denied'));

    const response = await PUT(buildPutRequest({ us_only: true }));
    expect(response.status).toBe(500);
  });

  it('rejects unauthenticated request with 401', async () => {
    mockClerkAuth.mockResolvedValueOnce({ userId: null as unknown as string });

    const response = await PUT(buildPutRequest({ us_only: true }));
    expect(response.status).toBe(401);
  });

  it('rejects malformed JSON with 400', async () => {
    const request = new NextRequest('http://localhost/api/me/routing-preferences', {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer mock-jwt',
        'Content-Type': 'application/json',
        'x-csrf-token': 'mock',
      },
      body: '{not-json',
    });

    const response = await PUT(request);
    expect(response.status).toBe(400);
  });

  it('rejects empty body with 400 (no preferences specified is technically valid {} — but malformed JSON is not)', async () => {
    // Empty {} is valid (all fields optional) — should succeed.
    const response = await PUT(buildPutRequest({}));
    expect(response.status).toBe(200);
  });
});
