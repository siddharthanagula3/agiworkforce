import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn().mockResolvedValue(null),
}));

const cookieWrites: Array<{ name: string; value: string }> = [];
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    set: (name: string, value: string) => {
      cookieWrites.push({ name, value });
    },
  })),
}));

const mockVerifyToken = vi.fn();
vi.mock('@clerk/backend', () => ({
  verifyToken: (...args: unknown[]) => mockVerifyToken(...args),
}));

process.env['CLERK_SECRET_KEY'] = 'test-clerk-secret-key';

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/auth/set-token/route';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/auth/set-token', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': 'ok' },
    body: JSON.stringify(body),
  });
}

describe('set-token route (Clerk)', () => {
  beforeEach(() => {
    cookieWrites.length = 0;
    mockVerifyToken.mockClear();
    mockVerifyToken.mockRejectedValue(new Error('invalid token'));
  });

  it('rejects empty body with 400', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(cookieWrites).toEqual([]);
  });

  it('rejects oversize access token with 400 (zod cap)', async () => {
    const huge = 'a'.repeat(5000);
    const res = await POST(makeRequest({ token: huge }));
    expect(res.status).toBe(400);
  });

  it('rejects oversize refresh token with 400 (zod cap)', async () => {
    const huge = 'b'.repeat(5000);
    const res = await POST(makeRequest({ refreshToken: huge }));
    expect(res.status).toBe(400);
  });

  it('rejects invalid access token with 401', async () => {
    mockVerifyToken.mockRejectedValue(new Error('invalid'));
    const res = await POST(makeRequest({ token: 'bogus-but-long-enough-token-1234' }));
    expect(res.status).toBe(401);
    expect(cookieWrites).toEqual([]);
  });

  it('refreshToken alone (no access_token) returns 400 — Clerk handles rotation internally', async () => {
    const res = await POST(makeRequest({ refreshToken: 'valid-refresh-token-1234567890' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(cookieWrites).toEqual([]);
    expect(mockVerifyToken).not.toHaveBeenCalled();
  });

  it('valid access token sets access cookie', async () => {
    mockVerifyToken.mockResolvedValue({ sub: 'user_abc123' });
    const res = await POST(makeRequest({ token: 'valid-clerk-access-token-1234567' }));
    expect(res.status).toBe(200);
    const accessCookie = cookieWrites.find((c) => c.name === 'agi_access_token');
    expect(accessCookie?.value).toBe('valid-clerk-access-token-1234567');
  });

  it('valid access token + refresh token sets BOTH cookies', async () => {
    mockVerifyToken.mockResolvedValue({ sub: 'user_abc123' });
    const res = await POST(
      makeRequest({
        token: 'access-token-1234567890abcdef',
        refreshToken: 'refresh-token-1234567890abcdef',
      }),
    );
    expect(res.status).toBe(200);
    const accessCookie = cookieWrites.find((c) => c.name === 'agi_access_token');
    const refreshCookie = cookieWrites.find((c) => c.name === 'agi_refresh_token');
    expect(accessCookie?.value).toBe('access-token-1234567890abcdef');
    expect(refreshCookie?.value).toBe('refresh-token-1234567890abcdef');
  });

  it('access-only path (no refresh) sets only access cookie', async () => {
    mockVerifyToken.mockResolvedValue({ sub: 'user_abc123' });
    const res = await POST(makeRequest({ token: 'access-token-1234567890abcdef' }));
    expect(res.status).toBe(200);
    const accessCookie = cookieWrites.find((c) => c.name === 'agi_access_token');
    expect(accessCookie?.value).toBe('access-token-1234567890abcdef');
    const refreshCookie = cookieWrites.find((c) => c.name === 'agi_refresh_token');
    expect(refreshCookie).toBeUndefined();
  });

  it('verifyToken is called once for the access token', async () => {
    mockVerifyToken.mockResolvedValue({ sub: 'user_abc123' });
    await POST(
      makeRequest({
        token: 'access-token-1234567890abcdef',
        refreshToken: 'refresh-token-1234567890abcdef',
      }),
    );
    expect(mockVerifyToken).toHaveBeenCalledTimes(1);
    expect(mockVerifyToken).toHaveBeenCalledWith('access-token-1234567890abcdef', {
      secretKey: 'test-clerk-secret-key',
    });
  });

  it('passes CLERK_AUTHORIZED_PARTIES to verifyToken so a foreign-origin token is rejected', async () => {
    vi.stubEnv(
      'CLERK_AUTHORIZED_PARTIES',
      'https://agiworkforce.com, https://app.agiworkforce.com',
    );
    try {
      mockVerifyToken.mockResolvedValue({ sub: 'user_abc123' });

      const res = await POST(makeRequest({ token: 'access-token-1234567890abcdef' }));

      expect(res.status).toBe(200);
      expect(mockVerifyToken).toHaveBeenCalledWith(
        'access-token-1234567890abcdef',
        expect.objectContaining({
          authorizedParties: ['https://agiworkforce.com', 'https://app.agiworkforce.com'],
        }),
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
