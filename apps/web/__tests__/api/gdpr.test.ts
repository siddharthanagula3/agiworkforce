import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
  rateLimitConfigs: {},
}));

vi.mock('@/lib/error-handler', () => ({
  withErrorHandler: (fn: (...args: unknown[]) => Promise<Response>) => fn,
}));

vi.mock('@/lib/cors', () => ({
  getSecurityHeaders: () => ({ 'X-Content-Type-Options': 'nosniff' }),
  getCorsHeaders: () => ({ 'Access-Control-Allow-Origin': '*' }),
  handleCorsPreflightRequest: vi.fn().mockReturnValue(null),
  withCorsRoute: (handler: (...args: unknown[]) => unknown) => handler,
}));

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

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn().mockReturnValue({ value: 'mock_session_cookie' }),
    set: vi.fn(),
  }),
}));

const mockGetClerkAuthUser = vi.fn();
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: (...args: unknown[]) => mockGetClerkAuthUser(...args),
}));

const mockGetManagedUsageSummary = vi.fn();
vi.mock('@/lib/services/managed-usage-summary-service', () => ({
  getManagedUsageSummary: (...args: unknown[]) => mockGetManagedUsageSummary(...args),
}));

const mockListUserBillingInvoices = vi.fn();
vi.mock('@/lib/services/billing-invoice-service', () => ({
  listUserBillingInvoices: (...args: unknown[]) => mockListUserBillingInvoices(...args),
}));

const mockNeonQuery = vi.fn();
const mockNeonExecute = vi.fn();

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockNeonQuery(...args),
    execute: (...args: unknown[]) => mockNeonExecute(...args),
    transaction: vi.fn((fn: (db: unknown) => unknown) =>
      fn({
        query: (...args: unknown[]) => mockNeonQuery(...args),
        execute: (...args: unknown[]) => mockNeonExecute(...args),
      }),
    ),
    withUser: vi.fn(() => ({})),
    dispose: vi.fn(),
  })),
}));

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

