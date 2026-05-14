/**
 * Device Poll API Tests
 *
 * Tests for device polling flow input validation
 * Note: Full status flow tests require actual Supabase connection
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
vi.mock('@/utils/env', () => ({
  requireEnv: vi.fn((key: string) => {
    if (key === 'NEXT_PUBLIC_SUPABASE_URL') return 'https://test.supabase.co';
    if (key === 'SUPABASE_URL') return 'https://test.supabase.co';
    if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'test-service-role-key';
    return 'test-value';
  }),
  getEnv: vi.fn((key: string, defaultValue?: string) => {
    if (key === 'NEXT_PUBLIC_SUPABASE_URL') return 'https://test.supabase.co';
    return defaultValue || 'test-value';
  }),
}));

// Mock Supabase - return pending status by default
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
        })),
      })),
    })),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  })),
}));

// Import after mocks
import { POST, OPTIONS } from '@/app/api/device/poll/route';
import { createClient } from '@supabase/supabase-js';

describe('Device Poll API', () => {
  // Use valid values per schema: device_fingerprint must be hex only
  const validRequest = {
    device_id: 'device-123',
    device_fingerprint: 'abc123def456',
  };

  beforeEach(() => {
    vi.clearAllMocks();
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
        // The device record shows "approved" and the RPC consume call returns a row
        // with a corrupted (non-base64-GCM) access_token. decryptToken() will throw,
        // and the route must surface that as an internal error (500).
        vi.mocked(createClient).mockReturnValueOnce({
          from: vi.fn(() => ({
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: {
                    device_id: 'device-123',
                    device_fingerprint: 'abc123def456',
                    status: 'approved',
                    user_id: 'user-456',
                    expires_at: new Date(Date.now() + 60000).toISOString(),
                    updated_at: new Date().toISOString(),
                  },
                  error: null,
                }),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ error: null }),
            })),
          })),
          rpc: vi.fn().mockResolvedValue({
            data: [
              {
                status: 'approved',
                user_id: 'user-456',
                user_email: 'test@example.com',
                user_name: 'Test User',
                // Deliberately corrupted — too short to be a valid GCM blob
                access_token: 'bm90LXZhbGlk',
                refresh_token: 'bm90LXZhbGlk',
              },
            ],
            error: null,
          }),
        } as never);

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
        // The device record is in "approved" state but the atomic consume RPC
        // returns null/empty (another poll request already consumed the tokens).
        // The route should treat this as "pending" rather than exposing an error.
        vi.mocked(createClient).mockReturnValueOnce({
          from: vi.fn(() => ({
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: {
                    device_id: 'device-123',
                    device_fingerprint: 'abc123def456',
                    status: 'approved',
                    user_id: 'user-456',
                    expires_at: new Date(Date.now() + 60000).toISOString(),
                    updated_at: new Date().toISOString(),
                  },
                  error: null,
                }),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ error: null }),
            })),
          })),
          // RPC returns null — tokens already consumed by a concurrent request
          rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
        } as never);

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
        vi.mocked(createClient).mockReturnValueOnce({
          from: vi.fn(() => ({
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: {
                    device_id: 'device-123',
                    device_fingerprint: 'abc123def456',
                    status: 'pending',
                    user_id: null,
                    expires_at: new Date(Date.now() + 60000).toISOString(),
                    updated_at: new Date().toISOString(),
                  },
                  error: null,
                }),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ error: null }),
            })),
          })),
          rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
        } as never);

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
        vi.mocked(createClient).mockReturnValueOnce({
          from: vi.fn(() => ({
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: {
                    device_id: 'device-123',
                    device_fingerprint: 'abc123def456',
                    status: 'pending',
                    user_id: null,
                    // Expired one minute ago
                    expires_at: new Date(Date.now() - 60000).toISOString(),
                    updated_at: new Date().toISOString(),
                  },
                  error: null,
                }),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ error: null }),
            })),
          })),
          rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
        } as never);

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
      vi.mocked(createClient).mockReturnValueOnce({
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  device_id: 'device-123',
                  device_fingerprint: 'abc123def456',
                  status: 'denied',
                  user_id: null,
                  expires_at: new Date(Date.now() + 60000).toISOString(),
                  updated_at: new Date().toISOString(),
                },
                error: null,
              }),
            })),
          })),
          update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
        })),
        rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
      } as never);

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
      vi.mocked(createClient).mockReturnValueOnce({
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  device_id: 'device-123',
                  device_fingerprint: 'abc123def456',
                  status: 'revoked',
                  user_id: null,
                  expires_at: new Date(Date.now() + 60000).toISOString(),
                  updated_at: new Date().toISOString(),
                },
                error: null,
              }),
            })),
          })),
          update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
        })),
        rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
      } as never);

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
      vi.mocked(createClient).mockReturnValueOnce({
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  device_id: 'device-123',
                  device_fingerprint: 'abc123def456',
                  status: 'approved',
                  user_id: 'user-456',
                  expires_at: new Date(Date.now() + 60000).toISOString(),
                  updated_at: new Date().toISOString(),
                },
                error: null,
              }),
            })),
          })),
          update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
        })),
        rpc: vi.fn().mockResolvedValue({
          data: [
            {
              status: 'approved',
              user_id: 'user-456',
              user_email: 'test@example.com',
              user_name: 'Test User',
              access_token: null,
              refresh_token: 'some-refresh',
            },
          ],
          error: null,
        }),
      } as never);

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
