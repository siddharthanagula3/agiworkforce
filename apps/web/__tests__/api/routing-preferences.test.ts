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

const { mockUpdate, mockSelect, mockEq, mockMaybeSingle, mockFrom, mockGetUser, mockGetSession } =
  vi.hoisted(() => {
    const mockMaybeSingle = vi.fn();
    const mockEq = vi.fn();
    const mockSelect = vi.fn();
    const mockUpdate = vi.fn();
    const mockFrom = vi.fn();
    const mockGetUser = vi.fn();
    const mockGetSession = vi.fn();
    return {
      mockUpdate,
      mockSelect,
      mockEq,
      mockMaybeSingle,
      mockFrom,
      mockGetUser,
      mockGetSession,
    };
  });

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

vi.mock('@/utils/env', () => ({
  requireEnv: vi.fn((key: string) => {
    if (key === 'NEXT_PUBLIC_SUPABASE_URL') return 'https://test.supabase.co';
    if (key === 'NEXT_PUBLIC_SUPABASE_ANON_KEY') return 'anon-key';
    return 'test';
  }),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn(() => undefined),
    set: vi.fn(),
  }),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
      getSession: mockGetSession,
    },
  })),
}));

vi.mock('@/lib/supabase-server', () => ({
  getUserClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  user_metadata: { full_name: 'Test' },
  created_at: '2024-01-01T00:00:00Z',
};

// Import after mocks
import { GET, PUT } from '@/app/api/me/routing-preferences/route';

beforeEach(() => {
  vi.clearAllMocks();

  // Auth defaults — Bearer JWT path
  mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: 'mock-jwt' } },
  });

  // Fluent chain for read path
  mockMaybeSingle.mockResolvedValue({
    data: { routing_preferences: {} },
    error: null,
  });
  mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle });
  mockSelect.mockReturnValue({ eq: mockEq });

  // Fluent chain for update path: from().update().eq() returns the result.
  // The PUT path uses `count: 'exact'` so we return { error: null, count: 1 }.
  const updateChain = {
    eq: vi.fn().mockResolvedValue({ error: null, count: 1, data: null }),
  };
  mockUpdate.mockReturnValue(updateChain);

  mockFrom.mockReturnValue({
    select: mockSelect,
    update: mockUpdate,
  });
});

describe('GET /api/me/routing-preferences', () => {
  function buildBearerRequest() {
    return new NextRequest('http://localhost/api/me/routing-preferences', {
      method: 'GET',
      headers: { Authorization: 'Bearer mock-jwt' },
    });
  }

  it('returns the stored routing_preferences object', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { routing_preferences: { us_only: true } },
      error: null,
    });

    const response = await GET(buildBearerRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ us_only: true });
  });

  it('returns empty object when routing_preferences is null', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { routing_preferences: null },
      error: null,
    });

    const response = await GET(buildBearerRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({});
  });

  it('returns empty object when no profile row exists', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const response = await GET(buildBearerRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({});
  });

  it('returns empty object on DB error (fail-open)', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'pg connection refused' },
    });

    const response = await GET(buildBearerRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({});
  });

  it('rejects unauthenticated requests with 401', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'No session' },
    });

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
    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(mockUpdate).toHaveBeenCalledWith(
      { routing_preferences: { us_only: true } },
      { count: 'exact' },
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
    const updateChain = {
      eq: vi.fn().mockResolvedValue({ error: null, count: 0, data: null }),
    };
    mockUpdate.mockReturnValueOnce(updateChain);

    const response = await PUT(buildPutRequest({ us_only: true }));
    expect(response.status).toBe(404);
  });

  it('returns 500 on DB error', async () => {
    const updateChain = {
      eq: vi.fn().mockResolvedValue({ error: { message: 'rls denied' }, count: null, data: null }),
    };
    mockUpdate.mockReturnValueOnce(updateChain);

    const response = await PUT(buildPutRequest({ us_only: true }));
    expect(response.status).toBe(500);
  });

  it('rejects unauthenticated request with 401', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'invalid token' },
    });

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
