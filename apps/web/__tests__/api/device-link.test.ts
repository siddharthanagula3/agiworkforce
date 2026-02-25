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
});
