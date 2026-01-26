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

      it('should return pending status for valid request with no matching device', async () => {
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

  describe('OPTIONS /api/device/poll', () => {
    it('should handle CORS preflight', async () => {
      const request = new NextRequest('http://localhost/api/device/poll', {
        method: 'OPTIONS',
      });

      const response = await OPTIONS(request);
      expect(response.status).toBe(204);
    });
  });
});
