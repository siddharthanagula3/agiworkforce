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

vi.mock('@/lib/server/developer-token', () => ({
  issueDeveloperToken: vi.fn(() => ({ accessToken: 'device-access-token', expiresIn: 3600 })),
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

    describe('Token issuance and edge cases', () => {
      it('refuses rather than pairing a device when token signing is unavailable', async () => {
        const { issueDeveloperToken } = await import('@/lib/server/developer-token');
        vi.mocked(issueDeveloperToken).mockImplementationOnce(() => {
          throw new Error('signing secret missing');
        });

        mockNeonQuery.mockResolvedValueOnce([baseApprovedRow]).mockResolvedValueOnce([
          {
            status: 'approved',
            user_id: 'user-456',
            user_email: 'test@example.com',
            user_name: 'Test User',
            access_token: null,
            refresh_token: null,
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
    it('mints a renewable device credential on consumption rather than replaying a session token', async () => {
      mockNeonQuery.mockResolvedValueOnce([baseApprovedRow]).mockResolvedValueOnce([
        {
          status: 'approved',
          user_id: 'user-456',
          user_email: 'test@example.com',
          user_name: 'Test User',
          access_token: null,
          refresh_token: null,
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
      expect(data.status).toBe('approved');
      expect(data.access_token).toBe('device-access-token');
      expect(typeof data.refresh_token).toBe('string');
      expect(data.refresh_token.length).toBeGreaterThan(0);
      expect(data.expires_in).toBe(3600);
      expect(data.refresh_token_expires_in).toBeGreaterThan(0);

      const insert = mockNeonExecute.mock.calls.find(([sql]) =>
        String(sql).includes('device_refresh_tokens'),
      );
      expect(insert, 'the refresh family must be persisted or renewal cannot work').toBeDefined();
    });

    it('stays pending when the approved row carries no account', async () => {
      mockNeonQuery.mockResolvedValueOnce([baseApprovedRow]).mockResolvedValueOnce([
        {
          status: 'approved',
          user_id: null,
          user_email: null,
          user_name: null,
          access_token: null,
          refresh_token: null,
        },
      ]);

      const request = new NextRequest('http://localhost/api/device/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequest),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      expect((await response.json()).status).toBe('pending');
    });
  });
});
