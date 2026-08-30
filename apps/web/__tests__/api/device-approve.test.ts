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
    if (key === 'DEVICE_TOKEN_ENCRYPTION_KEY') return 'a'.repeat(64);
    return 'test-value';
  }),
}));

const mockClerkAuth = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => mockClerkAuth(),
}));

const mockQuery = vi.fn();
const mockExecute = vi.fn();

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: mockQuery,
    execute: mockExecute,
    transaction: vi.fn(),
    dispose: vi.fn(),
  })),
}));

const mockIsDeviceCodeSignInEnabled = vi.fn();
const mockHasAcceptedCurrentTerms = vi.fn();

vi.mock('@/lib/server/device-signin-policy', () => ({
  isDeviceCodeSignInEnabled: (userId: string) => mockIsDeviceCodeSignInEnabled(userId),
}));

vi.mock('@/lib/server/terms', () => ({
  hasAcceptedCurrentTerms: (userId: string) => mockHasAcceptedCurrentTerms(userId),
}));

import { POST, OPTIONS } from '@/app/api/device/approve/route';
import { requireCsrfToken } from '@/lib/csrf';

function makePendingRecord(
  overrides: Partial<{
    device_id: string;
    status: string;
    expires_at: string;
  }> = {},
) {
  return {
    device_id: 'device-123',
    status: 'pending',
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
}

describe('Device Approve API', () => {
  const validCode = 'ABC123DEF4567890';

  beforeEach(() => {
    vi.clearAllMocks();

    mockClerkAuth.mockResolvedValue({
      userId: 'user-123',
      getToken: vi.fn().mockResolvedValue('clerk-session-token'),
    });

    mockQuery.mockResolvedValue([makePendingRecord()]);

    mockExecute.mockResolvedValue(undefined);

    // Both approval gates open by default; the cases below close one at a time.
    mockIsDeviceCodeSignInEnabled.mockResolvedValue(true);
    mockHasAcceptedCurrentTerms.mockResolvedValue(true);
  });

  describe('POST /api/device/approve', () => {
    describe('Authentication', () => {
      it('should return 401 for unauthenticated request', async () => {
        mockClerkAuth.mockResolvedValueOnce({
          userId: null,
          getToken: vi.fn().mockResolvedValue(null),
        });

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

      it('refuses a CLI XXXX-XXXX user code from the shared table', async () => {
        const request = new NextRequest('http://localhost/api/device/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: 'ABCD-2345', action: 'approve' }),
        });

        const response = await POST(request);
        expect(response.status).toBe(400);
        expect(mockQuery).not.toHaveBeenCalled();
      });

      it('refuses a hex code that is not the generated link-code length', async () => {
        const request = new NextRequest('http://localhost/api/device/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: 'ABC123DEF456', action: 'approve' }),
        });

        const response = await POST(request);
        expect(response.status).toBe(400);
        expect(mockQuery).not.toHaveBeenCalled();
      });

      it('should accept valid approve action', async () => {
        mockQuery.mockResolvedValueOnce([makePendingRecord()]);
        mockQuery.mockResolvedValueOnce([{ status: 'approved' }]);

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

        expect(data.access_token).toBeUndefined();
        expect(data.refresh_token).toBeUndefined();
      });

      it('should accept valid deny action', async () => {
        mockQuery.mockResolvedValueOnce([makePendingRecord()]);
        mockQuery.mockResolvedValueOnce([{ status: 'denied' }]);

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
        mockQuery.mockResolvedValueOnce([]);

        const request = new NextRequest('http://localhost/api/device/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: validCode }),
        });

        const response = await POST(request);
        expect(response.status).toBe(400);
      });

      it('should return 400 for expired code', async () => {
        mockQuery.mockResolvedValueOnce([
          makePendingRecord({ expires_at: new Date(Date.now() - 60_000).toISOString() }),
        ]);
        mockExecute.mockResolvedValueOnce(undefined);

        const request = new NextRequest('http://localhost/api/device/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: validCode }),
        });

        const response = await POST(request);
        expect(response.status).toBe(400);
      });

      it('should return 409 for already processed code', async () => {
        mockQuery.mockResolvedValueOnce([makePendingRecord({ status: 'approved' })]);

        const request = new NextRequest('http://localhost/api/device/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: validCode }),
        });

        const response = await POST(request);
        expect(response.status).toBe(409);
      });
    });

    describe('Approval Gates', () => {
      // The device code is minted by an unauthenticated caller, so these two
      // checks are the only place an account policy can be consulted. If either
      // stops refusing, a disabled account or one that never accepted the
      // current terms hands a long-lived session token to a device.
      it('refuses approval when the account has device sign-in turned off', async () => {
        mockIsDeviceCodeSignInEnabled.mockResolvedValueOnce(false);

        const request = new NextRequest('http://localhost/api/device/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: validCode, action: 'approve' }),
        });

        const response = await POST(request);
        expect(response.status).toBe(403);

        const data = await response.json();
        expect(data.error.code).toBe('DEVICE_SIGNIN_DISABLED');

        // Only the lookup ran: the code is left pending rather than approved
        // with a token written to it.
        expect(mockQuery).toHaveBeenCalledTimes(1);
        expect(mockHasAcceptedCurrentTerms).not.toHaveBeenCalled();
      });

      it('refuses approval until the current terms are accepted', async () => {
        mockHasAcceptedCurrentTerms.mockResolvedValueOnce(false);

        const request = new NextRequest('http://localhost/api/device/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: validCode, action: 'approve' }),
        });

        const response = await POST(request);
        expect(response.status).toBe(403);

        const data = await response.json();
        expect(data.error.code).toBe('TERMS_ACCEPTANCE_REQUIRED');
        expect(data.acceptanceUrl).toBe(
          `/login/complete?redirectTo=${encodeURIComponent(`/verify?code=${validCode}`)}`,
        );

        expect(mockQuery).toHaveBeenCalledTimes(1);
      });

      it('still lets the user deny a device when both gates are shut', async () => {
        // Denial is a rejection, not a grant: an account with device sign-in
        // switched off must still be able to turn away a code it was shown.
        mockIsDeviceCodeSignInEnabled.mockResolvedValue(false);
        mockHasAcceptedCurrentTerms.mockResolvedValue(false);

        mockQuery.mockResolvedValueOnce([makePendingRecord()]);
        mockQuery.mockResolvedValueOnce([{ status: 'denied' }]);

        const request = new NextRequest('http://localhost/api/device/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: validCode, action: 'deny' }),
        });

        const response = await POST(request);
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.status).toBe('denied');
        expect(mockIsDeviceCodeSignInEnabled).not.toHaveBeenCalled();
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
