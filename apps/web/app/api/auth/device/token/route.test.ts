import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mocks.query(...args),
    execute: vi.fn(),
  })),
}));
vi.mock('@/lib/server/developer-token', () => ({
  issueDeveloperToken: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { POST } from './route';

describe('POST /api/auth/device/token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
