/**
 * Device Poll API Tests
 *
 * Tests for device polling flow input validation
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
    if (key === 'NEON_DATABASE_URL') return 'https://localhost';
    if (key === 'NEON_DATABASE_URL') return 'https://localhost';
    if (key === 'NEON_DATABASE_URL') return 'test-service-role-key';
    return 'test-value';
  }),
  getEnv: vi.fn((key: string, defaultValue?: string) => {
    if (key === 'NEON_DATABASE_URL') return 'https://localhost';
    return defaultValue || 'test-value';
  }),
}));

// Neon DB mock - the route uses getNeonDb() with db.query() and db.execute()
const mockNeonQuery = vi.fn();
const mockNeonExecute = vi.fn().mockResolvedValue(1);

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockNeonQuery(...args),
    execute: (...args: unknown[]) => mockNeonExecute(...args),
    transaction: vi.fn((fn: (db: unknown) => unknown) => fn({})),
    withUser: vi.fn(() => ({})),
    dispose: vi.fn(),
  })),
}));

// Import after mocks
import { POST, OPTIONS } from '@/app/api/device/poll/route';

describe('Device Poll API', () => {
  // Use valid values per schema: device_fingerprint must be hex only
  const validRequest = {
    device_id: 'device-123',
    device_fingerprint: 'abc123def456',
  };

  // Base device record for a pending, non-expired device
  const basePendingRow = {
    device_id: 'device-123',
    device_fingerprint: 'abc123def456',
    status: 'pending',
    user_id: null,
    expires_at: new Date(Date.now() + 60000).toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Base device record for an approved device
  const baseApprovedRow = {
    device_id: 'device-123',
    device_fingerprint: 'abc123def456',
    status: 'approved',
    user_id: 'user-456',
    expires_at: new Date(Date.now() + 60000).toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no device found (empty result set)
    mockNeonQuery.mockResolvedValue([]);
    mockNeonExecute.mockResolvedValue(1);
  });

  describe('POST /api/device/poll', () => {
    describe('Input Validation', () => {
      it('should return 400 for invalid JSON', async () => {
        const request = new NextRequest('http://localhost/api/device/poll', {
          method: 'POST',
          body: 'invalid json',
        });

        const response = await POST(request);
        expect(response.status).toBe(400);
      });

      it('should return 400 for missing device_id', async () => {
        const request = new NextRequest('http://localhost/api/device/poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });

        const response = await POST(request);
        expect(response.status).toBe(400);
      });

      it('should return 404 for valid request with no matching device (no info disclosure)', async () => {
        // Route hardened to return 404 + generic error for unknown devices rather than
        // 200 + {status:"pending"}, to avoid exposing device-id existence to
        // unauthenticated callers. See apps/web/app/api/device/poll/route.ts:65-69.
        // mockNeonQuery defaults to returning [] (no rows), so no override needed.
        const request = new NextRequest('http://localhost/api/device/poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validRequest),
        });

        const response = await POST(request);
        expect(response.status).toBe(404);

        const data = await response.json();
        expect(data.error).toBe('Not found');
        expect(data.status).toBeUndefined();
      });
    });

    describe('Token decryption and edge cases', () => {
      it('should return 500 when the stored token is corrupted and cannot be decrypted', async () => {
        // The device record shows "approved" and the atomic consume query returns a row
        // with a corrupted (non-base64-GCM) access_token. decryptToken() will throw,
        // and the route must surface that as an internal error (500).
        mockNeonQuery
          // First call: fetch device row
          .mockResolvedValueOnce([baseApprovedRow])
          // Second call: atomic consume CTE returns a row with corrupted token
          .mockResolvedValueOnce([
            {
              status: 'approved',
              user_id: 'user-456',
              user_email: 'test@example.com',
              user_name: 'Test User',
              // Deliberately corrupted - too short to be a valid GCM blob
              access_token: 'bm90LXZhbGlk',
              refresh_token: 'bm90LXZhbGlk',
            },
          ]);

        const request = new NextRequest('http://localhost/api/device/poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validRequest),
        });

        const response = await POST(request);
        // decryptToken throws -> createError.internal -> withErrorHandler -> 500
        expect(response.status).toBe(500);
      });

      it('should return pending when the RPC returns no rows (already-consumed token)', async () => {
        // The device record is in "approved" state but the atomic consume query
        // returns empty (another poll request already consumed the tokens).
        // The route should treat this as "pending" rather than exposing an error.
        mockNeonQuery
          // First call: fetch device row - approved
          .mockResolvedValueOnce([baseApprovedRow])
          // Second call: atomic consume CTE returns empty (tokens already consumed)
          .mockResolvedValueOnce([]);

        const request = new NextRequest('http://localhost/api/device/poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validRequest),
        });

        const response = await POST(request);
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.status).toBe('pending');
      });

      it('should return 403 when device fingerprint does not match stored fingerprint', async () => {
        mockNeonQuery.mockResolvedValueOnce([
          {
            ...basePendingRow,
            // Stored fingerprint is 'abc123def456' but request sends '000000000000'
            device_fingerprint: 'abc123def456',
          },
        ]);

        const request = new NextRequest('http://localhost/api/device/poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_id: 'device-123', device_fingerprint: '000000000000' }),
        });

        const response = await POST(request);
        expect(response.status).toBe(403);
      });

      it('should return expired status when the device authorization record is past its expiry', async () => {
        // The device record exists but expires_at is in the past.
        // The route detects expiry before fingerprint/status checks and returns "expired".
        mockNeonQuery.mockResolvedValueOnce([
          {
            ...basePendingRow,
            // Expired one minute ago
            expires_at: new Date(Date.now() - 60000).toISOString(),
          },
        ]);

        const request = new NextRequest('http://localhost/api/device/poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validRequest),
        });

        const response = await POST(request);
        // Route hardened to return 404 + generic error for expired/consumed records
        // rather than 200 + {status:"expired"}. See route.ts:73-85.
        expect(response.status).toBe(404);

        const data = await response.json();
        expect(data.error).toBe('Not found');
        expect(data.status).toBeUndefined();
      });
    });
  });

  describe('OPTIONS /api/device/poll', () => {
    it('should handle CORS preflight', async () => {
      const request = new NextRequest('http://localhost/api/device/poll', {
        method: 'OPTIONS',
      });

      const response = await OPTIONS(request);
      expect(response.status).toBe(204);
    });
  });

  // =========================================================================
  // Status branches: denied, revoked (H15)
  // =========================================================================
  describe('Status branches: denied, revoked (H15)', () => {
    it('returns {status:"denied"} when device record status is "denied"', async () => {
      mockNeonQuery.mockResolvedValueOnce([
        {
          ...basePendingRow,
          status: 'denied',
          user_id: null,
        },
      ]);

      const request = new NextRequest('http://localhost/api/device/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequest),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.status).toBe('denied');
    });

    it('returns {status:"denied"} when device record status is "revoked"', async () => {
      mockNeonQuery.mockResolvedValueOnce([
        {
          ...basePendingRow,
          status: 'revoked',
          user_id: null,
        },
      ]);

      const request = new NextRequest('http://localhost/api/device/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequest),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.status).toBe('denied');
    });
  });

  // =========================================================================
  // approved-but-missing-tokens (M28)
  // =========================================================================
  describe('approved-but-missing-tokens (M28)', () => {
    it('returns {status:"pending"} when consumed row is approved but access_token is null', async () => {
      mockNeonQuery
        // First call: fetch device row - approved
        .mockResolvedValueOnce([baseApprovedRow])
        // Second call: atomic consume CTE returns row with null access_token
        .mockResolvedValueOnce([
          {
            status: 'approved',
            user_id: 'user-456',
            user_email: 'test@example.com',
            user_name: 'Test User',
            access_token: null,
            refresh_token: 'some-refresh',
          },
        ]);

      const request = new NextRequest('http://localhost/api/device/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequest),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.status).toBe('pending');
    });
  });
});
