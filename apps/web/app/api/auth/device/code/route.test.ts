import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  query: vi.fn(),
  authUser: vi.fn(async () => ({
    userId: 'user-123',
    email: 'owner@example.com',
  })),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: () => mocks.authUser(),
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    execute: (...args: unknown[]) => mocks.execute(...args),
    query: (...args: unknown[]) => mocks.query(...args),
  })),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { GET, POST } from './route';

describe('POST /api/auth/device/code', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue(undefined);
    mocks.query.mockResolvedValue([]);
  });

  it('returns a complete verification URL using the approval page user_code parameter', async () => {
    const response = await POST(
      new NextRequest('https://agiworkforce.com/api/auth/device/code', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://tauri.localhost',
        },
        body: '{}',
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://tauri.localhost');
    const body = (await response.json()) as {
      user_code: string;
      verification_uri_complete: string;
    };
    expect(body.verification_uri_complete).toBe(
      `https://agiworkforce.com/auth/device?user_code=${encodeURIComponent(body.user_code)}&surface=cli`,
    );
    expect(body.verification_uri_complete).not.toContain('?code=');
  });
});

describe('GET /api/auth/device/code', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue(undefined);
    mocks.query.mockResolvedValue([]);
  });

  it('returns the server-owned client and requested scopes for a pending code', async () => {
    mocks.query.mockResolvedValueOnce([
      {
        device_name: 'untrusted reflected name',
        device_type: 'vscode',
        status: 'pending',
        expires_at: '2099-08-01T00:00:00.000Z',
      },
    ]);

    const response = await GET(
      new NextRequest('https://agiworkforce.com/api/auth/device/code?user_code=ABCD-2345', {
        method: 'GET',
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      user_code: 'ABCD-2345',
      client: { name: 'AGI for VS Code', type: 'vscode' },
      scopes: [
        {
          id: 'account:read',
          label: 'Account identity and plan',
          description: 'Read the account name, email, plan, and usage shown in this client.',
        },
        {
          id: 'managed-cloud:use',
          label: 'AGI Managed Cloud',
          description:
            'Use account-backed AGI Cloud features on this device, subject to plan and workspace permissions.',
        },
      ],
      expires_at: '2099-08-01T00:00:00.000Z',
    });
    expect(mocks.authUser).toHaveBeenCalledOnce();
  });

  it('does not disclose whether malformed or unknown codes exist', async () => {
    const malformed = await GET(
      new NextRequest('https://agiworkforce.com/api/auth/device/code?user_code=bad', {
        method: 'GET',
      }),
    );
    const unknown = await GET(
      new NextRequest('https://agiworkforce.com/api/auth/device/code?user_code=WXYZ-9876', {
        method: 'GET',
      }),
    );

    expect(malformed.status).toBe(400);
    expect(unknown.status).toBe(404);
    expect(mocks.authUser).toHaveBeenCalledTimes(2);
  });

  it('expires stale pending codes before returning consent details', async () => {
    mocks.query.mockResolvedValueOnce([
      {
        device_name: 'AGI Desktop',
        device_type: 'desktop',
        status: 'pending',
        expires_at: '2020-01-01T00:00:00.000Z',
      },
    ]);

    const response = await GET(
      new NextRequest('https://agiworkforce.com/api/auth/device/code?user_code=ABCD-2345', {
        method: 'GET',
      }),
    );

    expect(response.status).toBe(404);
    expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining("SET status = 'expired'"), [
      expect.any(String),
      'ABCD-2345',
    ]);
  });
});
