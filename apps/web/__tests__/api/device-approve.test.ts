/**
 * Device Approve API Tests
 *
 * Tests for device authorization approval/denial flow
 */

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
    debug: vi.fn(),
  },
}));

vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn(() => null),
}));

// Mock environment variables
vi.mock('@shared/utils/env', () => ({
  requireEnv: vi.fn((key: string) => {
    if (key === 'DEVICE_TOKEN_ENCRYPTION_KEY') return 'a'.repeat(64); // 64 hex chars = 32 bytes
    return 'test-value';
  }),
}));

// Mock Clerk auth — route calls auth() from @clerk/nextjs/server
const mockClerkAuth = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => mockClerkAuth(),
}));

// Mock Neon DB — route calls getNeonDb() for all DB operations
const mockQuery = vi.fn();
const mockExecute = vi.fn();

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: mockQuery,
    execute: mockExecute,
    transaction: vi.fn(),
    dispose: vi.fn(),
  })),
}));

// Mock device token crypto — encryptToken is called on approval
vi.mock('@/lib/device-token-crypto', () => ({
  encryptToken: vi.fn(() => 'encrypted-token-value'),
  decryptToken: vi.fn((t: string) => t),
}));

// Import after mocks
import { POST, OPTIONS } from '@/app/api/device/approve/route';
import { requireCsrfToken } from '@/lib/csrf';

// Helpers for building consistent pending records
function makePendingRecord(
  overrides: Partial<{
    device_id: string;
    status: string;
    expires_at: string;
  }> = {},
) {
  return {
    device_id: 'device-123',
    status: 'pending',
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
}

describe('Device Approve API', () => {
  // Valid hex code per schema
  const validCode = 'ABC123DEF456';

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: authenticated Clerk user with valid token
    mockClerkAuth.mockResolvedValue({
      userId: 'user-123',
      getToken: vi.fn().mockResolvedValue('clerk-session-token'),
    });

    // Default: DB query returns a valid pending record (SELECT)
    mockQuery.mockResolvedValue([makePendingRecord()]);

    // Default: DB execute succeeds (UPDATE ... RETURNING)
    mockExecute.mockResolvedValue(undefined);
  });

  describe('POST /api/device/approve', () => {
    describe('Authentication', () => {
      it('should return 401 for unauthenticated request', async () => {
        mockClerkAuth.mockResolvedValueOnce({
          userId: null,
          getToken: vi.fn().mockResolvedValue(null),
        });

        const request = new NextRequest('http://localhost/api/device/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: validCode }),
        });

        const response = await POST(request);
        expect(response.status).toBe(401);
      });
    });

    describe('CSRF Protection', () => {
      it('should return 403 when x-csrf-token header is absent', async () => {
        // Override the global mock so requireCsrfToken enforces the check for
        // this test only, returning a 403 as the real implementation would.
        vi.mocked(requireCsrfToken).mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              error: 'Invalid or missing CSRF token',
              code: 'CSRF_VALIDATION_FAILED',
            }),
            {
              status: 403,
              headers: { 'Content-Type': 'application/json' },
            },
          ),
        );

        // Request has no x-csrf-token header — CSRF check must reject it.
        const request = new NextRequest('http://localhost/api/device/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: validCode, action: 'approve' }),
        });

        const response = await POST(request);
        expect(response.status).toBe(403);

        const data = await response.json();
        expect(data.code).toBe('CSRF_VALIDATION_FAILED');
      });
    });

    describe('Input Validation', () => {
      it('should return 400 for invalid JSON', async () => {
        const request = new NextRequest('http://localhost/api/device/approve', {
          method: 'POST',
          body: 'invalid json',
        });

        const response = await POST(request);
        expect(response.status).toBe(400);
      });

      it('should return 400 for missing code', async () => {
        const request = new NextRequest('http://localhost/api/device/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });

        const response = await POST(request);
        expect(response.status).toBe(400);
      });

      it('should return 400 for empty code', async () => {
        const request = new NextRequest('http://localhost/api/device/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: '' }),
        });

        const response = await POST(request);
        expect(response.status).toBe(400);
      });

      it('should return 400 for non-hex code', async () => {
        const request = new NextRequest('http://localhost/api/device/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: 'not-hex-code!' }),
        });

        const response = await POST(request);
        expect(response.status).toBe(400);
      });

      it('should return 400 for code that is too long', async () => {
        const request = new NextRequest('http://localhost/api/device/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: 'A'.repeat(100) }),
        });

        const response = await POST(request);
        expect(response.status).toBe(400);
      });

      it('should accept valid approve action', async () => {
        // SELECT returns pending record
        mockQuery.mockResolvedValueOnce([makePendingRecord()]);
        // UPDATE ... RETURNING status = 'approved'
        mockQuery.mockResolvedValueOnce([{ status: 'approved' }]);

        const request = new NextRequest('http://localhost/api/device/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: validCode, action: 'approve' }),
        });

        const response = await POST(request);
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.status).toBe('approved');

        // Security: the approve endpoint must NOT expose raw tokens in its response.
        // Tokens are encrypted and stored in the DB; the device retrieves them exactly
        // once via the poll endpoint (GET /api/device/poll) after the code is consumed.
        expect(data.access_token).toBeUndefined();
        expect(data.refresh_token).toBeUndefined();
      });

      it('should accept valid deny action', async () => {
        // SELECT returns pending record
        mockQuery.mockResolvedValueOnce([makePendingRecord()]);
        // UPDATE ... RETURNING status = 'denied'
        mockQuery.mockResolvedValueOnce([{ status: 'denied' }]);

        const request = new NextRequest('http://localhost/api/device/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: validCode, action: 'deny' }),
        });

        const response = await POST(request);
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.status).toBe('denied');
      });

      it('should return 400 for invalid action', async () => {
        const request = new NextRequest('http://localhost/api/device/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: validCode, action: 'invalid' }),
        });

        const response = await POST(request);
        expect(response.status).toBe(400);
      });
    });

    describe('Device Code Validation', () => {
      it('should return 400 for non-existent code', async () => {
        // SELECT returns no rows
        mockQuery.mockResolvedValueOnce([]);

        const request = new NextRequest('http://localhost/api/device/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: validCode }),
        });

        const response = await POST(request);
        expect(response.status).toBe(400);
      });

      it('should return 400 for expired code', async () => {
        // SELECT returns expired record
        mockQuery.mockResolvedValueOnce([
          makePendingRecord({ expires_at: new Date(Date.now() - 60_000).toISOString() }),
        ]);
        // UPDATE to set status = 'expired'
        mockExecute.mockResolvedValueOnce(undefined);

        const request = new NextRequest('http://localhost/api/device/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: validCode }),
        });

        const response = await POST(request);
        expect(response.status).toBe(400);
      });

      it('should return 409 for already processed code', async () => {
        // SELECT returns already-approved record
        mockQuery.mockResolvedValueOnce([makePendingRecord({ status: 'approved' })]);

        const request = new NextRequest('http://localhost/api/device/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: validCode }),
        });

        const response = await POST(request);
        expect(response.status).toBe(409);
      });
    });
  });

  describe('OPTIONS /api/device/approve', () => {
    it('should handle CORS preflight', async () => {
      const request = new NextRequest('http://localhost/api/device/approve', {
        method: 'OPTIONS',
      });

      const response = await OPTIONS(request);
      expect(response.status).toBe(204);
    });
  });
});
