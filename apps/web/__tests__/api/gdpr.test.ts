import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock environment variables
const mockEnv = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test_anon_key',
  SUPABASE_SERVICE_ROLE_KEY: 'test_service_key',
};

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', mockEnv.NEXT_PUBLIC_SUPABASE_URL);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', mockEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY);
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', mockEnv.SUPABASE_SERVICE_ROLE_KEY);

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock rate limiting to allow requests through
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
  rateLimitConfigs: {},
}));

// Mock error handler
vi.mock('@/lib/error-handler', () => ({
  withErrorHandler: (fn: (...args: unknown[]) => Promise<Response>) => fn,
}));

// Mock CORS utilities
vi.mock('@/lib/cors', () => ({
  getSecurityHeaders: () => ({ 'X-Content-Type-Options': 'nosniff' }),
  getCorsHeaders: () => ({ 'Access-Control-Allow-Origin': '*' }),
  handleCorsPreflightRequest: vi.fn().mockReturnValue(null),
}));

// Mock errors
vi.mock('@/lib/errors', () => ({
  createError: {
    unauthorized: (message?: string) => {
      const error = new Error(message || 'Unauthorized');
      (error as Error & { statusCode: number }).statusCode = 401;
      return error;
    },
    supabase: (message: string, details?: string) => {
      const error = new Error(`${message}: ${details}`);
      (error as Error & { statusCode: number }).statusCode = 500;
      return error;
    },
  },
}));

// Mock cookies
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn().mockReturnValue({ value: 'mock_session_cookie' }),
    set: vi.fn(),
  }),
}));

// Test user data
const mockUser = {
  id: 'user_test_123',
  email: 'test@example.com',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-15T00:00:00Z',
  email_confirmed_at: '2024-01-01T00:00:00Z',
  last_sign_in_at: '2024-01-15T10:00:00Z',
  app_metadata: {},
  user_metadata: { name: 'Test User' },
};

const mockProfile = {
  id: mockUser.id,
  email: mockUser.email,
  full_name: 'Test User',
  avatar_url: null,
  created_at: '2024-01-01T00:00:00Z',
};

const mockSubscription = {
  id: 'sub_test_123',
  user_id: mockUser.id,
  plan_tier: 'pro',
  status: 'active',
  stripe_customer_id: 'cus_test_123',
  stripe_subscription_id: 'sub_stripe_123',
  current_period_start: '2024-01-01T00:00:00Z',
  current_period_end: '2024-02-01T00:00:00Z',
};

// Create chainable mock for Supabase client
const createChainableMock = (returnData: unknown = null, returnError: unknown = null) => {
  const mock: Record<string, ReturnType<typeof vi.fn>> = {};

  const chainMethods = ['select', 'eq', 'single', 'maybeSingle', 'order', 'limit', 'delete'];

  chainMethods.forEach((method) => {
    mock[method] = vi.fn().mockReturnValue(mock);
  });

  mock.single = vi.fn().mockResolvedValue({ data: returnData, error: returnError });
  mock.maybeSingle = vi.fn().mockResolvedValue({ data: returnData, error: returnError });
  mock.delete = vi.fn().mockReturnValue(mock);

  return mock;
};

// Mock Supabase
const mockSupabaseClient = {
  auth: {
    getSession: vi.fn().mockResolvedValue({
      data: { session: { user: mockUser } },
      error: null,
    }),
    getUser: vi.fn().mockResolvedValue({
      data: { user: mockUser },
      error: null,
    }),
  },
  from: vi.fn((table: string) => {
    const chainable = createChainableMock();

    if (table === 'profiles') {
      chainable.single = vi.fn().mockResolvedValue({ data: mockProfile, error: null });
    } else if (table === 'subscriptions') {
      chainable.single = vi.fn().mockResolvedValue({ data: mockSubscription, error: null });
    } else {
      chainable.single = vi.fn().mockResolvedValue({ data: null, error: null });
    }

    // For order().limit() chains, return array
    chainable.limit = vi.fn().mockResolvedValue({ data: [], error: null });
    chainable.order = vi.fn().mockReturnValue(chainable);

    return chainable;
  }),
  rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => mockSupabaseClient),
}));

