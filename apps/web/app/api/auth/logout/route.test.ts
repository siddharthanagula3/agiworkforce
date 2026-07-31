import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mocks.query(...args),
    execute: (...args: unknown[]) => mocks.execute(...args),
  })),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

process.env['JWT_SECRET'] = 'test-developer-jwt-secret-at-least-32-bytes';

import { POST } from './route';

describe('POST /api/auth/logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue([{ jti: 'logout-device-jti' }]);
    mocks.execute.mockResolvedValue(1);
  });

  it('revokes a verified developer token by jti and subject', async () => {
    const token = jwt.sign(
      {
        userId: 'device-user',
        sub: 'device-user',
        surface: 'developer',
      },
      process.env['JWT_SECRET']!,
      {
        expiresIn: 3600,
        issuer: 'agiworkforce-api-gateway',
        audience: 'agiworkforce',
        jwtid: 'logout-device-jti',
      },
    );

    const response = await POST(
      new NextRequest('https://api.agiworkforce.com/api/auth/logout', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'x-requested-with': 'XMLHttpRequest',
        },
        body: '{}',
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, revoked: true });
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO revoked_jwts'), [
      'logout-device-jti',
      'device-user',
      expect.stringMatching(/T/),
      'sign_out',
    ]);
  });

  it('revokes the rotating refresh family bound to the access token', async () => {
    const token = jwt.sign(
      {
        userId: 'device-user',
        sub: 'device-user',
        surface: 'developer',
        sid: '22222222-2222-4222-8222-222222222222',
      },
      process.env['JWT_SECRET']!,
      {
        expiresIn: 3600,
        issuer: 'agiworkforce-api-gateway',
        audience: 'agiworkforce',
        jwtid: 'logout-device-jti',
      },
    );

    const response = await POST(
      new NextRequest('https://api.agiworkforce.com/api/auth/logout', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'x-requested-with': 'XMLHttpRequest',
        },
        body: '{}',
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE device_refresh_tokens'),
      ['22222222-2222-4222-8222-222222222222'],
    );
  });
});
