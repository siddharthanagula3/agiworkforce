/**
 * Tests for CSRF protection on state-changing endpoints
 *
 * Verifies:
 * - PUT /api/memory/[id] requires a valid CSRF token
 * - DELETE /api/memory/[id] requires a valid CSRF token
 * - PUT /api/chat/conversations/[id] requires a valid CSRF token
 * - DELETE /api/chat/conversations/[id] requires a valid CSRF token
 * - GET requests are NOT blocked (no CSRF check)
 *
 * Strategy: override the default test/setup.ts mock (requireCsrfToken → null)
 * to simulate the real 403 response, then reset back to null for non-CSRF tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Baseline mocks ───────────────────────────────────────────────────────────
vi.mock('server-only', () => ({}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: vi.fn(async () => null),
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

// ─── CSRF mock — exported so tests can override per-call ───────────────────
const mockRequireCsrfToken = vi.fn();
vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: (...args: unknown[]) => mockRequireCsrfToken(...args),
  // Keep other CSRF helpers real-ish (not used by routes in these tests)
  generateCsrfToken: vi.fn(() => 'valid-token'),
  verifyCsrfToken: vi.fn(() => true),
  getSessionIdFromRequest: vi.fn(() => Promise.resolve('session-123')),
}));

// ─── Clerk auth — used by memory/[id]/route ───────────────────────────────────
const mockGetClerkAuthUser = vi.fn();
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: (...args: unknown[]) => mockGetClerkAuthUser(...args),
}));

// ─── Neon DB — used by memory/[id]/route ─────────────────────────────────────
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

// ─── Neon DB + Clerk auth — used by chat/conversations/[id]/route ─────────────
// The conversation routes were migrated from Neon to Neon + Clerk in Wave 3.
const mockNeonQuery = vi.fn();
const mockNeonExecute = vi.fn();
const mockRequireCurrentUserId = vi.fn();

vi.mock('@/lib/server/neon-chat', () => ({
  getNeonChatDb: () => ({ query: mockNeonQuery, execute: mockNeonExecute }),
  requireCurrentUserId: (...args: unknown[]) => mockRequireCurrentUserId(...args),
  normalizeMessageMetadata: (v: unknown) => v,
}));

// ─── Import routes under test ─────────────────────────────────────────────
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

// ─── Shared CSRF 403 response factory ────────────────────────────────────────
function csrfBlockedResponse(): Response {
  return new Response(
    JSON.stringify({ error: 'Invalid or missing CSRF token', code: 'CSRF_VALIDATION_FAILED' }),
    { status: 403, headers: { 'Content-Type': 'application/json' } },
  );
}

// ─── Request helpers ──────────────────────────────────────────────────────────
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

function makeConvRequest(method: 'GET' | 'PUT' | 'DELETE', body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/chat/conversations/test-conv-id', {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer valid-jwt-token',
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const routeContext = { params: Promise.resolve({ id: 'test-id' }) };
const convRouteContext = { params: Promise.resolve({ id: 'test-conv-id' }) };

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('CSRF protection on state-changing endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: authenticated user (Clerk auth for memory routes)
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user-1', email: 'test@test.com' });

    // Default Neon mock for memory routes
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

    // Default Neon + Clerk mocks for conversation routes
    mockRequireCurrentUserId.mockResolvedValue('user-1');
    mockNeonQuery.mockResolvedValue([
      {
        id: 'test-conv-id',
        title: 'Test',
        model: 'auto',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);
    mockNeonExecute.mockResolvedValue(undefined);

    // By default pass CSRF
    mockRequireCsrfToken.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
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

      // Should not be a CSRF 403 — route proceeds to actual logic
      expect(response.status).not.toBe(403);
    });

    it('calls requireCsrfToken for PUT requests', async () => {
      mockRequireCsrfToken.mockResolvedValue(null);

      await memoryPUT(makeMemoryRequest('PUT', { content: 'test' }), routeContext);

      expect(mockRequireCsrfToken).toHaveBeenCalledOnce();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
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
      // Simulate successful delete (Neon execute resolves with no error)
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

  // ───────────────────────────────────────────────────────────────────────────
  describe('GET /api/memory/[id] — no CSRF required', () => {
    it('does NOT call requireCsrfToken for GET requests', async () => {
      await memoryGET(makeMemoryRequest('GET'), routeContext);

      expect(mockRequireCsrfToken).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
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

  // ───────────────────────────────────────────────────────────────────────────
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
      // Neon execute is already mocked to resolve in beforeEach

      const response = await convDELETE(makeConvRequest('DELETE'), convRouteContext);

      expect(response.status).not.toBe(403);
    });

    it('calls requireCsrfToken for DELETE requests', async () => {
      mockRequireCsrfToken.mockResolvedValue(null);

      await convDELETE(makeConvRequest('DELETE'), convRouteContext);

      expect(mockRequireCsrfToken).toHaveBeenCalledOnce();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('GET /api/chat/conversations/[id] — no CSRF required', () => {
    it('does NOT call requireCsrfToken for GET requests', async () => {
      mockNeonQuery
        .mockReset()
        .mockResolvedValueOnce([
          {
            id: 'test-conv-id',
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
