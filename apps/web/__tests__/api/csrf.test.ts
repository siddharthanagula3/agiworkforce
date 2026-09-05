import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: vi.fn(async () => null),
  resolveOrganizationMembershipId: vi.fn(async () => null),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/lib/error-handler', () => ({
  withErrorHandler:
    (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    (req: NextRequest, ctx: unknown) =>
      handler(req, ctx),
}));

const mockRequireCsrfToken = vi.fn();
vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: (...args: unknown[]) => mockRequireCsrfToken(...args),
  generateCsrfToken: vi.fn(() => 'valid-token'),
  verifyCsrfToken: vi.fn(() => true),
  getSessionIdFromRequest: vi.fn(() => Promise.resolve('session-123')),
}));

const mockGetClerkAuthUser = vi.fn();
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: (...args: unknown[]) => mockGetClerkAuthUser(...args),
}));

const mockMemoryNeonQuery = vi.fn();
const mockMemoryNeonExecute = vi.fn();
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockMemoryNeonQuery(...args),
    execute: (...args: unknown[]) => mockMemoryNeonExecute(...args),
    transaction: vi.fn(),
    withUser: vi.fn(),
    dispose: vi.fn(),
  })),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(() => undefined),
    set: vi.fn(),
    delete: vi.fn(),
  })),
}));

const mockNeonQuery = vi.fn();
const mockNeonExecute = vi.fn();
const mockRequireCurrentUserId = vi.fn();

vi.mock('@/lib/server/neon-chat', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/neon-chat')>()),
  normalizeMessageMetadata: (v: unknown) => v,
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: async (request: Request) => {
    if (new URL(request.url).pathname.startsWith('/api/memory/')) {
      const { userId } = await mockGetClerkAuthUser(request);
      return {
        db: {
          query: (...args: unknown[]) => mockMemoryNeonQuery(...args),
          execute: (...args: unknown[]) => mockMemoryNeonExecute(...args),
        },
        userId,
        organizationId: null,
      };
    }
    const userId = await mockRequireCurrentUserId(request);
    return {
      db: {
        query: (...args: unknown[]) => mockNeonQuery(...args),
        execute: (...args: unknown[]) => mockNeonExecute(...args),
      },
      userId,
      organizationId: null,
    };
  },
}));

import {
  PUT as memoryPUT,
  DELETE as memoryDELETE,
  GET as memoryGET,
} from '@/app/api/memory/[id]/route';
import {
  PUT as convPUT,
  DELETE as convDELETE,
  GET as convGET,
} from '@/app/api/chat/conversations/[id]/route';

function csrfBlockedResponse(): Response {
  return new Response(
    JSON.stringify({ error: 'Invalid or missing CSRF token', code: 'CSRF_VALIDATION_FAILED' }),
    { status: 403, headers: { 'Content-Type': 'application/json' } },
  );
}

