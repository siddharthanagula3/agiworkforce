import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  loggerInfo: vi.fn(),
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

describe('POST /api/auth/device/approve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
