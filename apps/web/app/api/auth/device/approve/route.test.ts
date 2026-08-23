import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  loggerInfo: vi.fn(),
  hasAcceptedCurrentTerms: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({
    userId: 'user_approved',
    email: 'approved@example.com',
  })),
}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
// Policy has its own suite (lib/server/__tests__/device-signin-policy.test.ts);
// mocked here so this file keeps asserting the approval flow rather than
// re-simulating a settings read.
vi.mock('@/lib/server/device-signin-policy', () => ({
  isDeviceCodeSignInEnabled: vi.fn(async () => true),
}));
vi.mock('@/lib/server/terms', () => ({
  hasAcceptedCurrentTerms: (...args: unknown[]) => mocks.hasAcceptedCurrentTerms(...args),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mocks.query(...args),
    execute: vi.fn(),
  })),
}));
vi.mock('@/lib/logger', () => ({
  logger: {
    info: (...args: unknown[]) => mocks.loggerInfo(...args),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { POST } from './route';
import { getClerkAuthUser } from '@/lib/api-auth';

describe('POST /api/auth/device/approve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasAcceptedCurrentTerms.mockResolvedValue(true);
    mocks.query
      .mockResolvedValueOnce([
        {
          device_id: '8cc8544f-7d36-4ec3-aae2-ce49740fa59c',
          status: 'pending',
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        },
      ])
      .mockResolvedValueOnce([{ status: 'approved' }]);
  });

  it('refuses to let a device credential approve another device', async () => {
    vi.mocked(getClerkAuthUser).mockResolvedValueOnce({
      userId: 'user_approved',
      surfaceClass: 'developer',
    });

    const response = await POST(
      new NextRequest('https://agiworkforce.com/api/auth/device/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_code: 'ABCD-2345' }),
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('logs only a derived device reference, never the poll secret', async () => {
    const response = await POST(
      new NextRequest('https://agiworkforce.com/api/auth/device/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_code: 'ABCD-2345' }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      {
        deviceRef: expect.stringMatching(/^[a-f0-9]{12}$/),
        userId: 'user_approved',
      },
      'Device code approved',
    );
    expect(JSON.stringify(mocks.loggerInfo.mock.calls)).not.toContain(
      '8cc8544f-7d36-4ec3-aae2-ce49740fa59c',
    );
  });

  it('does not approve a device for an account missing the current terms revision', async () => {
    mocks.hasAcceptedCurrentTerms.mockResolvedValue(false);

    const response = await POST(
      new NextRequest('https://agiworkforce.com/api/auth/device/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_code: 'ABCD-2345', surface: 'desktop' }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'TERMS_ACCEPTANCE_REQUIRED' },
      acceptanceUrl:
        '/login/complete?redirectTo=%2Fauth%2Fdevice%3Fuser_code%3DABCD-2345%26surface%3Ddesktop',
    });
    expect(mocks.query).toHaveBeenCalledOnce();
    expect(mocks.loggerInfo).not.toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user_approved' }),
      'Device code approved',
    );
  });
});
