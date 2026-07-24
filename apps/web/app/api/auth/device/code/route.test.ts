import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({ execute: (...args: unknown[]) => mocks.execute(...args) })),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { POST } from './route';

describe('POST /api/auth/device/code', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue(undefined);
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
