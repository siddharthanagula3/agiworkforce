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
vi.mock('@/utils/env', () => ({
  requireEnv: vi.fn((key: string) => {
    if (key === 'NEXT_PUBLIC_SUPABASE_URL') return 'https://test.supabase.co';
    if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'test-service-role-key';
    return 'test-value';
  }),
}));

// Mock session for authenticated requests
const mockSession = {
  user: {
    id: 'user-123',
    email: 'test@example.com',
    user_metadata: { full_name: 'Test User' },
  },
  access_token: 'access-token-123',
  refresh_token: 'refresh-token-456',
};

// Mock Supabase server client
vi.mock('@/services/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: mockSession.user }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: mockSession } }),
    },
  })),
}));

// Mock Supabase admin client
const mockAdminFrom = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockAdminFrom,
  })),
}));

// Import after mocks
import { POST, OPTIONS } from '@/app/api/device/approve/route';
import { requireCsrfToken } from '@/lib/csrf';

describe('Device Approve API', () => {
  // Valid hex code per schema
  const validCode = 'ABC123DEF456';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/device/approve', () => {
    describe('Authentication', () => {
      it('should return 401 for unauthenticated request', async () => {
        // Override mock to return no user (getUser is the server-side JWT validation path)
        const { createSupabaseServerClient } = await import('@/services/supabase-server');
        vi.mocked(createSupabaseServerClient).mockResolvedValueOnce({
          auth: {
            getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
            getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
          },
        } as never);

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
        mockAdminFrom.mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  device_id: 'device-123',
                  status: 'pending',
                  expires_at: new Date(Date.now() + 60000).toISOString(),
                },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { status: 'approved' },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        });

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
        mockAdminFrom.mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  device_id: 'device-123',
                  status: 'pending',
                  expires_at: new Date(Date.now() + 60000).toISOString(),
                },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { status: 'denied' },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        });

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
        mockAdminFrom.mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { code: 'PGRST116' },
              }),
            }),
          }),
        });

        const request = new NextRequest('http://localhost/api/device/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: validCode }),
        });

        const response = await POST(request);
        expect(response.status).toBe(400);
      });

      it('should return 400 for expired code', async () => {
        mockAdminFrom.mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  device_id: 'device-123',
                  status: 'pending',
                  expires_at: new Date(Date.now() - 60000).toISOString(), // Expired
                },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        });

        const request = new NextRequest('http://localhost/api/device/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: validCode }),
        });

        const response = await POST(request);
        expect(response.status).toBe(400);
      });

      it('should return 409 for already processed code', async () => {
        mockAdminFrom.mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  device_id: 'device-123',
                  status: 'approved', // Already approved
                  expires_at: new Date(Date.now() + 60000).toISOString(),
                },
                error: null,
              }),
            }),
          }),
        });

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
