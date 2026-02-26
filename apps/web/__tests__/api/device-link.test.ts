/**
 * Device Link API Tests
 *
 * Tests for device linking flow input validation
 * Note: Full integration tests require actual Supabase connection
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
    if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'test-service-role-key';
    return 'test-value';
  }),
  getEnv: vi.fn((key: string, defaultValue?: string) => {
    if (key === 'NEXT_PUBLIC_APP_URL') return 'https://test.agiworkforce.com';
    return defaultValue || 'test-value';
  }),
}));

// Mock Supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      upsert: vi.fn().mockResolvedValue({ error: null }),
    })),
  })),
}));

// Import after mocks
import { POST, OPTIONS } from '@/app/api/device/link/route';

describe('Device Link API', () => {
  // Use valid values per schema: device_fingerprint must be hex only
  const validRequest = {
    device_id: 'device-123',
    device_name: 'My Desktop',
    device_type: 'desktop',
    device_fingerprint: 'abc123def456',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/device/link', () => {
    describe('Input Validation', () => {
      it('should return 400 for invalid JSON', async () => {
        const request = new NextRequest('http://localhost/api/device/link', {
          method: 'POST',
          body: 'invalid json',
        });

        const response = await POST(request);
        expect(response.status).toBe(400);
      });

      it('should return 400 for missing device_id', async () => {
        const request = new NextRequest('http://localhost/api/device/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_name: 'Test' }),
        });

        const response = await POST(request);
        expect(response.status).toBe(400);
      });

      it('should accept request with only required fields', async () => {
        const request = new NextRequest('http://localhost/api/device/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            device_id: 'device-123',
            device_fingerprint: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
          }),
        });

        const response = await POST(request);
        expect(response.status).toBe(200);
      });

      it('should return 200 with valid request', async () => {
        const request = new NextRequest('http://localhost/api/device/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validRequest),
        });

        const response = await POST(request);
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.link_code).toBeDefined();
        expect(data.device_id).toBe('device-123');
        expect(data.verify_url).toBeDefined();
        expect(data.expires_at).toBeDefined();
      });
    });
  });

  describe('OPTIONS /api/device/link', () => {
    it('should handle CORS preflight', async () => {
      const request = new NextRequest('http://localhost/api/device/link', {
        method: 'OPTIONS',
      });

      const response = await OPTIONS(request);
      expect(response.status).toBe(204);
    });
  });

  // H54 — crypto validation tests
  describe('H54 — Token generation and security validation', () => {
    describe('Token format validation', () => {
      it('generated link_code has non-zero length', async () => {
        const request = new NextRequest('http://localhost/api/device/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validRequest),
        });

        const response = await POST(request);
        const data = await response.json();

        expect(data.link_code).toBeTruthy();
        expect(typeof data.link_code).toBe('string');
        expect(data.link_code.length).toBeGreaterThan(0);
      });

      it('generated link_code consists of hex or alphanumeric characters', async () => {
        const request = new NextRequest('http://localhost/api/device/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validRequest),
        });

        const response = await POST(request);
        const data = await response.json();

        // Tokens should be URL-safe: letters, digits, hyphens, underscores
        expect(data.link_code).toMatch(/^[a-zA-Z0-9_-]+$/);
      });

      it('each request generates a unique link_code (no replay)', async () => {
        const makeRequest = () =>
          POST(
            new NextRequest('http://localhost/api/device/link', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...validRequest, device_id: `device-${Math.random()}` }),
            }),
          );

        const [r1, r2, r3] = await Promise.all([makeRequest(), makeRequest(), makeRequest()]);

        const [d1, d2, d3] = await Promise.all([r1.json(), r2.json(), r3.json()]);

        const codes = [d1.link_code, d2.link_code, d3.link_code];
        const uniqueCodes = new Set(codes);

        // All three link codes should be distinct
        expect(uniqueCodes.size).toBe(3);
      });

      it('verify_url contains the link_code', async () => {
        const request = new NextRequest('http://localhost/api/device/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validRequest),
        });

        const response = await POST(request);
        const data = await response.json();

        expect(data.verify_url).toContain(data.link_code);
      });

      it('expires_at is a future ISO date string', async () => {
        const request = new NextRequest('http://localhost/api/device/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validRequest),
        });

        const response = await POST(request);
        const data = await response.json();

        const expiresAt = new Date(data.expires_at);
        expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
      });
    });

    describe('Expired / invalid token rejection', () => {
      it('returns 400 when device_fingerprint contains non-hex characters', async () => {
        const request = new NextRequest('http://localhost/api/device/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...validRequest,
            device_fingerprint: 'zzzzzzzzzzzz', // non-hex
          }),
        });

        const response = await POST(request);
        // Zod schema validates hex-only; non-hex should produce 400
        expect(response.status).toBe(400);
      });

      it('returns 400 when device_id is empty string', async () => {
        const request = new NextRequest('http://localhost/api/device/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...validRequest, device_id: '' }),
        });

        const response = await POST(request);
        expect(response.status).toBe(400);
      });

      it('returns 400 when device_name exceeds maximum length', async () => {
        const request = new NextRequest('http://localhost/api/device/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...validRequest,
            device_name: 'a'.repeat(300), // excessively long
          }),
        });

        const response = await POST(request);
        // The schema limits device_name length — extremely long values must be rejected
        expect(response.status).toBe(400);
      });
    });

    describe('Replay prevention', () => {
      it('two identical payloads generate different link_codes', async () => {
        const samePayload = JSON.stringify(validRequest);

        const [r1, r2] = await Promise.all([
          POST(
            new NextRequest('http://localhost/api/device/link', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: samePayload,
            }),
          ),
          POST(
            new NextRequest('http://localhost/api/device/link', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: samePayload,
            }),
          ),
        ]);

        const [d1, d2] = await Promise.all([r1.json(), r2.json()]);

        // Even with identical input the link codes must differ (they include randomness)
        expect(d1.link_code).not.toBe(d2.link_code);
      });

      it('device_id is reflected back in the response', async () => {
        const request = new NextRequest('http://localhost/api/device/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...validRequest, device_id: 'unique-device-xyz' }),
        });

        const response = await POST(request);
        const data = await response.json();

        expect(data.device_id).toBe('unique-device-xyz');
      });
    });
  });
});
