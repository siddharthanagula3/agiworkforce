import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { createError } from '@/lib/errors';
import { WEB_PAGE_URL_MAX_LENGTH } from '@agiworkforce/cloud-contracts';
import { rateLimitConfigs } from '@/lib/rate-limit';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), csrf: vi.fn(), limit: vi.fn(), read: vi.fn() }));
vi.mock('@/lib/server/rls-db', async (original) => ({
  ...(await original<ImportedModule0>()),
  getUserScopedDb: mocks.auth,
}));
vi.mock('@/lib/csrf', async (original) => ({
  ...(await original<ImportedModule1>()),
  requireCsrfToken: mocks.csrf,
}));
vi.mock('@/lib/rate-limit', async (original) => ({
  ...(await original<ImportedModule2>()),
  withRateLimit: mocks.limit,
}));
vi.mock('@/lib/url-fetch/url-fetch-tool', async (original) => ({
  ...(await original<ImportedModule3>()),
  executeUrlFetch: mocks.read,
}));
import { POST } from '../route';

const input = () =>
  new NextRequest('http://localhost:3000/api/page-context/read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com/' }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ userId: 'owner-a' });
  mocks.csrf.mockResolvedValue(null);
  mocks.limit.mockResolvedValue(null);
  mocks.read.mockResolvedValue({
    ok: true,
    url: 'https://example.com/',
    title: 'Example',
    content: 'Public text',
    truncated: false,
  });
});
describe('authenticated public page reads', () => {
  it('uses the existing guarded reader with the request abort signal', async () => {
    const request = input();
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mocks.read).toHaveBeenCalledWith(
      { url: 'https://example.com/' },
      expect.objectContaining({
        signal: request.signal,
        allowedContentTypes: ['text/html', 'text/plain', 'application/xhtml+xml'],
      }),
    );
    expect(mocks.limit).toHaveBeenCalledWith(request, 'page-read', 'user:owner-a');
    expect(rateLimitConfigs['page-read'].failClosed).toBe(true);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
  it('holds every account to a daily page-read allowance from configuration', async () => {
    const request = input();
    mocks.limit.mockImplementation(async (_request: unknown, key: string) =>
      key === 'page-read-account-day'
        ? NextResponse.json({ error: { code: 'RATE_LIMIT_EXCEEDED' } }, { status: 429 })
        : null,
    );

    const response = await POST(request);

    expect(response.status).toBe(429);
    expect(mocks.limit).toHaveBeenCalledWith(request, 'page-read-account-day', 'user:owner-a');
    expect(rateLimitConfigs['page-read-account-day']).toMatchObject({
      window: '1 d',
      failClosed: true,
    });
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('does not fetch for an unauthenticated caller', async () => {
    mocks.auth.mockRejectedValue(createError.unauthorized());
    expect((await POST(input())).status).toBe(401);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('does not fetch after a CSRF refusal', async () => {
    mocks.csrf.mockResolvedValue(NextResponse.json({ error: 'csrf' }, { status: 403 }));
    expect((await POST(input())).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('does not fetch when the shared rate limiter refuses', async () => {
    mocks.limit.mockResolvedValue(NextResponse.json({ error: 'unavailable' }, { status: 503 }));
    expect((await POST(input())).status).toBe(503);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('rejects extra input instead of forwarding arbitrary fetch options', async () => {
    const r = new NextRequest('http://localhost/api/page-context/read', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com/', headers: { cookie: 'private' } }),
    });
    expect((await POST(r)).status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('bounds the URL before calling the public reader', async () => {
    const request = new NextRequest('http://localhost/api/page-context/read', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com/' + 'x'.repeat(WEB_PAGE_URL_MAX_LENGTH) }),
    });
    expect((await POST(request)).status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it('preserves a guarded reader refusal as a typed result', async () => {
    mocks.read.mockResolvedValue({
      ok: false,
      errorCode: 'url_not_allowed',
      error: 'Private address refused',
    });
    const response = await POST(input());
    expect(await response.json()).toEqual({
      ok: false,
      errorCode: 'url_not_allowed',
      error: 'Private address refused',
    });
  });
});

type ImportedModule0 = typeof import('@/lib/server/rls-db');
type ImportedModule1 = typeof import('@/lib/csrf');
type ImportedModule2 = typeof import('@/lib/rate-limit');
type ImportedModule3 = typeof import('@/lib/url-fetch/url-fetch-tool');
