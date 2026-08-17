import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

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

import { POST, OPTIONS } from '@/app/api/device/poll/route';

describe('Device Poll API', () => {
  const validRequest = {
    device_id: 'device-123',
    device_fingerprint: 'abc123def456',
  };

  const basePendingRow = {
    device_id: 'device-123',
    device_fingerprint: 'abc123def456',
    user_code: 'A1B2C3D4E5F60718',
    status: 'pending',
    user_id: null,
    expires_at: new Date(Date.now() + 60000).toISOString(),
    updated_at: new Date().toISOString(),
  };

  const baseApprovedRow = {
    device_id: 'device-123',
    device_fingerprint: 'abc123def456',
    user_code: 'A1B2C3D4E5F60718',
    status: 'approved',
    user_id: 'user-456',
    expires_at: new Date(Date.now() + 60000).toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
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
        expect(response.status).toBe(500);
      });

      it('should return pending when the RPC returns no rows (already-consumed token)', async () => {
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
        mockNeonQuery.mockResolvedValueOnce([
          {
            ...basePendingRow,
            expires_at: new Date(Date.now() - 60000).toISOString(),
          },
        ]);

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

      it('refuses to consume a CLI device-code row parked on the shared table', async () => {
        mockNeonQuery.mockResolvedValueOnce([
          {
            ...baseApprovedRow,
            device_fingerprint: null,
            user_code: 'ABCD-2345',
          },
        ]);

        const request = new NextRequest('http://localhost/api/device/poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validRequest),
        });

        const response = await POST(request);
        expect(response.status).toBe(404);
        await expect(response.json()).resolves.toEqual({ error: 'Not found' });
        expect(mockNeonExecute).not.toHaveBeenCalled();
        expect(mockNeonQuery).toHaveBeenCalledTimes(1);
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
