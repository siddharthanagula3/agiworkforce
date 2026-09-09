import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mockClerkAuth = vi.fn(() => Promise.resolve({ userId: 'user-123' }));

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => mockClerkAuth(),
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn(() => null),
}));

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
    if (key === 'CLERK_SECRET_KEY') return 'test-anon-key';
    if (key === 'NEON_DATABASE_URL') return 'test-service-role-key';
    return 'test-value';
  }),
  getEnv: vi.fn((key: string, defaultValue?: string) => {
    if (key === 'NEXT_PUBLIC_APP_URL') return 'https://test.agiworkforce.com';
    return defaultValue || 'test-value';
  }),
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    execute: vi.fn().mockResolvedValue({}),
    query: vi.fn().mockResolvedValue([{ account_status: 'active' }]),
  })),
}));

import { POST, OPTIONS } from '@/app/api/device/link/route';

describe('Device Link API', () => {
  const validRequest = {
    device_name: 'My Desktop',
    device_type: 'desktop',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockClerkAuth.mockResolvedValue({ userId: 'user-123' });
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

      it('should return 400 for a caller-supplied device_id', async () => {
        const request = new NextRequest('http://localhost/api/device/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...validRequest, device_id: 'attacker-chosen' }),
        });

        const response = await POST(request);
        expect(response.status).toBe(400);
      });

      it('should return 400 for a caller-supplied device_fingerprint', async () => {
        const request = new NextRequest('http://localhost/api/device/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...validRequest, device_fingerprint: 'deadbeef' }),
        });

        const response = await POST(request);
        expect(response.status).toBe(400);
      });

      it('should accept a request that names only the device', async () => {
        const request = new NextRequest('http://localhost/api/device/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
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
        expect(data.device_id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
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

  describe('H54, Token generation and security validation', () => {
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

        expect(data.link_code).toMatch(/^[a-zA-Z0-9_-]+$/);
      });

      it('each request generates a unique link_code (no replay)', async () => {
        const makeRequest = () =>
          POST(
            new NextRequest('http://localhost/api/device/link', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(validRequest),
            }),
          );

        const [r1, r2, r3] = await Promise.all([makeRequest(), makeRequest(), makeRequest()]);

        const [d1, d2, d3] = await Promise.all([r1.json(), r2.json(), r3.json()]);

        const codes = [d1.link_code, d2.link_code, d3.link_code];
        const uniqueCodes = new Set(codes);

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

        const expiresAtMs = data.expires_at * 1000;
        expect(expiresAtMs).toBeGreaterThan(Date.now());
      });
    });

    describe('Expired / invalid token rejection', () => {
      it('returns 400 for a device_fingerprint whatever its shape', async () => {
        const request = new NextRequest('http://localhost/api/device/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...validRequest,
            device_fingerprint: 'zzzzzzzzzzzz',
          }),
        });

        const response = await POST(request);
        expect(response.status).toBe(400);
      });

      it('returns 400 for a device_id whatever its shape', async () => {
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
              headers: {
                'Content-Type': 'application/json',
              },
              body: samePayload,
            }),
          ),
          POST(
            new NextRequest('http://localhost/api/device/link', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: samePayload,
            }),
          ),
        ]);

        const [d1, d2] = await Promise.all([r1.json(), r2.json()]);

        expect(d1.link_code).not.toBe(d2.link_code);
      });

      it('mints a distinct device_id the caller never chose', async () => {
        const post = async () => {
          const response = await POST(
            new NextRequest('http://localhost/api/device/link', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(validRequest),
            }),
          );
          return (await response.json()).device_id as string;
        };

        expect(await post()).not.toBe(await post());
      });
    });
  });
});
