import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
  issueDeveloperToken: vi.fn(),
  hasAcceptedCurrentTerms: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mocks.query(...args),
    execute: (...args: unknown[]) => mocks.execute(...args),
    transaction: (...args: unknown[]) => mocks.transaction(...args),
  })),
}));
vi.mock('@/lib/server/developer-token', () => ({
  issueDeveloperToken: (...args: unknown[]) => mocks.issueDeveloperToken(...args),
}));
vi.mock('@/lib/server/terms', () => ({
  hasAcceptedCurrentTerms: (...args: unknown[]) => mocks.hasAcceptedCurrentTerms(...args),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { POST } from './route';

describe('POST /api/auth/device/token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue(1);
    mocks.issueDeveloperToken.mockReturnValue({
      accessToken: 'device-access-token',
      expiresIn: 604800,
    });
    mocks.hasAcceptedCurrentTerms.mockResolvedValue(true);
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        query: (...args: unknown[]) => mocks.query(...args),
        execute: (...args: unknown[]) => mocks.execute(...args),
      }),
    );
    mocks.query.mockResolvedValue([
      {
        device_id: '0a9ae561-8447-4ce4-afca-1c205d69bbad',
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        status: 'pending',
        user_id: null,
        user_email: null,
      },
    ]);
  });

  it('atomically consumes approval and issues a rotating refresh credential', async () => {
    mocks.query
      .mockReset()
      .mockResolvedValueOnce([
        {
          device_id: '0a9ae561-8447-4ce4-afca-1c205d69bbad',
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          status: 'approved',
          user_id: 'user-1',
          user_email: 'user@example.com',
        },
      ])
      .mockResolvedValueOnce([{ status: 'consumed' }]);

    const response = await POST(
      new NextRequest('https://agiworkforce.com/api/auth/device/token', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://tauri.localhost',
        },
        body: JSON.stringify({ device_code: '0a9ae561-8447-4ce4-afca-1c205d69bbad' }),
      }),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body['access_token']).toBe('device-access-token');
    expect(body['refresh_token']).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.issueDeveloperToken).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        email: 'user@example.com',
        sessionFamilyId: expect.any(String),
      }),
    );
    const insertParams = mocks.execute.mock.calls[0]?.[1] as unknown[];
    expect(insertParams).not.toContain(body['refresh_token']);
    expect(insertParams[3]).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns pending status with CORS headers for the Tauri shell', async () => {
    const response = await POST(
      new NextRequest('https://agiworkforce.com/api/auth/device/token', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://tauri.localhost',
        },
        body: JSON.stringify({ device_code: '0a9ae561-8447-4ce4-afca-1c205d69bbad' }),
      }),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://tauri.localhost');
    await expect(response.json()).resolves.toEqual({ error: 'authorization_pending' });
  });

  it('does not issue a token when assent became stale after approval', async () => {
    mocks.query.mockResolvedValueOnce([
      {
        device_id: '0a9ae561-8447-4ce4-afca-1c205d69bbad',
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        status: 'approved',
        user_id: 'user-1',
        user_email: 'user@example.com',
      },
    ]);
    mocks.hasAcceptedCurrentTerms.mockResolvedValue(false);

    const response = await POST(
      new NextRequest('https://agiworkforce.com/api/auth/device/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://tauri.localhost' },
        body: JSON.stringify({ device_code: '0a9ae561-8447-4ce4-afca-1c205d69bbad' }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'terms_acceptance_required' });
    expect(mocks.issueDeveloperToken).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
