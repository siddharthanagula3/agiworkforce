import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mockClerkAuth = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => mockClerkAuth(),
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn(() => null),
}));

const mockHasAcceptedCurrentTerms = vi.hoisted(() => vi.fn(async () => true));
// Policy has its own suite (lib/server/__tests__/device-signin-policy.test.ts).
// Mocked here so this file keeps testing the approval flow rather than also
// simulating a settings read.
vi.mock('@/lib/server/device-signin-policy', () => ({
  isDeviceCodeSignInEnabled: vi.fn(async () => true),
}));
vi.mock('@/lib/server/terms', () => ({
  hasAcceptedCurrentTerms: mockHasAcceptedCurrentTerms,
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

const mockQuery = vi.fn();
const mockExecute = vi.fn();

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (sql: string, params: unknown[]) => {
      if (typeof sql === 'string' && sql.includes('account_status')) {
        return Promise.resolve([]);
      }
      return mockQuery(sql, params);
    },
    execute: (...args: unknown[]) => mockExecute(...args),
  })),
}));

import { POST } from '@/app/api/auth/device/approve/route';

describe('Device code approve compatibility API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClerkAuth.mockResolvedValue({ userId: 'user_clerk_123' });
    mockExecute.mockResolvedValue(1);
  });

  it('approves CLI device codes against the Neon device_authorization_codes table', async () => {
    mockQuery
      .mockResolvedValueOnce([
        {
          device_id: 'cli-device-id',
          status: 'pending',
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        },
      ])
      .mockResolvedValueOnce([{ status: 'approved' }]);

    const response = await POST(
      new NextRequest('http://localhost/api/auth/device/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_code: 'ABCD-2345' }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      approved: true,
      status: 'approved',
    });

    expect(mockQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('FROM device_authorization_codes'),
      ['ABCD-2345'],
    );
    expect(mockQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE device_authorization_codes'),
      ['user_clerk_123', null, null, expect.any(String), 'cli-device-id'],
    );
  });

  it('refuses to approve a device until the current terms are accepted', async () => {
    mockHasAcceptedCurrentTerms.mockResolvedValueOnce(false);
    mockQuery.mockResolvedValueOnce([
      {
        device_id: 'cli-device-id',
        status: 'pending',
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
    ]);

    const response = await POST(
      new NextRequest('http://localhost/api/auth/device/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_code: 'ABCD-2345' }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'TERMS_ACCEPTANCE_REQUIRED' },
    });
    expect(
      mockQuery.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE device_authorization_codes'),
      ),
    ).toBe(false);
  });

  it('rejects invalid user-code formats before touching Neon', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/auth/device/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_code: 'not-valid' }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