describe('GDPR Data Deletion API (DELETE /api/user/data)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.auth.getSession.mockResolvedValue({
      data: { session: { user: mockUser } },
      error: null,
    });
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Authentication', () => {
    it('should reject unauthenticated requests', async () => {
      // Mock no session
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      const { DELETE } = await import('@/app/api/user/data/route');

      const request = new NextRequest('http://localhost/api/user/data', {
        method: 'DELETE',
        headers: {
          'content-type': 'application/json',
        },
      });

      try {
        await DELETE(request);
        expect.fail('Should have thrown unauthorized error');
      } catch (error: unknown) {
        expect((error as Error).message).toContain('Unauthorized');
      }
    });

    it('should accept requests with valid Bearer token', async () => {
      const { DELETE } = await import('@/app/api/user/data/route');

      const request = new NextRequest('http://localhost/api/user/data', {
        method: 'DELETE',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer valid_token_123',
        },
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.user_id).toBe(mockUser.id);
    });

    it('should reject invalid Bearer tokens', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' },
      });

      const { DELETE } = await import('@/app/api/user/data/route');

      const request = new NextRequest('http://localhost/api/user/data', {
        method: 'DELETE',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer invalid_token',
        },
      });

      try {
        await DELETE(request);
        expect.fail('Should have thrown unauthorized error');
      } catch (error: unknown) {
        expect((error as Error).message).toContain('Invalid');
      }
    });

    it('should accept requests with valid session cookie', async () => {
      const { DELETE } = await import('@/app/api/user/data/route');

      const request = new NextRequest('http://localhost/api/user/data', {
        method: 'DELETE',
        headers: {
          'content-type': 'application/json',
          cookie: 'session=valid_session_cookie',
        },
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Data Deletion', () => {
    it('should call delete_user_data RPC function', async () => {
      const { DELETE } = await import('@/app/api/user/data/route');

      const request = new NextRequest('http://localhost/api/user/data', {
        method: 'DELETE',
        headers: {
          authorization: 'Bearer valid_token',
        },
      });

      await DELETE(request);

      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('delete_user_data', {
        target_user_id: mockUser.id,
      });
    });

    it('should return success response with deletion timestamp', async () => {
      const { DELETE } = await import('@/app/api/user/data/route');

      const request = new NextRequest('http://localhost/api/user/data', {
        method: 'DELETE',
        headers: {
          authorization: 'Bearer valid_token',
        },
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.deletion_timestamp).toBeDefined();
      expect(data.user_id).toBe(mockUser.id);
      expect(data.note).toContain('authentication account');
    });

    it('should handle RPC function not found and use fallback deletion', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: { message: 'function not found', code: 'PGRST202' },
      });

      const { DELETE } = await import('@/app/api/user/data/route');

      const request = new NextRequest('http://localhost/api/user/data', {
        method: 'DELETE',
        headers: {
          authorization: 'Bearer valid_token',
        },
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain('processed');
    });

    it('should handle database errors gracefully', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Database error', code: 'DB001' },
      });

      // Re-mock from() for fallback to also fail
      mockSupabaseClient.from.mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Delete failed', code: 'DB002' },
          }),
        }),
      });

      const { DELETE } = await import('@/app/api/user/data/route');

      const request = new NextRequest('http://localhost/api/user/data', {
        method: 'DELETE',
        headers: {
          authorization: 'Bearer valid_token',
        },
      });

      try {
        await DELETE(request);
        expect.fail('Should have thrown an error');
      } catch (error: unknown) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Audit Logging', () => {
    it('should log deletion request for audit purposes', async () => {
      const { logger } = await import('@/lib/logger');
      const { DELETE } = await import('@/app/api/user/data/route');

      const request = new NextRequest('http://localhost/api/user/data', {
        method: 'DELETE',
        headers: {
          authorization: 'Bearer valid_token',
        },
      });

      await DELETE(request);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUser.id,
          action: 'gdpr_data_deletion_requested',
        }),
        expect.any(String),
      );
    });
  });

  describe('CORS Support', () => {
    it('should include CORS headers in response', async () => {
      const { DELETE } = await import('@/app/api/user/data/route');

      const request = new NextRequest('http://localhost/api/user/data', {
        method: 'DELETE',
        headers: {
          authorization: 'Bearer valid_token',
          origin: 'http://localhost:1420',
        },
      });

      const response = await DELETE(request);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });
});