function makeMemoryRequest(method: 'GET' | 'PUT' | 'DELETE', body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/memory/test-id', {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer valid-jwt-token',
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';

function makeConvRequest(method: 'GET' | 'PUT' | 'DELETE', body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/chat/conversations/${CONVERSATION_ID}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer valid-jwt-token',
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const routeContext = { params: Promise.resolve({ id: 'test-id' }) };
const convRouteContext = { params: Promise.resolve({ id: CONVERSATION_ID }) };

describe('CSRF protection on state-changing endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user-1', email: 'test@test.com' });

    mockMemoryNeonQuery.mockResolvedValue([
      {
        id: 'test-id',
        content: 'memory content',
        category: 'note',
        source: 'user',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);
    mockMemoryNeonExecute.mockResolvedValue(undefined);

    mockRequireCurrentUserId.mockResolvedValue('user-1');
    mockNeonQuery.mockResolvedValue([
      {
        id: CONVERSATION_ID,
        title: 'Test',
        model: 'auto',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);
    mockNeonExecute.mockResolvedValue(undefined);

    mockRequireCsrfToken.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('PUT /api/memory/[id]', () => {
    it('returns 403 when CSRF token is missing/invalid', async () => {
      mockRequireCsrfToken.mockResolvedValueOnce(csrfBlockedResponse());

      const response = await memoryPUT(
        makeMemoryRequest('PUT', { content: 'updated' }),
        routeContext,
      );

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.code).toBe('CSRF_VALIDATION_FAILED');
    });

    it('proceeds normally with valid CSRF token', async () => {
      mockRequireCsrfToken.mockResolvedValue(null);

      const response = await memoryPUT(
        makeMemoryRequest('PUT', { content: 'updated content' }),
        routeContext,
      );

      expect(response.status).not.toBe(403);
    });

    it('calls requireCsrfToken for PUT requests', async () => {
      mockRequireCsrfToken.mockResolvedValue(null);

      await memoryPUT(makeMemoryRequest('PUT', { content: 'test' }), routeContext);

      expect(mockRequireCsrfToken).toHaveBeenCalledOnce();
    });
  });

  describe('DELETE /api/memory/[id]', () => {
    it('returns 403 when CSRF token is missing/invalid', async () => {
      mockRequireCsrfToken.mockResolvedValueOnce(csrfBlockedResponse());

      const response = await memoryDELETE(makeMemoryRequest('DELETE'), routeContext);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.code).toBe('CSRF_VALIDATION_FAILED');
    });

    it('proceeds normally with valid CSRF token', async () => {
      mockRequireCsrfToken.mockResolvedValue(null);
      mockMemoryNeonExecute.mockResolvedValueOnce(undefined);

      const response = await memoryDELETE(makeMemoryRequest('DELETE'), routeContext);

      expect(response.status).not.toBe(403);
    });

    it('calls requireCsrfToken for DELETE requests', async () => {
      mockRequireCsrfToken.mockResolvedValue(null);

      await memoryDELETE(makeMemoryRequest('DELETE'), routeContext);

      expect(mockRequireCsrfToken).toHaveBeenCalledOnce();
    });
  });

  describe('GET /api/memory/[id], no CSRF required', () => {
    it('does NOT call requireCsrfToken for GET requests', async () => {
      await memoryGET(makeMemoryRequest('GET'), routeContext);

      expect(mockRequireCsrfToken).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/chat/conversations/[id]', () => {
    it('returns 403 when CSRF token is missing/invalid', async () => {
      mockRequireCsrfToken.mockResolvedValueOnce(csrfBlockedResponse());

      const response = await convPUT(
        makeConvRequest('PUT', { title: 'New title' }),
        convRouteContext,
      );

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.code).toBe('CSRF_VALIDATION_FAILED');
    });

    it('proceeds normally with valid CSRF token', async () => {
      mockRequireCsrfToken.mockResolvedValue(null);

      const response = await convPUT(
        makeConvRequest('PUT', { title: 'New title' }),
        convRouteContext,
      );

      expect(response.status).not.toBe(403);
    });

    it('calls requireCsrfToken for PUT requests', async () => {
      mockRequireCsrfToken.mockResolvedValue(null);

      await convPUT(makeConvRequest('PUT', { title: 'test' }), convRouteContext);

      expect(mockRequireCsrfToken).toHaveBeenCalledOnce();
    });
  });

  describe('DELETE /api/chat/conversations/[id]', () => {
    it('returns 403 when CSRF token is missing/invalid', async () => {
      mockRequireCsrfToken.mockResolvedValueOnce(csrfBlockedResponse());

      const response = await convDELETE(makeConvRequest('DELETE'), convRouteContext);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.code).toBe('CSRF_VALIDATION_FAILED');
    });

    it('proceeds normally with valid CSRF token', async () => {
      mockRequireCsrfToken.mockResolvedValue(null);

      const response = await convDELETE(makeConvRequest('DELETE'), convRouteContext);

      expect(response.status).not.toBe(403);
    });

    it('calls requireCsrfToken for DELETE requests', async () => {
      mockRequireCsrfToken.mockResolvedValue(null);

      await convDELETE(makeConvRequest('DELETE'), convRouteContext);

      expect(mockRequireCsrfToken).toHaveBeenCalledOnce();
    });
  });

  describe('GET /api/chat/conversations/[id], no CSRF required', () => {
    it('does NOT call requireCsrfToken for GET requests', async () => {
      mockNeonQuery
        .mockReset()
        .mockResolvedValueOnce([
          {
            id: CONVERSATION_ID,
            title: 'Test',
            model: 'auto',
            created_at: '2026-01-01',
            updated_at: '2026-01-01',
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: '0' }]);

      await convGET(makeConvRequest('GET'), convRouteContext);

      expect(mockRequireCsrfToken).not.toHaveBeenCalled();
    });
  });
});
