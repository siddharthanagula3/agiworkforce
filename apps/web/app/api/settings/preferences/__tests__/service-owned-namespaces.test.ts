import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const h = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  query: vi.fn(),
  txQuery: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getUserScopedDb: h.getUserScopedDb,
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<CsrfModule>()),
  requireCsrfToken: vi.fn(async () => null),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/request-context-cache', async (importOriginal) => ({
  ...(await importOriginal<RequestContextCacheModule>()),
  invalidateActiveOrganizationCache: vi.fn(),
  getCachedActiveOrganizationId: vi.fn(),
  setCachedActiveOrganizationId: vi.fn(),
}));

import { NextRequest } from 'next/server';
import { PUT } from '../route';

type RlsDbModule = typeof import('@/lib/server/rls-db');
type RateLimitModule = typeof import('@/lib/rate-limit');
type CsrfModule = typeof import('@/lib/csrf');
type LoggerModule = typeof import('@/lib/logger');
type RequestContextCacheModule = typeof import('@/lib/server/request-context-cache');

function put(body: unknown) {
  return new NextRequest('http://localhost:3000/api/settings/preferences', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function writeCalls() {
  return h.txQuery.mock.calls.filter((call) =>
    String(call[0]).includes('update public.user_settings'),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getUserScopedDb.mockResolvedValue({ db: { query: h.query, transaction: h.transaction }, userId: 'user-1' });
  h.query.mockImplementation(async () => { throw new Error('Unexpected outer query'); });
  h.transaction.mockImplementation(async (callback: (tx: { query: typeof h.txQuery }) => Promise<unknown>) =>
    callback({ query: h.txQuery }),
  );
  h.txQuery.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.includes('from public.user_settings') && sql.includes('for update')) {
      return [{ settings: {}, version: 'v1' }];
    }
    if (sql.includes('update public.user_settings')) {
      return [{ settings: JSON.parse(String(params[1])), version: 'v2' }];
    }
    throw new Error(`Unexpected transaction query: ${sql}`);
  });
});

describe('the preferences PUT leaves skill installs to the skills endpoint', () => {
  it.each([
    ['a namespace value', { namespace: 'skills', value: { installs: { junk: true } } }],
    ['a namespace patch', { namespace: 'skills', patch: { installs: { junk: true } } }],
    ['a whole-document write', { settings: { skills: { installs: { junk: true } } } }],
    [
      'a whole-document write beside other namespaces',
      { settings: { general: { theme: 'dark' }, skills: { installs: { junk: true } } } },
    ],
  ])('refuses %s that targets the skills namespace and writes nothing', async (_label, body) => {
    const response = await PUT(put(body));
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error?: { message?: string } };
    expect(JSON.stringify(payload)).toContain('skills');
    expect(h.query).not.toHaveBeenCalled();
    expect(h.txQuery).not.toHaveBeenCalled();
    expect(h.transaction).not.toHaveBeenCalled();
    expect(writeCalls()).toHaveLength(0);
  });

  it('still saves other namespaces', async () => {
    const response = await PUT(put({ namespace: 'general', patch: { theme: 'dark' } }));
    expect(response.status).toBe(200);
    expect(writeCalls()).toHaveLength(1);
  });
});