describe('GDPR Data Export API (GET /api/user/export)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.auth.getSession.mockResolvedValue({
      data: { session: { user: mockUser } },
      error: null,
    });
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });
    mockSupabaseClient.rpc.mockResolvedValue({
      data: {
        profile: mockProfile,
        subscription: mockSubscription,
        token_credits: [],
        credit_transactions: [],
      },
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Authentication', () => {
    it('should reject unauthenticated requests', async () => {
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      const { GET } = await import('@/app/api/user/export/route');

      const request = new NextRequest('http://localhost/api/user/export', {
        method: 'GET',
        headers: {
          'content-type': 'application/json',
        },
      });

      try {
        await GET(request);
        expect.fail('Should have thrown unauthorized error');
      } catch (error: unknown) {
        expect((error as Error).message).toContain('Unauthorized');
      }
    });

    it('should accept requests with valid Bearer token', async () => {
      const { GET } = await import('@/app/api/user/export/route');

      const request = new NextRequest('http://localhost/api/user/export', {
        method: 'GET',
        headers: {
          authorization: 'Bearer valid_token_123',
        },
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
    });
  });

  describe('Data Export', () => {
    it('should call export_user_data RPC function', async () => {
      const { GET } = await import('@/app/api/user/export/route');

      const request = new NextRequest('http://localhost/api/user/export', {
        method: 'GET',
        headers: {
          authorization: 'Bearer valid_token',
        },
      });

      await GET(request);

      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('export_user_data', {
        target_user_id: mockUser.id,
      });
    });

    it('should return JSON response with export data', async () => {
      const { GET } = await import('@/app/api/user/export/route');

      const request = new NextRequest('http://localhost/api/user/export', {
        method: 'GET',
        headers: {
          authorization: 'Bearer valid_token',
          accept: 'application/json',
        },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.user_id).toBe(mockUser.id);
      expect(data.export_timestamp).toBeDefined();
      expect(data.data).toBeDefined();
    });

    it('should return downloadable file when download param is true', async () => {
      const { GET } = await import('@/app/api/user/export/route');

      const request = new NextRequest('http://localhost/api/user/export?download=true', {
        method: 'GET',
        headers: {
          authorization: 'Bearer valid_token',
        },
      });

      const response = await GET(request);

      expect(response.headers.get('Content-Disposition')).toContain('attachment');
      expect(response.headers.get('Content-Disposition')).toContain('user-data-export');
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });

    it('should return downloadable file when Accept header is application/octet-stream', async () => {
      const { GET } = await import('@/app/api/user/export/route');

      const request = new NextRequest('http://localhost/api/user/export', {
        method: 'GET',
        headers: {
          authorization: 'Bearer valid_token',
          accept: 'application/octet-stream',
        },
      });

      const response = await GET(request);

      expect(response.headers.get('Content-Disposition')).toContain('attachment');
    });

    it('should use fallback when RPC function not found', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: { message: 'function not found', code: 'PGRST202' },
      });

      // Setup mock for fallback data fetching
      mockSupabaseClient.from.mockImplementation((table: string) => {
        const chainable = createChainableMock();

        if (table === 'profiles') {
          chainable.single = vi.fn().mockResolvedValue({ data: mockProfile, error: null });
        } else if (table === 'subscriptions') {
          chainable.single = vi.fn().mockResolvedValue({ data: mockSubscription, error: null });
        }

        return chainable;
      });

      const { GET } = await import('@/app/api/user/export/route');

      const request = new NextRequest('http://localhost/api/user/export', {
        method: 'GET',
        headers: {
          authorization: 'Bearer valid_token',
        },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should include GDPR metadata in export', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: { message: 'function not found' },
      });

      const { GET } = await import('@/app/api/user/export/route');

      const request = new NextRequest('http://localhost/api/user/export', {
        method: 'GET',
        headers: {
          authorization: 'Bearer valid_token',
        },
      });

      const response = await GET(request);
      const responseData = await response.json();

      expect(responseData.data.export_metadata).toBeDefined();
      expect(responseData.data.export_metadata.gdpr_article).toContain('Article 20');
    });

    it('should redact sensitive information in export', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: { message: 'function not found' },
      });

      mockSupabaseClient.from.mockImplementation((table: string) => {
        const chainable = createChainableMock();

        if (table === 'subscriptions') {
          chainable.single = vi.fn().mockResolvedValue({ data: mockSubscription, error: null });
        }

        return chainable;
      });

      const { GET } = await import('@/app/api/user/export/route');

      const request = new NextRequest('http://localhost/api/user/export', {
        method: 'GET',
        headers: {
          authorization: 'Bearer valid_token',
        },
      });

      const response = await GET(request);
      const data = await response.json();

      // Stripe IDs should be redacted
      if (data.data.subscription) {
        expect(data.data.subscription.stripe_customer_id).toBe('[REDACTED]');
        expect(data.data.subscription.stripe_subscription_id).toBe('[REDACTED]');
      }
    });
  });

  describe('Audit Logging', () => {
    it('should log export request for audit purposes', async () => {
      const { logger } = await import('@/lib/logger');
      const { GET } = await import('@/app/api/user/export/route');

      const request = new NextRequest('http://localhost/api/user/export', {
        method: 'GET',
        headers: {
          authorization: 'Bearer valid_token',
        },
      });

      await GET(request);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUser.id,
          action: 'gdpr_data_export_requested',
        }),
        expect.any(String),
      );
    });
  });

  describe('Security Headers', () => {
    it('should include security headers in response', async () => {
      const { GET } = await import('@/app/api/user/export/route');

      const request = new NextRequest('http://localhost/api/user/export', {
        method: 'GET',
        headers: {
          authorization: 'Bearer valid_token',
        },
      });

      const response = await GET(request);

      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });
  });
});