describe('GDPR Data Deletion API (DELETE /api/user/data)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetClerkAuthUser.mockResolvedValue({ userId: mockUser.id, email: mockUser.email });

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
      mockNeonQuery.mockRejectedValueOnce(
        Object.assign(new Error('function delete_user_data does not exist'), { code: '42883' }),
      );
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

    it('does not schedule auth-account purge when an active video blocks data-only erasure', async () => {
      mockNeonQuery.mockImplementation(async (sql: string) => {
        if (sql.includes("to_regclass('public.video_generation_jobs')")) {
          return [{ provisioned: true }];
        }
        if (
          sql.includes('update public.profiles') &&
          sql.includes('video_generation_erasure_fence_token')
        ) {
          return [{ id: mockUser.id }];
        }
        if (sql.includes('from public.video_generation_jobs')) {
          return [{ has_blocking: true }];
        }
        return [];
      });

      const { DELETE } = await import('@/app/api/user/data/route');
      const response = await DELETE(
        new NextRequest('http://localhost/api/user/data', {
          method: 'DELETE',
          headers: { authorization: 'Bearer valid_token' },
        }),
      );

      expect(response.status).toBe(500);
      const sql = mockNeonQuery.mock.calls.map((call) => String(call[0]));
      expect(sql.some((statement) => statement.includes('delete_user_data'))).toBe(false);
      expect(sql.some((statement) => /set deletion_scheduled_for/iu.test(statement))).toBe(false);
      expect(
        mockNeonExecute.mock.calls.some((call) =>
          String(call[0]).includes('video_generation_erasure_fence_token = null'),
        ),
      ).toBe(true);
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

    mockGetClerkAuthUser.mockResolvedValue({ userId: mockUser.id, email: mockUser.email });

    mockNeonQuery.mockResolvedValue([]);
    mockGetManagedUsageSummary.mockResolvedValue({
      plan_tier: 'pro',
      usage_percentage: 25,
      usage_reset_at: '2024-02-01T00:00:00.000Z',
      has_usage_remaining: true,
      period_start: '2024-01-01T00:00:00.000Z',
      period_end: '2024-02-01T00:00:00.000Z',
      subscription_status: 'active',
      session_usage_percentage: 10,
      session_reset_at: '2024-01-01T05:00:00.000Z',
      weekly_usage_percentage: 20,
      weekly_reset_at: '2024-01-08T00:00:00.000Z',
      flagship_weekly_usage_percentage: 5,
      flagship_weekly_reset_at: '2024-01-08T00:00:00.000Z',
    });
    mockListUserBillingInvoices.mockResolvedValue([]);
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
    it('never exports private managed-usage ledgers or their internal amount fields', async () => {
      mockNeonQuery.mockImplementation((sql: unknown) => {
        const statement = String(sql);
        if (statement.includes('from profiles')) {
          return Promise.resolve([
            {
              id: mockUser.id,
              email: mockUser.email,
              display_name: 'Test User',
              avatar_url: null,
              created_at: mockUser.created_at,
              updated_at: mockUser.updated_at,
              stripe_customer_id: 'cus_private',
              routing_preferences: { provider_cost_microusd: 45_600 },
            },
          ]);
        }
        if (statement.includes('from subscriptions')) {
          return Promise.resolve([
            {
              ...mockSubscription,
              cancel_at_period_end: false,
              canceled_at: null,
              created_at: mockUser.created_at,
              updated_at: mockUser.updated_at,
              credits_allocated_cents: 30_000,
              provider_cost_microusd: 45_600,
            },
          ]);
        }
        if (statement.includes('from credit_transactions')) {
          return Promise.resolve([
            {
              id: 'topup_123',
              created_at: '2024-01-10T00:00:00Z',
              amount_cents: 123,
              metadata: { input_cost_usd: 0.01, output_cost_usd: 0.02 },
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const { GET } = await import('@/app/api/user/export/route');
      const response = await GET(
        new NextRequest('http://localhost/api/user/export', {
          method: 'GET',
          headers: { authorization: 'Bearer valid_token' },
        }),
      );
      const serialized = JSON.stringify(await response.json());

      expect(serialized).not.toMatch(
        /token_credits|credit_transactions|credit_accounts|amount_cents|credits_(?:allocated|used|remaining)_cents|microusd|provider_cost|input_cost|output_cost/i,
      );
      expect(serialized).toContain('top_up_purchases');
      expect(mockNeonQuery).not.toHaveBeenCalledWith(
        expect.stringMatching(/export_user_data|token_credits/i),
        expect.anything(),
      );
      const statements = mockNeonQuery.mock.calls.map(([sql]) => String(sql));
      expect(statements).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/select\s+\*/i)]),
      );
      expect(statements.find((sql) => sql.includes('from credit_transactions'))).toMatch(
        /select id, created_at[\s\S]*transaction_type = 'purchase'/,
      );
    });

    it('builds the export without calling the broad export_user_data function', async () => {
      const { GET } = await import('@/app/api/user/export/route');

      const request = new NextRequest('http://localhost/api/user/export', {
        method: 'GET',
        headers: {
          authorization: 'Bearer valid_token',
        },
      });

      await GET(request);

      expect(mockNeonQuery).not.toHaveBeenCalledWith(
        expect.stringContaining('export_user_data'),
        expect.anything(),
      );
      expect(mockGetManagedUsageSummary).toHaveBeenCalledWith(expect.anything(), mockUser.id);
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

    it('includes user-owned Cloud content and scopes every child collection through its owner', async () => {
      mockNeonQuery.mockImplementation((sql: unknown) => {
        const statement = String(sql);
        if (statement.includes('from web_conversations') && !statement.includes('inner join')) {
          return Promise.resolve([
            {
              id: 'conversation_1',
              title: 'Export me',
              model: 'fixture-conversation-model',
              project_id: 'project_1',
              pinned: true,
              created_at: mockUser.created_at,
              updated_at: mockUser.updated_at,
              deleted_at: null,
            },
          ]);
        }
        if (statement.includes('from web_messages m')) {
          return Promise.resolve([
            {
              id: 'message_1',
              conversation_id: 'conversation_1',
              role: 'user',
              content: 'My portable chat text',
              model: null,
              provider: null,
              created_at: mockUser.created_at,
            },
          ]);
        }
        if (statement.includes('from user_projects') && !statement.includes('inner join')) {
          return Promise.resolve([
            {
              id: 'project_1',
              name: 'Portable project',
              description: null,
              instructions: 'Use my preferred format',
              color: null,
              is_archived: false,
              created_at: mockUser.created_at,
              updated_at: mockUser.updated_at,
              deleted_at: null,
            },
          ]);
        }
        if (statement.includes('from project_knowledge_files f')) {
          return Promise.resolve([
            {
              id: 'file_1',
              project_id: 'project_1',
              file_name: 'notes.txt',
              mime_type: 'text/plain',
              byte_count: 42,
              checksum_sha256: null,
              summary: 'User notes',
              source_surface: 'web',
              created_at: mockUser.created_at,
              updated_at: mockUser.updated_at,
            },
          ]);
        }
        if (statement.includes('from user_memories')) {
          return Promise.resolve([
            {
              id: 'memory_1',
              content: 'Prefers concise answers',
              category: 'preference',
              source: 'user',
              is_deleted: false,
              created_at: mockUser.created_at,
              updated_at: mockUser.updated_at,
            },
          ]);
        }
        if (statement.includes('from web_artifacts') && !statement.includes('inner join')) {
          return Promise.resolve([
            {
              id: 'artifact_1',
              conversation_id: 'conversation_1',
              message_id: 'message_1',
              title: 'Portable artifact',
              artifact_type: 'document',
              language: null,
              content: 'Artifact body',
              current_version: 1,
              pinned: false,
              tags: ['draft'],
              created_at: mockUser.created_at,
              updated_at: mockUser.updated_at,
              deleted_at: null,
            },
          ]);
        }
        if (statement.includes('from web_artifact_versions v')) {
          return Promise.resolve([
            {
              artifact_id: 'artifact_1',
              version: 1,
              content: 'Artifact body',
              change_description: null,
              content_hash: null,
              created_at: mockUser.created_at,
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const { GET } = await import('@/app/api/user/export/route');
      const response = await GET(
        new NextRequest('http://localhost/api/user/export', {
          method: 'GET',
          headers: { authorization: 'Bearer valid_token' },
        }),
      );
      const body = await response.json();

      expect(body.data.conversations[0].title).toBe('Export me');
      expect(body.data.messages[0].content).toBe('My portable chat text');
      expect(body.data.projects[0].name).toBe('Portable project');
      expect(body.data.project_knowledge_files[0].file_name).toBe('notes.txt');
      expect(body.data.memories[0].content).toBe('Prefers concise answers');
      expect(body.data.artifacts[0].content).toBe('Artifact body');
      expect(body.data.artifact_versions[0].artifact_id).toBe('artifact_1');

      const statements = mockNeonQuery.mock.calls.map(([sql]) => String(sql));
      expect(statements.find((sql) => sql.includes('from web_messages m'))).toMatch(
        /inner join web_conversations c[\s\S]*where c\.user_id = \$1/,
      );
      expect(statements.find((sql) => sql.includes('from project_knowledge_files f'))).toMatch(
        /inner join user_projects p[\s\S]*where p\.user_id = \$1/,
      );
      expect(statements.find((sql) => sql.includes('from web_artifact_versions v'))).toMatch(
        /inner join web_artifacts a[\s\S]*where a\.user_id = \$1/,
      );
      expect(
        mockNeonQuery.mock.calls
          .filter(([sql]) =>
            /web_conversations|web_messages|user_projects|project_knowledge_files|user_memories|web_artifacts|web_artifact_versions/.test(
              String(sql),
            ),
          )
          .every(([, values]) => JSON.stringify(values) === JSON.stringify([mockUser.id])),
      ).toBe(true);
    });

    it('includes the user-owned billing invoice collection without internal usage ledgers', async () => {
      const { GET } = await import('@/app/api/user/export/route');
      const response = await GET(
        new NextRequest('http://localhost/api/user/export', {
          method: 'GET',
          headers: { authorization: 'Bearer valid_token' },
        }),
      );
      const data = await response.json();

      expect(data.data.billing_invoices).toEqual([]);
      expect(mockListUserBillingInvoices).toHaveBeenCalledWith(expect.anything(), mockUser.id);
      expect(JSON.stringify(data.data.billing_invoices)).not.toMatch(
        /credits_|token_|microusd|provider_cost|usage_cost/i,
      );
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

    it('continues when an optional export section is unavailable', async () => {
      mockNeonQuery.mockRejectedValueOnce(new Error('profiles table unavailable'));

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

    it('omits Stripe identifiers and secret device fields instead of redacting placeholders', async () => {
      mockNeonQuery.mockImplementation((sql: unknown) => {
        const statement = String(sql);
        if (statement.includes('from subscriptions')) {
          return Promise.resolve([
            {
              ...mockSubscription,
              cancel_at_period_end: false,
              canceled_at: null,
              created_at: mockUser.created_at,
              updated_at: mockUser.updated_at,
            },
          ]);
        }
        if (statement.includes('from device_authorization_codes')) {
          return Promise.resolve([
            {
              id: 'device_auth_1',
              device_id: 'device_1',
              device_name: 'MacBook',
              device_type: 'desktop',
              status: 'approved',
              expires_at: '2024-02-01T00:00:00Z',
              created_at: mockUser.created_at,
              updated_at: mockUser.updated_at,
              user_code: 'PRIVATE-CODE',
              access_token: 'private-access-token',
              refresh_token: 'private-refresh-token',
            },
          ]);
        }
        return Promise.resolve([]);
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

      expect(data.data.subscription).not.toHaveProperty('stripe_customer_id');
      expect(data.data.subscription).not.toHaveProperty('stripe_subscription_id');
      expect(data.data.device_authorizations[0]).not.toHaveProperty('user_code');
      expect(data.data.device_authorizations[0]).not.toHaveProperty('access_token');
      expect(data.data.device_authorizations[0]).not.toHaveProperty('refresh_token');
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

    expect(response.headers.get('Content-Type')).toContain('application/json');

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
    expect(mockNeonQuery).toHaveBeenCalledWith(expect.stringContaining('delete_user_data'), [
      mockUser.id,
    ]);
  });
});
