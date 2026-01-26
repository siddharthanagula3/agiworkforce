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

describe('Device Approve API', () => {
  // Valid hex code per schema
  const validCode = 'ABC123DEF456';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/device/approve', () => {
    describe('Authentication', () => {
      it('should return 401 for unauthenticated request', async () => {
        // Override mock to return no session
        const { createSupabaseServerClient } = await import('@/services/supabase-server');
        vi.mocked(createSupabaseServerClient).mockResolvedValueOnce({
          auth: {
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