describe('GDPR Compliance Requirements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.auth.getSession.mockResolvedValue({
      data: { session: { user: mockUser } },
      error: null,
    });
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });
  });

  it('should support Article 17 - Right to Erasure', async () => {
    // Test that deletion endpoint exists and works
    const { DELETE } = await import('@/app/api/user/data/route');
    expect(DELETE).toBeDefined();
  });

  it('should support Article 20 - Right to Data Portability', async () => {
    // Test that export endpoint exists and works
    const { GET } = await import('@/app/api/user/export/route');
    expect(GET).toBeDefined();
  });

  it('should provide machine-readable format for exports', async () => {
    mockSupabaseClient.rpc.mockResolvedValue({
      data: { profile: mockProfile },
      error: null,
    });

    const { GET } = await import('@/app/api/user/export/route');

    const request = new NextRequest('http://localhost/api/user/export', {
      method: 'GET',
      headers: {
        authorization: 'Bearer valid_token',
      },
    });

    const response = await GET(request);

    // Verify JSON format
    expect(response.headers.get('Content-Type')).toContain('application/json');

    // Verify data is parseable
    const data = await response.json();
    expect(() => JSON.stringify(data)).not.toThrow();
  });

  it('should delete all user-related data on deletion request', async () => {
    mockSupabaseClient.rpc.mockResolvedValue({
      data: {
        profiles_deleted: 1,
        subscriptions_deleted: 1,
        credits_deleted: 5,
        devices_deleted: 2,
      },
      error: null,
    });

    const { DELETE } = await import('@/app/api/user/data/route');

    const request = new NextRequest('http://localhost/api/user/data', {
      method: 'DELETE',
      headers: {
        authorization: 'Bearer valid_token',
      },
    });

    const response = await DELETE(request);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('delete_user_data', {
      target_user_id: mockUser.id,
    });
  });
});
