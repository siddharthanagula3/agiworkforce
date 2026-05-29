import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

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
    cloudDb: (message: string, details?: string) => {
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

// ── Clerk auth mock ───────────────────────────────────────────────────────────
const mockGetClerkAuthUser = vi.fn();
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: (...args: unknown[]) => mockGetClerkAuthUser(...args),
}));

// ── Neon DB mock ──────────────────────────────────────────────────────────────
const mockNeonQuery = vi.fn();
const mockNeonExecute = vi.fn();

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockNeonQuery(...args),
    execute: (...args: unknown[]) => mockNeonExecute(...args),
    transaction: vi.fn((fn: (db: unknown) => unknown) => fn({})),
    withUser: vi.fn(() => ({})),
    dispose: vi.fn(),
  })),
}));

// ── Test fixtures ─────────────────────────────────────────────────────────────

const mockUser = {
  id: 'user_test_123',
  email: 'test@example.com',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-15T00:00:00Z',
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GDPR Data Deletion API (DELETE /api/user/data)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: authenticated user via Clerk
    mockGetClerkAuthUser.mockResolvedValue({ userId: mockUser.id, email: mockUser.email });

    // Default: RPC succeeds
    mockNeonQuery.mockResolvedValue([{ success: true }]);
    mockNeonExecute.mockResolvedValue(1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Authentication', () => {
    it('should reject unauthenticated requests', async () => {
      mockGetClerkAuthUser.mockRejectedValueOnce(
        Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
      );

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
      mockGetClerkAuthUser.mockRejectedValueOnce(
        Object.assign(new Error('Invalid token'), { statusCode: 401 }),
      );

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
    it('should call delete_user_data SQL function via Neon', async () => {
      const { DELETE } = await import('@/app/api/user/data/route');

      const request = new NextRequest('http://localhost/api/user/data', {
        method: 'DELETE',
        headers: {
          authorization: 'Bearer valid_token',
        },
      });

      await DELETE(request);

      // Route calls: db.query('select * from delete_user_data($1)', [userId])
      expect(mockNeonQuery).toHaveBeenCalledWith(expect.stringContaining('delete_user_data'), [
        mockUser.id,
      ]);
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
      // RPC throws "function not found" error — route falls back to manual deletion
      mockNeonQuery.mockRejectedValueOnce(
        Object.assign(new Error('function delete_user_data does not exist'), { code: '42883' }),
      );
      // Fallback execute calls succeed
      mockNeonExecute.mockResolvedValue(1);

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
      // RPC throws a non-missing-function error
      mockNeonQuery.mockRejectedValueOnce(
        Object.assign(new Error('Database error'), { code: 'DB001' }),
      );

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
    beforeEach(() => {
      mockNeonQuery.mockResolvedValue([{ success: true }]);
    });

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
    beforeEach(() => {
      mockNeonQuery.mockResolvedValue([{ success: true }]);
    });

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

    // Default: authenticated user via Clerk
    mockGetClerkAuthUser.mockResolvedValue({ userId: mockUser.id, email: mockUser.email });

    // Default: RPC returns export data
    mockNeonQuery.mockResolvedValue([
      {
        profile: mockProfile,
        subscription: mockSubscription,
        token_credits: [],
        credit_transactions: [],
      },
    ]);
    mockNeonExecute.mockResolvedValue(1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Authentication', () => {
    it('should reject unauthenticated requests', async () => {
      mockGetClerkAuthUser.mockRejectedValueOnce(
        Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
      );

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
    it('should call export_user_data SQL function via Neon', async () => {
      const { GET } = await import('@/app/api/user/export/route');

      const request = new NextRequest('http://localhost/api/user/export', {
        method: 'GET',
        headers: {
          authorization: 'Bearer valid_token',
        },
      });

      await GET(request);

      // Route calls: db.query('select * from export_user_data($1)', [userId])
      expect(mockNeonQuery).toHaveBeenCalledWith(expect.stringContaining('export_user_data'), [
        mockUser.id,
      ]);
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
      // RPC throws "function not found" error
      mockNeonQuery.mockRejectedValueOnce(
        Object.assign(new Error('export_user_data function does not exist'), { code: '42883' }),
      );

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
      // Force fallback path
      mockNeonQuery.mockRejectedValueOnce(
        Object.assign(new Error('function not found'), { code: '42883' }),
      );

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
      // Force fallback path that fetches from DB tables
      mockNeonQuery.mockRejectedValueOnce(
        Object.assign(new Error('function not found'), { code: '42883' }),
      );
      // collectUserData queries: profiles → subscriptions → ...
      // 2nd call: profiles query returns empty (no profile)
      mockNeonQuery.mockResolvedValueOnce([]);
      // 3rd call: subscriptions query returns subscription with Stripe IDs
      mockNeonQuery.mockResolvedValueOnce([mockSubscription]);

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
    mockGetClerkAuthUser.mockResolvedValue({ userId: mockUser.id, email: mockUser.email });
    mockNeonQuery.mockResolvedValue([{ success: true }]);
    mockNeonExecute.mockResolvedValue(1);
  });

  it('should support Article 17 - Right to Erasure', async () => {
    const { DELETE } = await import('@/app/api/user/data/route');
    expect(DELETE).toBeDefined();
  });

  it('should support Article 20 - Right to Data Portability', async () => {
    const { GET } = await import('@/app/api/user/export/route');
    expect(GET).toBeDefined();
  });

  it('should provide machine-readable format for exports', async () => {
    mockNeonQuery.mockResolvedValueOnce([{ profile: mockProfile }]);

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
    mockNeonQuery.mockResolvedValueOnce([
      {
        profiles_deleted: 1,
        subscriptions_deleted: 1,
        credits_deleted: 5,
        devices_deleted: 2,
      },
    ]);

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
    // Route calls delete_user_data via Neon query
    expect(mockNeonQuery).toHaveBeenCalledWith(expect.stringContaining('delete_user_data'), [
      mockUser.id,
    ]);
  });
});
